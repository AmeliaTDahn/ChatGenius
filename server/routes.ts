import type { Express } from "express";
import { createServer, type Server } from "http";
import { db } from "@db";
import { users, type User } from "@db/schema";
import { eq, and, ne, ilike, or, inArray, desc, gt, sql, not } from "drizzle-orm";
import { setupAuth } from "./auth";
import { channels, channelMembers, messages, channelInvites, messageReactions, friendRequests, friends, directMessageChannels, messageReads, messageAttachments } from "@db/schema";
import { WebSocketServer, WebSocket } from 'ws';
import type { Message } from "@db/schema";
import multer from "multer";
import { randomBytes } from "crypto";
import path from "path";
import fs from "fs/promises";
import express from "express";
import crypto from 'crypto';
import { sendPasswordResetEmail, generateResetToken } from './utils/email';
import session, { SessionOptions } from 'express-session';
import passport from 'passport';

// Assuming sessionSettings is defined elsewhere, this is a placeholder
const sessionSettings: SessionOptions = {
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
};


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


interface ExtendedWebSocket extends WebSocket {
  userId?: number;
  sessionId?: string;
  isAlive?: boolean;
}

interface WebSocketMessageType {
  type: 'message' | 'status_update' | 'typing';
  content?: string;
  channelId?: number;
  userId?: number;
  isOnline?: boolean;
  hideActivity?: boolean;
}

export function registerRoutes(app: Express): Server {
  setupAuth(app);
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

  httpServer.on('upgrade', (request, socket, head) => {
    if (request.headers['sec-websocket-protocol'] === 'vite-hmr') {
      return;
    }

    // Parse the session from the request
    const sessionParser = session(sessionSettings);
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
          wss.emit('connection', extWs, request);
        });
      });
    });
  });

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
            // Ensure the message is sent with the correct user ID from the WebSocket connection
            const userId = ws.userId;
            if (!userId) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Not authenticated',
              }));
              return;
            }

            const [newMessage] = await db.insert(messages)
              .values({
                content: message.content,
                channelId: message.channelId,
                userId: userId, // Use the WebSocket's authenticated user ID
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
              }
            });

            // Broadcast to all clients except those with the same session ID
            const broadcastMessage = JSON.stringify({
              type: 'new_message',
              message: fullMessage,
              channelId: message.channelId,
              senderId: userId,
            });

            wss.clients.forEach((client: ExtendedWebSocket) => {
              if (client.readyState === WebSocket.OPEN && client.sessionId !== ws.sessionId) {
                client.send(broadcastMessage);
              }
            });
            break;
          }
          case 'status_update': {
            const statusUpdate = JSON.stringify({
              type: 'status_update',
              userId: message.userId,
              isOnline: message.isOnline,
              hideActivity: message.hideActivity,
            });

            wss.clients.forEach((client) => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(statusUpdate);
              }
            });
            break;
          }

          case 'typing': {
            const typingUpdate = JSON.stringify({
              type: 'typing',
              channelId: message.channelId,
              userId: message.userId,
            });

            wss.clients.forEach((client) => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(typingUpdate);
              }
            });
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

  app.delete("/api/user/account", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const userId = req.user.id;

      // First delete all message attachments for user's messages
      await db.delete(messageAttachments).where(
        inArray(
          messageAttachments.messageId,
          db.select({ id: messages.id })
            .from(messages)
            .where(eq(messages.userId, userId))
        )
      );

      // Delete all messages by this user in all channels
      await db.delete(messages)
        .where(eq(messages.userId, userId));

      // Then delete friend requests
      await db.delete(friendRequests)
        .where(or(
          eq(friendRequests.senderId, userId),
          eq(friendRequests.receiverId, userId)
        ));

      // Delete friend relationships
      await db.delete(friends)
        .where(or(
          eq(friends.user1Id, userId),
          eq(friends.user2Id, userId)
        ));

      // Delete all message reactions by this user
      await db.delete(messageReactions)
        .where(eq(messageReactions.userId, userId));

      // Delete all message reads by this user
      await db.delete(messageReads)
        .where(eq(messageReads.userId, userId));

      // Delete channel invites
      await db.delete(channelInvites)
        .where(or(
          eq(channelInvites.senderId, userId),
          eq(channelInvites.receiverId, userId)
        ));

      // Get all DM channels associated with the user
      const userDMChannels = await db.query.directMessageChannels.findMany({
        where: or(
          eq(directMessageChannels.user1Id, userId),
          eq(directMessageChannels.user2Id, userId)
        ),
        columns: {
          channelId: true
        }
      });

      const dmChannelIds = userDMChannels.map(dc => dc.channelId);

      if (dmChannelIds.length > 0) {
        // Delete all message attachments in DM channels
        await db.delete(messageAttachments)
          .where(
            inArray(
              messageAttachments.messageId,
              db.select({ id: messages.id })
                .from(messages)
                .where(inArray(messages.channelId, dmChannelIds))
            )
          );

        // Delete all messages in DM channels
        await db.delete(messages)
          .where(inArray(messages.channelId, dmChannelIds));

        // Delete DM channel memberships
        await db.delete(channelMembers)
          .where(inArray(channelMembers.channelId, dmChannelIds));

        // Delete DM channels relationships
        await db.delete(directMessageChannels)
          .where(or(
            eq(directMessageChannels.user1Id, userId),
            eq(directMessageChannels.user2Id, userId)
          ));

        // Delete the DM channels themselves
        await db.delete(channels)
          .where(inArray(channels.id, dmChannelIds));
      }

      // Remove user from all other channels
      await db.delete(channelMembers)
        .where(eq(channelMembers.userId, userId));


      // Finally, delete the user
      await db.delete(users)
        .where(eq(users.id, userId));

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
          res.clearCookie('connect.sid');
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
          message: "If an account exists with that email, you will receive password reset instructions."
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
        .where(and(
          eq(users.resetToken, token),
          gt(users.resetTokenExpiry, new Date())
        ))
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
          resetTokenExpiry: null
        })
        .where(eq(users.id, user.id));

      res.json({ message: "Password has been reset successfully" });
    } catch (error) {
      console.error("Password reset error:", error);
      res.status(500).json({ error: "Error resetting password" });
    }
  });

  app.post("/api/register", async (req, res, next) => {
    try {
      const result = insertUserSchema.safeParse(req.body);
      if (!result.success) {
        return res
          .status(400)
          .send("Invalid input: " + result.error.issues.map(i => i.message).join(", "));
      }

      const { username, email, password } = result.data;

      // Check if user already exists with the same username or email
      const existingUser = await db.query.users.findFirst({
        where: or(
          eq(users.username, username),
          eq(users.email, email)
        ),
      });

      if (existingUser) {
        if (existingUser.email === email) {
          return res.status(400).send("A user with this email is already registered");
        }
        return res.status(400).send("Username already exists");
      }

      // Hash the password
      const hashedPassword = await crypto.hash(password);

      // Create the new user
      const [newUser] = await db
        .insert(users)
        .values({
          username,
          email,
          password: hashedPassword,
        })
        .returning();

      // Log the user in after registration
      req.login(newUser, (err) => {
        if (err) {
          return next(err);
        }
        return res.json({
          message: "Registration successful",
          user: { id: newUser.id, username: newUser.username },
        });
      });
    } catch (error) {
      next(error);
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
      const fileData = files.map(file => ({
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
  app.post("/api/channels/:channelId/messages", upload.array('files'), async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const channelId = parseInt(req.params.channelId);
    const content = req.body.content || '';
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
        .where(and(
          eq(channelMembers.channelId, channelId),
          eq(channelMembers.userId, req.user.id)
        ))
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
      if (files && files.length > 0) {
        const attachmentValues = files.map(file => ({
          messageId: message.id,
          filename: file.originalname,
          fileUrl: `/uploads/${file.filename}`,
          fileSize: file.size,
          mimeType: file.mimetype
        }));

        await db
          .insert(messageAttachments)
          .values(attachmentValues);
      }

      // Fetch the complete message with attachments
      const fullMessage = await db.query.messages.findFirst({
        where: eq(messages.id, message.id),
        with: {
          user: {
            columns: {
              id: true,
              username: true,
              avatarUrl: true,
            }
          },
          attachments: true,
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
        }
      });

      res.json(fullMessage);
    } catch (error) {
      console.error("Error creating message:", error);
      res.status(500).send("Error creating message");
    }
  });

  // Serve uploaded files
  app.use('/uploads', express.static('uploads'));

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
        .where(and(
          eq(channelMembers.channelId, channelId),
          eq(channelMembers.userId, req.user.id)
        ))
        .limit(1);

      if (!membership) {
        return res.status(404).send("Channel membership not found");
      }

      // Delete the membership
      await db
        .delete(channelMembers)
        .where(and(
          eq(channelMembers.channelId, channelId),
          eq(channelMembers.userId, req.user.id)
        ));

      // Fetch updated channel list
      const updatedChannels = await db.query.channelMembers.findMany({
        where: eq(channelMembers.userId, req.user.id),
        with: {
          channel: true
        }
      });

      const unreadCounts = await getUnreadMessageCounts(req.user.id);

      const channelsWithUnread = updatedChannels.map(uc => ({
        ...uc.channel,
        unreadCount: unreadCounts.find(c => c.channelId === uc.channel.id)?.unreadCount || 0
      }));

      res.json({
        message: "Successfully left the channel",
        channels: channelsWithUnread
      });
    } catch (error) {
      console.error("Error leaving channel:", error);
      res.status(500).send("Error leaving channel");
    }
  });

  return httpServer;
}