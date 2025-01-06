import type { Express } from "express";
import { createServer, type Server } from "http";
import { db } from "@db";
import { users, type User } from "@db/schema";
import { eq, and, ne, ilike, or } from "drizzle-orm";
import { setupAuth } from "./auth";
import { channels, channelMembers, messages, channelInvites, messageReactions, friendRequests, friends, directMessageChannels } from "@db/schema";
import { WebSocketServer } from "ws";

declare module 'express-session' {
  interface SessionData {
    passport: {
      user: number;
    };
  }
}

declare global {
  namespace Express {
    // Fix circular type reference
    interface User extends Omit<User, 'password'> {}
  }
}

export function registerRoutes(app: Express): Server {
  setupAuth(app);
  const server = createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  // WebSocket upgrade handling
  server.on('upgrade', (request, socket, head) => {
    // Skip vite HMR requests
    if (request.headers['sec-websocket-protocol'] === 'vite-hmr') {
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  // WebSocket connection handling
  wss.on('connection', (ws) => {
    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.type === 'message') {
          // Handle new message
          const newMessage = await db.insert(messages)
            .values({
              content: message.content,
              channelId: message.channelId,
              userId: message.userId,
            })
            .returning();

          // Broadcast to all connected clients
          wss.clients.forEach((client) => {
            client.send(JSON.stringify({
              type: 'new_message',
              message: newMessage[0],
            }));
          });
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    });
  });

  // Get user data
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

  // Search users
  app.get("/api/users/search", async (req, res) => {
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
        .where(and(
          ilike(users.username, `%${query}%`),
          ne(users.id, req.user.id)
        ))
        .limit(10);

      res.json(searchResults);
    } catch (error) {
      console.error("Error searching users:", error);
      res.status(500).send("Error searching users");
    }
  });

  // Channel invites
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

      // Check if invite already exists
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

      // Create invite
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

      // Update invite status
      await db
        .update(channelInvites)
        .set({ status })
        .where(eq(channelInvites.id, inviteId));

      // If accepted, add user to channel
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

  // Channels
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

    res.json(userChannels.map(uc => uc.channel));
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

  // Messages
  app.get("/api/channels/:channelId/messages", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const channelId = parseInt(req.params.channelId);
    if (isNaN(channelId)) {
      return res.status(400).send("Invalid channel ID");
    }

    const channelMessages = await db.query.messages.findMany({
      where: eq(messages.channelId, channelId),
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
        }
      },
      orderBy: (messages, { desc }) => [desc(messages.createdAt)]
    });

    res.json(channelMessages);
  });

  // Add message reactions endpoint after the messages endpoints
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
      // Check if reaction already exists
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
        // Remove reaction if it exists
        await db
          .delete(messageReactions)
          .where(eq(messageReactions.id, existingReaction.id));
      } else {
        // Add new reaction
        await db
          .insert(messageReactions)
          .values({
            messageId,
            userId: req.user.id,
            emoji
          });
      }

      // Get updated message with reactions
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

  // Friend requests
  app.post("/api/friend-requests", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const { receiverId } = req.body;

    if (!receiverId) {
      return res.status(400).send("Invalid receiver ID");
    }

    try {
      // Check if friend request already exists
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

      // Create friend request
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

  // Add direct messages endpoint
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
              avatarUrl: true
            }
          },
          user2: {
            columns: {
              id: true,
              username: true,
              avatarUrl: true
            }
          }
        }
      });

      // Transform the data to include the other user's info
      const formattedChannels = directChannels.map(dc => ({
        ...dc.channel,
        otherUser: dc.user1.id === userId ? dc.user2 : dc.user1
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

      // Update request status
      await db
        .update(friendRequests)
        .set({ status })
        .where(eq(friendRequests.id, requestId));

      // If accepted, create friend relationship and direct message channel
      if (status === 'accepted') {
        // Create friend relationship
        await db
          .insert(friends)
          .values({
            user1Id: request.senderId,
            user2Id: req.user.id
          });

        // Create a new channel for direct messages
        const [dmChannel] = await db
          .insert(channels)
          .values({
            name: 'Direct Message',
            isDirectMessage: true
          })
          .returning();

        // Add both users to the channel
        await db.insert(channelMembers).values([
          {
            userId: request.senderId,
            channelId: dmChannel.id
          },
          {
            userId: req.user.id,
            channelId: dmChannel.id
          }
        ]);

        // Create direct message channel relationship
        await db
          .insert(directMessageChannels)
          .values({
            user1Id: request.senderId,
            user2Id: req.user.id,
            channelId: dmChannel.id
          });
      }

      res.json({ message: `Friend request ${status}` });
    } catch (error) {
      console.error("Error handling friend request:", error);
      res.status(500).send("Error handling friend request");
    }
  });

  return server;
}