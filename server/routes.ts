import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from 'ws';
import { db } from "@db";
import { aiService } from "./services/ai";
import { messages, users } from "@db/schema"; 
import session from 'express-session';
import passport from 'passport';
import type { Message } from "@db/schema";
import multer from "multer";
import { randomBytes } from "crypto";
import path from "path";
import fs from "fs/promises";
import express from "express";
import crypto from 'crypto';
import { sendPasswordResetEmail, generateResetToken } from './utils/email';
import { channels, channelMembers, channelInvites, messageReactions, friendRequests, friends, directMessageChannels, messageReads, messageAttachments } from "@db/schema";
import { eq, and, ne, ilike, or, inArray, desc, gt, sql, not } from "drizzle-orm";
import { voiceService } from "./services/voice";

interface ExtendedWebSocket extends WebSocket {
  userId?: number;
  sessionId?: string;
  isAlive?: boolean;
}

interface WebSocketMessageType {
  type: 'message' | 'status_update' | 'typing' | 'ai_status';
  content?: string;
  channelId?: number;
  userId?: number;
  isOnline?: boolean;
  hideActivity?: boolean;
  status?: 'thinking';
}

async function getUnreadMessageCounts(userId: number) {
  const userChannels = await db.query.channelMembers.findMany({
    where: eq(channelMembers.userId, userId),
    with: {
      channel: true
    }
  });

  const unreadCounts = await Promise.all(
    userChannels.map(async ({ channel }) => {
      const latestRead = await db
        .select({
          messageId: messageReads.messageId,
          channelId: messages.channelId
        })
        .from(messageReads)
        .innerJoin(messages, eq(messageReads.messageId, messages.id))
        .where(and(
          eq(messageReads.userId, userId),
          eq(messages.channelId, channel.id)
        ))
        .orderBy(desc(messageReads.readAt))
        .limit(1);

      const unreadCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(messages)
        .where(and(
          eq(messages.channelId, channel.id),
          ne(messages.userId, userId),
          latestRead.length > 0
            ? gt(messages.id, latestRead[0].messageId)
            : sql`TRUE`
        ));

      return {
        channelId: channel.id,
        unreadCount: Number(unreadCount[0]?.count || 0)
      };
    })
  );

  return unreadCounts;
}

const upload = multer({
  storage: multer.diskStorage({
    destination: "./uploads",
    filename: (_req, file, cb) => {
      const uniqueSuffix = randomBytes(16).toString("hex");
      cb(null, `${uniqueSuffix}${path.extname(file.originalname)}`);
    },
  }),
});

(async () => {
  await fs.mkdir("./uploads", { recursive: true });
})();


export function registerRoutes(app: Express): Server {
  const httpServer = createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  const pingInterval = setInterval(() => {
    wss.clients.forEach((ws: ExtendedWebSocket) => {
      if (ws.isAlive === false) {
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(pingInterval);
  });

  // Handle WebSocket connection upgrade
  httpServer.on('upgrade', (request, socket, head) => {
    if (request.headers['sec-websocket-protocol'] === 'vite-hmr') {
      return;
    }

    // Parse the session from the request
    const sessionParser = session({
      secret: 'your-secret-key',
      resave: false,
      saveUninitialized: true,
      cookie: { secure: false }
    });

    sessionParser(request as any, {} as any, () => {
      // @ts-ignore - passport.session() types are not complete
      passport.session()(request as any, {} as any, () => {
        if (!(request as any).user) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }

        wss.handleUpgrade(request, socket, head, (ws) => {
          const extWs = ws as ExtendedWebSocket;
          extWs.userId = (request as any).user.id;
          extWs.sessionId = (request as any).sessionID;
          extWs.isAlive = true;
          wss.emit('connection', extWs, request);
        });
      });
    });
  });

  // Handle WebSocket messages
  wss.on('connection', (ws: ExtendedWebSocket) => {
    ws.isAlive = true;

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString()) as WebSocketMessageType;

        switch (message.type) {
          case 'message': {
            const userId = ws.userId;
            if (!userId) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Not authenticated',
              }));
              return;
            }

            // Handle AI channel messages
            if (message.channelId === -1) {
              try {
                // Save user's message first
                const [userMessage] = await db.insert(messages)
                  .values({
                    content: message.content!,
                    channelId: message.channelId,
                    userId: userId,
                    isAIMessage: false
                  })
                  .returning();

                // Send initial AI thinking status
                ws.send(JSON.stringify({
                  type: 'ai_status',
                  status: 'thinking'
                }));

                // Process message with AI service and pass userId for context
                const aiResponse = await aiService.processMessage(message.content!, userId);

                // Create AI message in database
                const [aiMessage] = await db.insert(messages)
                  .values({
                    content: aiResponse,
                    channelId: message.channelId,
                    userId: -1, // Special AI user ID
                    isAIMessage: true
                  })
                  .returning();

                // Send AI response back through WebSocket
                const response = {
                  type: 'message',
                  channelId: message.channelId,
                  message: {
                    ...aiMessage,
                    user: {
                      id: -1,
                      username: 'AI Assistant',
                      avatarUrl: null
                    }
                  }
                };

                ws.send(JSON.stringify(response));
              } catch (error) {
                console.error('Error processing AI message:', error);
                ws.send(JSON.stringify({
                  type: 'error',
                  message: 'Failed to process message'
                }));
              }
            } else {
              // Handle regular messages
              const [newMessage] = await db.insert(messages)
                .values({
                  content: message.content!,
                  channelId: message.channelId!,
                  userId: userId,
                })
                .returning();

              const fullMessage = await db.query.messages.findFirst({
                where: eq(messages.id, newMessage.id),
                with: {
                  user: {
                    columns: {
                      id: true,
                      username: true,
                      avatarUrl: true,
                    }
                  }
                }
              });

              // Broadcast to all clients except sender
              wss.clients.forEach((client: ExtendedWebSocket) => {
                if (client.readyState === WebSocket.OPEN && client.sessionId !== ws.sessionId) {
                  client.send(JSON.stringify({
                    type: 'message',
                    channelId: message.channelId,
                    message: fullMessage
                  }));
                }
              });
            }
            break;
          }

          case 'typing': {
            if (message.channelId) {
              wss.clients.forEach((client: ExtendedWebSocket) => {
                if (client.readyState === WebSocket.OPEN && client.sessionId !== ws.sessionId) {
                  client.send(JSON.stringify({
                    type: 'typing',
                    channelId: message.channelId,
                    userId: ws.userId
                  }));
                }
              });
            }
            break;
          }
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Failed to process message',
        }));
      }
    });

    ws.on('close', () => {
      ws.isAlive = false;
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      ws.terminate();
    });
  });

  app.get("/api/user", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const [user] = await db
        .select({
          id: users.id,
          username: users.username,
          avatarUrl: users.avatarUrl,
          isOnline: users.isOnline,
          createdAt: users.createdAt
        })
        .from(users)
        .where(eq(users.id, req.user.id))
        .limit(1);

      if (!user) {
        return res.status(404).send("User not found");
      }

      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).send("Error fetching user");
    }
  });

  app.put("/api/user/profile", upload.single('files'), async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const updateData: any = {};

      if (req.file) {
        // Use the full URL path for the avatar
        updateData.avatarUrl = `/uploads/${req.file.filename}`;
      }

      // Check if username exists when updating username
      if (req.body.username && req.body.username !== req.user.username) {
        const [existingUser] = await db
          .select()
          .from(users)
          .where(eq(users.username, req.body.username))
          .limit(1);

        if (existingUser) {
          return res.status(400).send("Username already exists");
        }
      }

      // Handle fields with proper validation
      const fields = ['username', 'city', 'timezone', 'hideActivity'];
      fields.forEach(field => {
        if (req.body[field] !== undefined) {
          if (field === 'hideActivity') {
            updateData[field] = req.body[field] === 'true';
          } else {
            updateData[field] = req.body[field];
          }
        }
      });

      // Handle age field separately with validation
      if (req.body.age !== undefined && req.body.age !== '') {
        const age = parseInt(req.body.age);
        if (!isNaN(age) && age >= 0) {
          updateData.age = age;
        }
      }

      if (Object.keys(updateData).length === 0) {
        return res.status(400).send("No valid update data provided");
      }

      const [updatedUser] = await db
        .update(users)
        .set(updateData)
        .where(eq(users.id, req.user.id))
        .returning();

      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating user profile:", error);
      res.status(500).send("Error updating user profile");
    }
  });

  app.put("/api/user/status", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const { hideActivity } = req.body;
    if (typeof hideActivity !== 'boolean') {
      return res.status(400).send("Invalid hideActivity value");
    }

    try {
      const [updatedUser] = await db
        .update(users)
        .set({
          hideActivity,
          isOnline: true,
          lastActive: new Date()
        })
        .where(eq(users.id, req.user.id))
        .returning();

      res.json(updatedUser);

      const statusUpdate = {
        type: 'status_update',
        userId: updatedUser.id,
        hideActivity: updatedUser.hideActivity,
        isOnline: updatedUser.isOnline
      };

      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(statusUpdate));
        }
      });
    } catch (error) {
      console.error("Error updating user status:", error);
      res.status(500).send("Error updating user status");
    }
  });

  app.get("/api/users/search", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const query = req.query.q as string;
    if (!query || query.length < 2) {
      return res.json([]);
    }

    try {
      const userFriends = await db
        .select({
          friendId: users.id
        })
        .from(friends)
        .leftJoin(users, or(
          and(
            eq(friends.user1Id, req.user.id),
            eq(users.id, friends.user2Id)
          ),
          and(
            eq(friends.user2Id, req.user.id),
            eq(users.id, friends.user1Id)
          )
        ))
        .where(or(
          eq(friends.user1Id, req.user.id),
          eq(friends.user2Id, req.user.id)
        ));

      const friendIds = new Set(userFriends.map(f => f.friendId));

      const searchResults = await db
        .select({
          id: users.id,
          username: users.username,
          avatarUrl: users.avatarUrl,
        })
        .from(users)
        .where(and(
          ilike(users.username, `%${query}%`),
          ne(users.id, req.user.id)
        ))
        .limit(10);

      const resultsWithFriendStatus = searchResults.map(user => ({
        ...user,
        isFriend: friendIds.has(user.id)
      }));

      res.json(resultsWithFriendStatus);
    } catch (error) {
      console.error("Error searching users:", error);
      res.status(500).send("Error searching users");
    }
  });

  app.post("/api/channels/:channelId/invites", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const channelId = parseInt(req.params.channelId);
    const { userId } = req.body;

    if (isNaN(channelId) || !userId) {
      return res.status(400).send("Invalid channel ID or user ID");
    }

    try {
      const [membership] = await db
        .select()
        .from(channelMembers)
        .where(and(
          eq(channelMembers.channelId, channelId),
          eq(channelMembers.userId, req.user.id)
        ))
        .limit(1);

      if (!membership) {
        return res.status(403).send("You are not a member of this channel");
      }

      // Check if the user is already a member of the channel
      const [existingMembership] = await db
        .select()
        .from(channelMembers)
        .where(and(
          eq(channelMembers.channelId, channelId),
          eq(channelMembers.userId, userId)
        ))
        .limit(1);

      if (existingMembership) {
        return res.status(400).send("User is already a member of this channel");
      }

      const [existingInvite] = await db
        .select()
        .from(channelInvites)
        .where(and(
          eq(channelInvites.channelId, channelId),
          eq(channelInvites.receiverId, userId),
          eq(channelInvites.status, 'pending')
        ))
        .limit(1);

      if (existingInvite) {
        return res.status(400).send("Invite already sent");
      }

      const [invite] = await db
        .insert(channelInvites)
        .values({
          channelId,
          senderId: req.user.id,
          receiverId: userId,
          status: 'pending'
        })
        .returning();

      res.json(invite);
    } catch (error) {
      console.error("Error creating channel invite:", error);
      res.status(500).send("Error creating channel invite");
    }
  });

  app.get("/api/channel-invites", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const invites = await db.query.channelInvites.findMany({
        where: and(
          eq(channelInvites.receiverId, req.user.id),
          eq(channelInvites.status, 'pending')
        ),
        with: {
          channel: true,
          sender: {
            columns: {
              id: true,
              username: true,
              avatarUrl: true
            }
          }
        }
      });

      res.json(invites);
    } catch (error) {
      console.error("Error fetching channel invites:", error);
      res.status(500).send("Error fetching channel invites");
    }
  });

  app.put("/api/channel-invites/:inviteId", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const inviteId = parseInt(req.params.inviteId);
    const { status } = req.body;

    if (isNaN(inviteId) || !['accepted', 'rejected'].includes(status)) {
      return res.status(400).send("Invalid invite ID or status");
    }

    try {
      const [invite] = await db
        .select()
        .from(channelInvites)
        .where(and(
          eq(channelInvites.id, inviteId),
          eq(channelInvites.receiverId, req.user.id),
          eq(channelInvites.status, 'pending')
        ))
        .limit(1);

      if (!invite) {
        return res.status(404).send("Invite not found");
      }

      await db
        .update(channelInvites)
        .set({ status })
        .where(eq(channelInvites.id, inviteId));

      if (status === 'accepted') {
        await db
          .insert(channelMembers)
          .values({
            channelId: invite.channelId,
            userId: req.user.id
          });
      }

      res.json({ message: `Invite ${status}` });
    } catch (error) {
      console.error("Error handling channel invite:", error);
      res.status(500).send("Error handling channel invite");
    }
  });

  app.get("/api/channels", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const userChannels = await db.query.channelMembers.findMany({
      where: eq(channelMembers.userId, req.user.id),
      with: {
        channel: true
      }
    });

    const unreadCounts = await getUnreadMessageCounts(req.user.id);

    const channelsWithUnread = userChannels.map(uc => ({
      ...uc.channel,
      unreadCount: unreadCounts.find(c => c.channelId === uc.channel.id)?.unreadCount || 0
    }));

    res.json(channelsWithUnread);
  });

  app.post("/api/channels", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const { name, description } = req.body;
    const [channel] = await db.insert(channels)
      .values({ name, description })
      .returning();

    await db.insert(channelMembers)
      .values({ channelId: channel.id, userId: req.user.id });

    res.json(channel);
  });

  app.get("/api/channels/:channelId/messages", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const channelId = parseInt(req.params.channelId);
    const parentId = req.query.parentId ? parseInt(req.query.parentId as string) : undefined;

    if (isNaN(channelId)) {
      return res.status(400).send("Invalid channel ID");
    }

    try {
      const whereClause = parentId !== undefined
        ? and(eq(messages.channelId, channelId), eq(messages.parentId, parentId))
        : and(eq(messages.channelId, channelId), sql`${messages.parentId} IS NULL`);

      const channelMessages = await db.query.messages.findMany({
        where: whereClause,
        with: {
          user: {
            columns: {
              id: true,
              username: true,
              avatarUrl: true,
            }
          },
          reactions: {
            with: {
              user: {
                columns: {
                  id: true,
                  username: true,
                  avatarUrl: true,
                }
              }
            }
          },
          reads: {
            with: {
              user: {
                columns: {
                  id: true,
                  username: true,
                  avatarUrl: true,
                }
              }
            }
          },
        },
        orderBy: (messages, { asc }) => [asc(messages.createdAt)]
      });

      res.json(channelMessages);
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).send("Error fetching messages");
    }
  });

  app.get("/api/messages/search", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const query = req.query.q as string;
    const channelId = req.query.channelId ? parseInt(req.query.channelId as string) : undefined;

    if (!query || query.length < 2) {
      return res.json([]);
    }

    try {
      const userChannels = await db
        .select({ channelId: channelMembers.channelId })
        .from(channelMembers)
        .where(eq(channelMembers.userId, req.user.id));

      const channelIds = userChannels.map(uc => uc.channelId);

      const searchResults = await db.query.messages.findMany({
        where: and(
          ilike(messages.content, `%${query}%`),
          channelId
            ? eq(messages.channelId, channelId)
            : inArray(messages.channelId, channelIds)
        ),
        with: {
          user: {
            columns: {
              id: true,
              username: true,
              avatarUrl: true,
            }
          },
          channel: true
        },
        orderBy: (messages, { desc }) => [desc(messages.createdAt)],
        limit: 50
      });

      res.json(searchResults);
    } catch (error) {
      console.error("Error searching messages:", error);
      res.status(500).send("Error searching messages");
    }
  });

  app.post("/api/messages/:messageId/reactions", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const messageId = parseInt(req.params.messageId);
    const { emoji } = req.body;

    if (isNaN(messageId) || !emoji) {
      return res.status(400).send("Invalid message ID or emoji");
    }

    try {
      const [existingReaction] = await db
        .select()
        .from(messageReactions)
        .where(and(
          eq(messageReactions.messageId, messageId),
          eq(messageReactions.userId, req.user.id),
          eq(messageReactions.emoji, emoji)
        ))
        .limit(1);

      if (existingReaction) {
        await db
          .delete(messageReactions)
          .where(eq(messageReactions.id, existingReaction.id));
      } else {
        await db
          .insert(messageReactions)
          .values({
            messageId,
            userId: req.user.id,
            emoji
          });
      }

      const updatedMessage = await db.query.messages.findFirst({
        where: eq(messages.id, messageId),
        with: {
          user: true,
          reactions: {
            with: {
              user: true
            }
          }
        }
      });

      res.json(updatedMessage);
    } catch (error) {
      console.error("Error handling message reaction:", error);
      res.status(500).send("Error handling message reaction");
    }
  });

  app.post("/api/friend-requests", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const { receiverId } = req.body;

    if (!receiverId) {
      return res.status(400).send("Invalid receiver ID");
    }

    try {
      const [existingRequest] = await db
        .select()
        .from(friendRequests)
        .where(and(
          eq(friendRequests.senderId, req.user.id),
          eq(friendRequests.receiverId, receiverId),
          eq(friendRequests.status, 'pending')
        ))
        .limit(1);

      if (existingRequest) {
        return res.status(400).send("Friend request already sent");
      }

      const [request] = await db
        .insert(friendRequests)
        .values({
          senderId: req.user.id,
          receiverId,
          status: 'pending'
        })
        .returning();

      res.json(request);
    } catch (error) {
      console.error("Error creating friend request:", error);
      res.status(500).send("Error creating friend request");
    }
  });

  app.get("/api/friend-requests", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const requests = await db.query.friendRequests.findMany({
        where: and(
          eq(friendRequests.receiverId, req.user.id),
          eq(friendRequests.status, 'pending')
        ),
        with: {
          sender: {
            columns: {
              id: true,
              username: true,
              avatarUrl: true
            }
          }
        }
      });

      res.json(requests);
    } catch (error) {
      console.error("Error fetching friend requests:", error);
      res.status(500).send("Error fetching friend requests");
    }
  });

  app.get("/api/direct-messages", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const userId = req.user.id;
      const directChannels = await db.query.directMessageChannels.findMany({
        where: or(
          eq(directMessageChannels.user1Id, userId),
          eq(directMessageChannels.user2Id, userId)
        ),
        with: {
          channel: true,
          user1: {
            columns: {
              id: true,
              username: true,
              avatarUrl: true,
              isOnline: true,
              hideActivity: true
            }
          },
          user2: {
            columns: {
              id: true,
              username: true,
              avatarUrl: true,
              isOnline: true,
              hideActivity: true
            }
          }
        }
      });

      const unreadCounts = await Promise.all(
        directChannels.map(async (dc) => {
          const latestRead = await db
            .select({
              messageId: messageReads.messageId,
              channelId: messages.channelId
            })
            .from(messageReads)
            .innerJoin(messages, eq(messageReads.messageId, messages.id))
            .where(and(
              eq(messageReads.userId, userId),
              eq(messages.channelId, dc.channelId)
            ))
            .orderBy(desc(messageReads.readAt))
            .limit(1);

          const unreadCount = await db
            .select({ count: sql<number>`count(*)` })
            .from(messages)
            .where(and(
              eq(messages.channelId, dc.channelId),
              ne(messages.userId, userId),
              latestRead.length > 0
                ? gt(messages.id, latestRead[0].messageId)
                : sql`TRUE`
            ));

          return {
            channelId: dc.channelId,
            unreadCount: Number(unreadCount[0]?.count || 0)
          };
        })
      );

      const formattedChannels = directChannels.map(dc => ({
        ...dc.channel,
        otherUser: dc.user1.id === userId ? dc.user2 : dc.user1,
        unreadCount: unreadCounts.find(uc => uc.channelId === dc.channelId)?.unreadCount || 0
      }));

      res.json(formattedChannels);
    } catch (error) {
      console.error("Error fetching direct messages:", error);
      res.status(500).send("Error fetching direct messages");
    }
  });

  app.put("/api/friend-requests/:requestId", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const requestId = parseInt(req.params.requestId);
    const { status } = req.body;

    if (isNaN(requestId) || !['accepted', 'rejected'].includes(status)) {
      return res.status(400).send("Invalid request ID or status");
    }

    try {
      const [request] = await db
        .select()
        .from(friendRequests)
        .where(and(
          eq(friendRequests.id, requestId),
          eq(friendRequests.receiverId, req.user.id),
          eq(friendRequests.status, 'pending')
        ))
        .limit(1);

      if (!request) {
        return res.status(404).send("Friend request not found");
      }

      await db
        .update(friendRequests)
        .set({ status })
        .where(eq(friendRequests.id, requestId));

      if (status === 'accepted') {
        // Add to friends list
        await db
          .insert(friends)
          .values({
            user1Id: request.senderId,
            user2Id: req.user.id
          });

        // Check if DM channel already exists
        const existingDM = await db.query.directMessageChannels.findFirst({
          where: or(
            and(
              eq(directMessageChannels.user1Id, request.senderId),
              eq(directMessageChannels.user2Id, req.user.id)
            ),
            and(
              eq(directMessageChannels.user1Id, req.user.id),
              eq(directMessageChannels.user2Id, request.senderId)
            )
          ),
        });

        if (!existingDM) {
          // Create a DM channel
          const [dmChannel] = await db
            .insert(channels)
            .values({
              name: `DM-${request.senderId}-${req.user.id}`,
              isDirectMessage: true,
              description: "Direct Message Channel"
            })
            .returning();

          // Create the direct message channel relationship
          await db
            .insert(directMessageChannels)
            .values({
              user1Id: request.senderId,
              user2Id: req.user.id,
              channelId: dmChannel.id,
            });

          // Add both users as channel members
          await db.insert(channelMembers).values([
            {
              userId: request.senderId,
              channelId: dmChannel.id,
            },
            {
              userId: req.user.id,
              channelId: dmChannel.id,
            },
          ]);
        }

        // Get friend's details for the response
        const [friend] = await db
          .select({
            id: users.id,
            username: users.username,
            avatarUrl: users.avatarUrl,
            isOnline: users.isOnline,
            hideActivity: users.hideActivity
          })
          .from(users)
          .where(eq(users.id, request.senderId))
          .limit(1);
        res.json({
          message: "Friend request accepted",
          friend
        });
      } else {
        res.json({ message: "Friend request rejected" });
      }
    } catch (error) {
      console.error("Error handling friend request:", error);
      res.status(500).send("Error handling friend request");
    }
  });

  app.get("/api/friends", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      // Get all friends with their details
      const userFriends = await db
        .select({
          id: users.id,
          username: users.username,
          avatarUrl: users.avatarUrl,
          isOnline: users.isOnline,
          hideActivity: users.hideActivity,
          lastActive: users.lastActive,
        })
        .from(friends)
        .leftJoin(users, or(
          and(
            eq(friends.user1Id, req.user.id),
            eq(users.id, friends.user2Id)
          ),
          and(
            eq(friends.user2Id, req.user.id),
            eq(users.id, friends.user1Id)
          )
        ))
        .where(or(
          eq(friends.user1Id, req.user.id),
          eq(friends.user2Id, req.user.id)
        ));

      // For each friend, ensure there's a DM channel
      for (const friend of userFriends) {
        // Check if DM channel exists
        const existingDM = await db.query.directMessageChannels.findFirst({
          where: or(
            and(
              eq(directMessageChannels.user1Id, req.user.id),
              eq(directMessageChannels.user2Id, friend.id)
            ),
            and(
              eq(directMessageChannels.user1Id, friend.id),
              eq(directMessageChannels.user2Id, req.user.id)
            )
          ),
        });

        if (!existingDM) {
          // Create a new DM channel
          const [dmChannel] = await db
            .insert(channels)
            .values({
              name: `DM-${req.user.id}-${friend.id}`,
              isDirectMessage: true,
              description: "Direct Message Channel"
            })
            .returning();

          // Create the direct message channel relationship
          await db
            .insert(directMessageChannels)
            .values({
              user1Id: req.user.id,
              user2Id: friend.id,
              channelId: dmChannel.id,
            });

          // Add both users as channel members
          await db.insert(channelMembers).values([
            {
              userId: req.user.id,
              channelId: dmChannel.id,
            },
            {
              userId: friend.id,
              channelId: dmChannel.id,
            },
          ]);
        }
      }

      res.json(userFriends);
    } catch (error) {
      console.error("Error fetching friends:", error);
      res.status(500).send("Error fetching friends");
    }
  });

  app.get("/api/friends/search", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const query = req.query.q as string;
    if (!query || query.length < 2) {
      return res.json([]);
    }

    try {
      const searchResults = await db
        .select({
          id: users.id,
          username: users.username,
          avatarUrl: users.avatarUrl,
        })
        .from(users)
        .where(ilike(users.username, `%${query}%`))
        .limit(10);

      res.json(searchResults);
    } catch (error) {
      console.error("Error searching friends:", error);
      res.status(500).send("Error searching friends");
    }
  });

  app.delete("/api/friends/:friendId", async (req, res) => {
    const friendId = parseInt(req.params.friendId);
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    if (isNaN(friendId)) {
      return res.status(400).send("Invalid friend ID");
    }

    try {
      // Find the direct message channel between these users
      const [dmChannel] = await db
        .select()
        .from(directMessageChannels)
        .where(
          or(
            and(
              eq(directMessageChannels.user1Id, req.user.id),
              eq(directMessageChannels.user2Id, friendId)
            ),
            and(
              eq(directMessageChannels.user1Id, friendId),
              eq(directMessageChannels.user2Id, req.user.id)
            )
          )
        )
        .limit(1);

      if (dmChannel) {
        // Get all message IDs in this channel
        const messageIds = await db
          .select({ id: messages.id })
          .from(messages)
          .where(eq(messages.channelId, dmChannel.channelId));

        const messageIdArray = messageIds.map(m => m.id);

        if (messageIdArray.length > 0) {
          // First delete message reactions
          await db
            .delete(messageReactions)
            .where(inArray(messageReactions.messageId, messageIdArray));

          // Then delete message reads
          await db
            .delete(messageReads)
            .where(inArray(messageReads.messageId, messageIdArray));

          // Then delete message attachments
          await db
            .delete(messageAttachments)
            .where(inArray(messageAttachments.messageId, messageIdArray));
        }

        // Delete all messages in the channel
        await db
          .delete(messages)
          .where(eq(messages.channelId, dmChannel.channelId));

        // Delete the direct message channel record
        await db
          .delete(directMessageChannels)
          .where(eq(directMessageChannels.id, dmChannel.id));

        // Finally delete the channel itself
        await db
          .delete(channels)
          .where(eq(channels.id, dmChannel.channelId));
      }

      // Remove the friend relationship
      await db
        .delete(friends)
        .where(
          or(
            and(
              eq(friends.user1Id, req.user.id),
              eq(friends.user2Id, friendId)
            ),
            and(
              eq(friends.user1Id, friendId),
              eq(friends.user2Id, req.user.id)
            )
          )
        );

      res.json({ message: "Friend removed successfully" });
    } catch (error) {
      console.error("Error removing friend:", error);
      res.status(500).send("Error removing friend");
    }
  });

  app.post("/api/direct-messages/create", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const { friendId } = req.body;
    if (!friendId) {
      return res.status(400).send("Friend ID is required");
    }

    try {
      // Check if users are friends
      const [friendship] = await db
        .select()
        .from(friends)
        .where(or(
          and(
            eq(friends.user1Id, req.user.id),
            eq(friends.user2Id, friendId)
          ),
          and(
            eq(friends.user1Id, friendId),
            eq(friends.user2Id, req.user.id)
          )
        ))
        .limit(1);

      if (!friendship) {
        return res.status(403).send("Users are not friends");
      }

      // Check if DM channel already exists
      const [existingChannel] = await db
        .select({
          channelId: directMessageChannels.channelId
        })
        .from(directMessageChannels)
        .where(or(
          and(
            eq(directMessageChannels.user1Id, req.user.id),
            eq(directMessageChannels.user2Id, friendId)
          ),
          and(
            eq(directMessageChannels.user1Id, friendId),
            eq(directMessageChannels.user2Id, req.user.id)
          )
        ))
        .limit(1);

      if (existingChannel) {
        return res.json({ channelId: existingChannel.channelId });
      }

      // Create new channel and DM relationship
      const [channel] = await db
        .insert(channels)
        .values({
          name: 'Direct Message',
          isDirectMessage: true
        })
        .returning();

      await db
        .insert(directMessageChannels)
        .values({
          channelId: channel.id,
          user1Id: req.user.id,
          user2Id: friendId
        });

      await db.insert(channelMembers).values([
        { channelId: channel.id, userId: req.user.id },
        { channelId: channel.id, userId: friendId }
      ]);

      res.json({ channelId: channel.id });
    } catch (error) {
      console.error("Error creating/fetching direct message channel:", error);
      res.status(500).send("Error creating/fetching direct message channel");
    }
  });

  app.get("/api/direct-messages/channel", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const friendId = parseInt(req.query.friendId as string);
    if (isNaN(friendId)) {
      return res.status(400).send("Invalid friend ID");
    }

    try {
      // Find existing direct message channel
      const [existingDM] = await db
        .select({
          channelId: directMessageChannels.channelId
        })
        .from(directMessageChannels)
        .where(or(
          and(
            eq(directMessageChannels.user1Id, req.user.id),
            eq(directMessageChannels.user2Id, friendId)
          ),
          and(
            eq(directMessageChannels.user1Id, friendId),
            eq(directMessageChannels.user2Id, req.user.id)
          )
        ))
        .limit(1);

      if (!existingDM) {
        return res.status(404).send("Direct message channel not found");
      }

      res.json({ channelId: existingDM.channelId });
    } catch (error) {
      console.error("Error fetching direct message channel:", error);
      res.status(500).send("Error fetching direct message channel");
    }
  });

  app.get("/api/friends/recommendations", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      // First, get user's current friends
      const userFriends = await db
        .select({
          friendId: users.id
        })
        .from(friends)
        .leftJoin(users, or(
          and(
            eq(friends.user1Id, req.user.id),
            eq(users.id, friends.user2Id)
          ),
          and(
            eq(friends.user2Id, req.user.id),
            eq(users.id, friends.user1Id)
          )
        ))
        .where(or(
          eq(friends.user1Id, req.user.id),
          eq(friends.user2Id, req.user.id)
        ));

      // If user has no friends, return empty array
      if (userFriends.length === 0) {
        return res.json([]);
      }

      const friendIds = userFriends.map(f => f.friendId);

      // Get friends of friends
      const friendsOfFriends = await db
        .select({
          recommendedUserId: users.id
        })
        .from(friends)
        .leftJoin(users, or(
          eq(users.id, friends.user1Id),
          eq(users.id, friends.user2Id)
        ))
        .where(
          and(
            or(
              inArray(friends.user1Id, friendIds),
              inArray(friends.user2Id, friendIds)
            ),
            not(eq(users.id, req.user.id)),
            not(inArray(users.id, friendIds))
          )
        );

      if (friendsOfFriends.length === 0) {
        return res.json([]);
      }

      // Get recommendation details with mutual friend count
      const recommendations = await Promise.all(
        [...new Set(friendsOfFriends.map(f => f.recommendedUserId))].map(async (userId) => {
          const [user] = await db
            .select({
              id: users.id,
              username: users.username,
              avatarUrl: users.avatarUrl
            })
            .from(users)
            .where(eq(users.id, userId))
            .limit(1);

          const mutualFriends = await db
            .select({
              count: sql<number>`count(*)`
            })
            .from(friends as typeof friends)
            .where(
              and(
                or(
                  and(
                    eq(friends.user1Id, userId),
                    inArray(friends.user2Id, friendIds)
                  ),
                  and(
                    eq(friends.user2Id, userId),
                    inArray(friends.user1Id, friendIds)
                  )
                )
              )
            );

          return {
            ...user,
            mutualFriendCount: Number(mutualFriends[0]?.count || 0)
          };
        })
      );

      // Sort by mutual friend count
      recommendations.sort((a, b) => b.mutualFriendCount - a.mutualFriendCount);

      res.json(recommendations);
    } catch (error) {
      console.error("Error getting friend recommendations:", error);
      res.status(500).send("Error getting friend recommendations");
    }
  });

  app.put("/api/channels/:channelId/color", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const channelId = parseInt(req.params.channelId);
    const { backgroundColor } = req.body;

    if (isNaN(channelId) || !backgroundColor) {
      return res.status(400).send("Invalid channel ID or color");
    }

    try {
      // Check if user is a member of the channel
      const [membership] = await db
        .select()
        .from(channelMembers)
        .where(and(
          eq(channelMembers.channelId, channelId),
          eq(channelMembers.userId, req.user.id)
        ))
        .limit(1);

      if (!membership) {
        return res.status(403).send("You are not a member of this channel");
      }

      // Update channel background color
      const [updatedChannel] = await db
        .update(channels)
        .set({ backgroundColor })
        .where(eq(channels.id, channelId))
        .returning();

      // Notify all clients about the color change via WebSocket
      const colorUpdate = {
        type: 'channel_color_update',
        channelId,
        backgroundColor,
      };

      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(colorUpdate));
        }
      });

      res.json(updatedChannel);
    } catch (error) {
      console.error("Error updating channel color:", error);
      res.status(500).send("Error updating channel color");
    }
  });

  // AI Chat endpoint
  app.post("/api/chat/ai", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const { message } = req.body;
    if (!message) {
      return res.status(400).send("Message is required");
    }

    try {
      const response = await aiService.processMessage(message, req.user.id);
      res.json({ response });
    } catch (error) {
      console.error("Error processing AI message:", error);
      res.status(500).send("Error processing message");
    }
  });

  app.post("/api/chat-proxy", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const { message } = req.body;

      if (!message) {
        return res.status(400).json({ error: "Message is required" });
      }

      const response = await fetch("https://ai-chatbot-ameliadahn.replit.app/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ message })
      });

      if (!response.ok) {
        throw new Error(`Chatbot API responded with status: ${response.status}`);
      }

      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error("Chatbot proxy error:", error);
      res.status(500).json({
        error: "Failed to get response from chatbot",
        details: error.message
      });
    }
  });

  app.post("/api/friends/ensure-dm-channels", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      // Get all friends without DM channels
      const userFriends = await db
        .select({
          friendId: users.id,
          username: users.username,
        })
        .from(friends)
        .leftJoin(users, or(
          and(
            eq(friends.user1Id, req.user.id),
            eq(users.id, friends.user2Id)
          ),
          and(
            eq(friends.user2Id, req.user.id),
            eq(users.id, friends.user1Id)
          )
        ))
        .where(or(
          eq(friends.user1Id, req.user.id),
          eq(friends.user2Id, req.user.id)
        ));

      for (const friend of userFriends) {
        // Check if DM channel already exists
        const existingDM = await db.query.directMessageChannels.findFirst({
          where: or(
            and(
              eq(directMessageChannels.user1Id, req.user.id),
              eq(directMessageChannels.user2Id, friend.friendId)
            ),
            and(
              eq(directMessageChannels.user1Id, friend.friendId),
              eq(directMessageChannels.user2Id, req.user.id)
            )
          ),
        });

        if (!existingDM) {
          // Create new DM channel
          const [dmChannel] = await db
            .insert(channels)
            .values({
              name: `DM-${req.user.id}-${friend.friendId}`,
              isDirectMessage: true,
            })
            .returning();

          // Create direct message channel relationship
          await db
            .insert(directMessageChannels)
            .values({
              user1Id: req.user.id,
              user2Id: friend.friendId,
              channelId: dmChannel.id,
            });

          // Add both users as channel members
          await db.insert(channelMembers).values([
            {
              userId: req.user.id,
              channelId: dmChannel.id,
            },
            {
              userId: friend.friendId,
              channelId: dmChannel.id,
            },
          ]);
        }
      }

      res.json({ message: "DM channels created for all friends" });
    } catch (error) {
      console.error("Error ensuring DM channels:", error);
      res.status(500).send("Error ensuring DM channels");
    }
  });

  app.post("/api/upload", upload.array("files"), async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const files = req.files as Express.Multer.File[];
      const fileData = files.map((file) => ({
        filename: file.originalname,
        fileUrl: `/uploads/${file.filename}`,
        fileSize: file.size,
        mimeType: file.mimetype,
      }));

      res.json(fileData);
    } catch (error) {
      console.error("Error handling file upload:", error);
      res.status(500).send("Error handling file upload");
    }
  });

  app.use("/uploads", express.static("uploads"));

  // Add the route for direct message file uploads
  app.post("/api/channels/:channelId/messages", upload.array("files"), async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const channelId = parseInt(req.params.channelId);
    const content = req.body.content || "";
    const parentId = req.body.parentId ? parseInt(req.body.parentId) : undefined;
    const files = req.files as Express.Multer.File[];

    if (!channelId) {
      return res.status(400).send("Invalid channel ID");
    }

    try {
      // Check if user is a member of this channel
      const [membership] = await db
        .select()
        .from(channelMembers)
        .where(
          and(
            eq(channelMembers.channelId, channelId),
            eq(channelMembers.userId, req.user.id)
          )
        )
        .limit(1);

      if (!membership) {
        return res.status(403).send("You are not a member of this channel");
      }

      // Create the message first
      const [message] = await db
        .insert(messages)
        .values({
          content,
          channelId,
          userId: req.user.id,
          parentId,
        })
        .returning();

      // If there are files, create attachments

      // Fetch the complete message with attachments
      const fullMessage = await db.query.messages.findFirst({
        where: eq(messages.id, message.id),
        with: {
          user: {
            columns: {
              id: true,
              username: true,
              avatarUrl: true,
            },
          },
          reactions: {
            with: {
              user: {
                columns: {
                  id: true,
                  username: true,
                  avatarUrl: true,
                },
              },
            },
          },
        }
      });

      res.json(fullMessage);
    } catch (error) {
      console.error("Error creating message:", error);
      res.status(500).send("Error creating message");
    }
  });

  // Serve uploaded files
  app.use("/uploads", express.static("uploads"));

  app.post("/api/channels/:channelId/leave", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const channelId = parseInt(req.params.channelId);
    if (isNaN(channelId)) {
      return res.status(400).send("Invalid channel ID");
    }

    try {
      // Check if channel exists and user is a member
      const [membership] = await db
        .select()
        .from(channelMembers)
        .where(
          and(
            eq(channelMembers.channelId, channelId),
            eq(channelMembers.userId, req.user.id)
          )
        )
        .limit(1);

      if (!membership) {
        return res.status(404).send("Channel membership not found");
      }

      // Delete the membership
      await db
        .delete(channelMembers)
        .where(
          and(
            eq(channelMembers.channelId, channelId),
            eq(channelMembers.userId, req.user.id)
          )
        );

      // Fetch updated channel list
      const updatedChannels = await db.query.channelMembers.findMany({
        where: eq(channelMembers.userId, req.user.id),
        with: {
          channel: true,
        },
      });

      const unreadCounts = await getUnreadMessageCounts(req.user.id);

      const channelsWithUnread = updatedChannels.map((uc) => ({
        ...uc.channel,
        unreadCount: unreadCounts.find((c) => c.channelId === uc.channel.id)?.unreadCount || 0,
      }));

      res.json({
        message: "Successfully left the channel",
        channels: channelsWithUnread,
      });
    } catch (error) {
      console.error("Error leaving channel:", error);
      res.status(500).send("Error leaving channel");
    }
  });

  app.delete("/api/user/account", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const userId = req.user.id;

      // First delete all friend requests
      await db.delete(friendRequests).where(
        or(
          eq(friendRequests.senderId, userId),
          eq(friendRequests.receiverId, userId)
        )
      );

      // Delete friend relationships
      await db.delete(friends).where(
        or(
          eq(friends.user1Id, userId),
          eq(friends.user2Id, userId)
        )
      );

      // Delete all message reactions by this user
      await db.delete(messageReactions).where(eq(messageReactions.userId, userId));

      // Delete all message reads by this user
      await db.delete(messageReads).where(eq(messageReads.userId, userId));

      // Delete channel invites
      await db.delete(channelInvites).where(
        or(
          eq(channelInvites.senderId, userId),
          eq(channelInvites.receiverId, userId)
        )
      );

      // Get all DM channels associated with the user
      const userDMChannels = await db.query.directMessageChannels.findMany({
        where: or(
          eq(directMessageChannels.user1Id, userId),
          eq(directMessageChannels.user2Id, userId)
        ),
        columns: {
          channelId: true,
        },
      });

      const dmChannelIds = userDMChannels.map((dc) => dc.channelId);

      if (dmChannelIds.length > 0) {
        // Delete all message attachments in DM channels
        await db.delete(messageAttachments).where(
          inArray(
            messageAttachments.messageId,
            db.select({ id: messages.id })
              .from(messages)
              .where(inArray(messages.channelId, dmChannelIds))
          )
        );

        // Delete all messages in DM channels
        await db.delete(messages).where(inArray(messages.channelId, dmChannelIds));

        // Delete DM channel memberships
        await db.delete(channelMembers).where(inArray(channelMembers.channelId, dmChannelIds));

        // Delete DM channels relationships
        await db.delete(directMessageChannels).where(
          or(
            eq(directMessageChannels.user1Id, userId),
            eq(directMessageChannels.user2Id, userId)
          )
        );

        // Delete the DM channels themselves
        await db.delete(channels).where(inArray(channels.id, dmChannelIds));
      }

      // Remove user from all other channels
      await db.delete(channelMembers).where(eq(channelMembers.userId, userId));

      // Delete all messages by this user in other channels
      await db.delete(messages).where(eq(messages.userId, userId));

      // Finally, delete the user
      await db.delete(users).where(eq(users.id, userId));

      // Logout the user and destroy session
      req.logout((err) => {
        if (err) {
          console.error("Error logging out user:", err);
          return res.status(500).send("Error during logout after deletion");
        }
        req.session.destroy((err) => {
          if (err) {
            console.error("Error destroying session:", err);
            return res.status(500).send("Error destroying session");
          }
          res.clearCookie("connect.sid");
          res.json({ message: "Account deleted successfully" });
        });
      });

    } catch (error) {
      console.error("Error deleting user account:", error);
      res.status(500).send("Error deleting user account");
    }
  });

  // Password reset request endpoint
  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).send("Email is required");
      }

      // Find user by email
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (!user) {
        // Don't reveal if user exists
        return res.json({
          message: "If an account exists with that email, you will receive password reset instructions.",
        });
      }

      // Generate reset token and expiry
      const resetToken = generateResetToken();
      const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour from now

      // Update user with reset token
      await db
        .update(users)
        .set({
          resetToken,
          resetTokenExpiry,
        })
        .where(eq(users.id, user.id));

      // Send reset email with the correct domain
      const resetUrl = "https://57d3de03-df16-4860-bd5f-242abda85e1e-00-uzdqlt8ev74r.spock.replit.dev";
      await sendPasswordResetEmail(email, resetToken, resetUrl);

      res.json({ message: "If an account exists with that email, you will receive password reset instructions." });
    } catch (error) {
      console.error("Password reset error:", error);
      res.status(500).json({ error: "Error processing password reset request" });
    }
  });

  // Reset password with token endpoint
  app.post("/api/auth/reset-password/:token", async (req, res) => {
    const { token } = req.params;
    const { newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: "Token and new password are required" });
    }

    try {
      // Find user with valid reset token
      const [user] = await db
        .select()
        .from(users)
        .where(
          and(
            eq(users.resetToken, token),
            gt(users.resetTokenExpiry, new Date())
          )
        )
        .limit(1);

      if (!user) {
        return res.status(400).json({ error: "Invalid or expired reset token" });
      }

      // Hash the new password
      const hashedPassword = await crypto.hash(newPassword);

      // Update user's password and clear reset token
      await db
        .update(users)
        .set({
          password: hashedPassword,
          resetToken: null,
          resetTokenExpiry: null,
        })
        .where(eq(users.id, user.id));

      res.json({ message: "Password has been reset successfully" });
    } catch (error) {
      console.error("Password reset error:", error);
      res.status(500).json({ error: "Error resetting password" });
    }
  });

  app.post("/api/register", async (req, res) => {
    if (!req.body.username || !req.body.password || !req.body.email) {
      return res.status(400).send("Username, password and email are required");
    }

    const { username, password, email } = req.body;

    try {
      // Check if user already exists
      const sameUsernameOrEmail = await db.query.users.findFirst({
        where: or(
          eq(users.username, username),
          eq(users.email, email)
        ),
      });

      if (sameUsernameOrEmail) {
        return res.status(400).send(
          sameUsernameOrEmail.username === username
            ? "Username already exists"            :"Email already exists"
        );
      }

      //// Create new user
      const [user] = await db
        .insert(users)
        .values({
          username,
          password,
          email,
          preferredVoiceId: "21m00Tcm4TlvDq8ikWAM", // Set default voice
        })
        .returning();

      // Log the user in
      req.logIn(user, (err) => {
        if (err) {
          return res.status(500).send("Error logging in after registration");
        }
        res.json(user);
      });
    } catch (error) {
      console.error("Error registering user:", error);
      res.status(500).send("Error registering user");
    }
  });

  // Add suggestion API endpoint
  app.post("/api/channels/:channelId/suggest-reply", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const channelId = parseInt(req.params.channelId);
    if (isNaN(channelId)) {
      return res.status(400).send("Invalid channel ID");
    }

    try {
      const suggestion = await aiService.generateReplySuggestion(channelId, req.user.id);
      res.json({ suggestion });
    } catch (error) {
      console.error("Error generating reply suggestion:", error);
      if (
        error.message === "Cannot suggest a reply to your own message" ||
        error.message ===
          "Cannot suggest a reply when you have already participated in the conversation after this message"
      ) {
        return res.status(400).json({
          error: error.message,
        });
      }
      res.status(500).send("Error generating reply suggestion");
    }
  });

  app.post("/api/channels/:channelId/suggestion-feedback", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const { content, wasAccepted, messageLength } = req.body;
    const channelId = parseInt(req.params.channelId);

    if (!content || typeof wasAccepted !== "boolean" || !channelId) {
      return res.status(400).send("Invalid request data");
    }

    try {
      await aiService.recordSuggestionFeedback(
        req.user.id,
        channelId,
        content,
        wasAccepted,
        messageLength // Pass message length to the service
      );

      res.json({ success: true });
    } catch (error) {
      console.error("Error recording suggestion feedback:", error);
      res.status(500).send("Error recording suggestion feedback");
    }
  });

  // Add the route for voice feedback
  app.post("/api/voice-feedback", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const { messageContent, voiceSettings, wasLiked } = req.body;

    if (!messageContent || !voiceSettings || typeof wasLiked !== "boolean") {
      return res.status(400).send("Invalid feedback data");
    }

    try {
      const [feedback] = await db
        .insert(voiceFeedback)
        .values({
          userId: req.user.id,
          messageContent,
          voiceSettings: JSON.stringify(voiceSettings),
          wasLiked,
        })
        .returning();

      res.json(feedback);
    } catch (error) {
      console.error("Error saving voice feedback:", error);
      res.status(500).send("Error saving voice feedback");
    }
  });

  // Add this new endpoint before the return statement
  app.post("/api/messages/:messageId/text-to-speech", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const messageId = parseInt(req.params.messageId);
      if (isNaN(messageId)) {
        return res.status(400).send("Invalid message ID");
      }

      const message = await db.query.messages.findFirst({
        where: eq(messages.id, messageId),
      });

      if (!message) {
        return res.status(404).send("Message not found");
      }

      // Get user's preferred voice
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, req.user.id))
        .limit(1);

      // Convert text to speech using user's preferred voice and ID for personalization
      const audioBuffer = await voiceService.convertTextToSpeech(
        message.content,
        user.preferredVoiceId,
        req.user.id
      );

      // Set headers for audio streaming and include voice settings
      res.set({
        "Content-Type": "audio/mpeg",
        "Transfer-Encoding": "chunked",
      });

      // Send the audio buffer directly to the client
      res.send(audioBuffer);
    } catch (error) {
      console.error("Error converting text to speech:", error);
      res.status(500).send("Error converting text to speech");
    }
  });

  // Text-to-speech endpoint
  app.post("/api/tts", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const { text } = req.body;
    if (!text) {
      return res.status(400).send("Text is required");
    }

    try {
      const audioBuffer = await voiceService.convertTextToSpeech(text);

      res.set({
        "Content-Type": "audio/mpeg",
        "Content-Length": audioBuffer.length,
      });

      res.send(audioBuffer);
    } catch (error) {
      console.error("Error generating speech:", error);
      res.status(500).send("Error generating speech");
    }
  });

  app.get("/api/voices", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const voices = await voiceService.getAvailableVoices();
      res.json(voices);
    } catch (error) {
      console.error("Error fetching voices:", error);
      res.status(500).send("Error fetching voices");
    }
  });

  app.put("/api/user/voice", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const { voiceId } = req.body;
    if (!voiceId) {
      return res.status(400).send("Voice ID is required");
    }

    try {
      const [updatedUser] = await db
        .update(users)
        .set({ preferredVoiceId: voiceId })
        .where(eq(users.id, req.user.id))
        .returning();

      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating preferred voice:", error);
      res.status(500).send("Error updating preferred voice");
    }
  });

  app.post("/api/voice/test", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const { voiceId, text } = req.body;

      if (!voiceId || !text) {
        return res.status(400).send("Voice ID and text are required");
      }

      const audioBuffer = await voiceService.convertTextToSpeech(text, voiceId);

      // Set headers for audio streaming
      res.set({
        "Content-Type": "audio/mpeg",
        "Transfer-Encoding": "chunked",
      });

      // Send the audio buffer directly to the client
      res.send(audioBuffer);
    } catch (error) {
      console.error("Error testing voice:", error);
      res.status(500).send("Error testing voice");
    }
  });
  app.get("/api/channels/:channelId/summary", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const channelId = parseInt(req.params.channelId);
    if (isNaN(channelId)) {
      return res.status(400).send("Invalid channel ID");
    }

    try {
      const summary = await aiService.generateConversationSummary(channelId);
      res.json({ summary });
    } catch (error) {
      console.error("Error generating conversation summary:", error);
      res.status(500).send("Error generating conversation summary");
    }
  });

  return httpServer;
}