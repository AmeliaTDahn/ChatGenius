import type { Express } from "express";
import { createServer, type Server } from "http";
import { db } from "@db";
import { users, type User } from "@db/schema";
import { eq, and, ne, ilike, or, inArray } from "drizzle-orm";
import { setupAuth } from "./auth";
import { channels, channelMembers, messages, channelInvites, messageReactions, friendRequests, friends, directMessageChannels, messageReads } from "@db/schema";
import { WebSocketServer } from "ws";
import { WebSocket } from 'ws';

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

  // Add this route after the existing /api/user endpoint
  app.put("/api/user/profile", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const [updatedUser] = await db
        .update(users)
        .set({
          username: req.body.username,
          avatarUrl: req.body.avatarUrl,
          age: req.body.age,
          city: req.body.city,
          status: req.body.status,
        })
        .where(eq(users.id, req.user.id))
        .returning();

      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating user profile:", error);
      res.status(500).send("Error updating user profile");
    }
  });

  // Update the status endpoint to handle hideActivity
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

      // Broadcast status change to all connected WebSocket clients
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

  // Update the search users endpoint to include friend status
  app.get("/api/users/search", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const query = req.query.q as string;
    if (!query || query.length < 2) {
      return res.json([]);
    }

    try {
      // First get the user's friends
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

      // Then search for users and include whether they are friends
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
        }
      },
      orderBy: (messages, { asc }) => [asc(messages.createdAt)]
    });

    res.json(channelMessages);
  });

  // Add message search endpoint after the messages endpoints
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
      // Get all channels the user is a member of
      const userChannels = await db
        .select({ channelId: channelMembers.channelId })
        .from(channelMembers)
        .where(eq(channelMembers.userId, req.user.id));

      const channelIds = userChannels.map(uc => uc.channelId);

      // Search messages in user's channels
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

        // Get both users' data for the response
        const [sender] = await db
          .select({
            id: users.id,
            username: users.username,
            avatarUrl: users.avatarUrl,
          })
          .from(users)
          .where(eq(users.id, request.senderId))
          .limit(1);

        const [receiver] = await db
          .select({
            id: users.id,
            username: users.username,
            avatarUrl: users.avatarUrl,
          })
          .from(users)
          .where(eq(users.id, req.user.id))
          .limit(1);

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

        res.json({
          message: `Friend request ${status}`,
          sender,
          receiver,
          dmChannel
        });
      } else {
        res.json({ message: `Friend request ${status}` });
      }
    } catch (error) {
      console.error("Error handling friend request:", error);
      res.status(500).send("Error handling friend request");
    }
  });

  // Update the friends endpoint to include more user information
  app.get("/api/friends", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const userFriends = await db
        .select({
          id: users.id,
          username: users.username,
          avatarUrl: users.avatarUrl,
          age: users.age,
          city: users.city,
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

      res.json(userFriends);
    } catch (error) {
      console.error("Error fetching friends:", error);
      res.status(500).send("Error fetching friends");
    }
  });


  // Update DELETE /api/friends/:friendId endpoint to handle cascading deletes properly
  app.delete("/api/friends/:friendId", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const friendId = parseInt(req.params.friendId);
    if (isNaN(friendId)) {
      return res.status(400).send("Invalid friend ID");
    }

    try {
      // Find the direct message channel first
      const [dmChannel] = await db
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

      if (dmChannel) {
        // Get all messages in this channel
        const channelMessages = await db
          .select({ id: messages.id })
          .from(messages)
          .where(eq(messages.channelId, dmChannel.channelId));

        const messageIds = channelMessages.map(m => m.id);

        // Delete message reactions
        if (messageIds.length > 0) {
          await db
            .delete(messageReactions)
            .where(inArray(messageReactions.messageId, messageIds));

          // Delete message reads
          await db
            .delete(messageReads)
            .where(inArray(messageReads.messageId, messageIds));
        }

        // Delete the messages
        await db
          .delete(messages)
          .where(eq(messages.channelId, dmChannel.channelId));

        // Remove channel members
        await db
          .delete(channelMembers)
          .where(eq(channelMembers.channelId, dmChannel.channelId));

        // Remove direct message channel relation
        await db
          .delete(directMessageChannels)
          .where(eq(directMessageChannels.channelId, dmChannel.channelId));

        // Remove the channel itself
        await db
          .delete(channels)
          .where(eq(channels.id, dmChannel.channelId));
      }

      // Remove from friends table
      await db
        .delete(friends)
        .where(or(
          and(
            eq(friends.user1Id, req.user.id),
            eq(friends.user2Id, friendId)
          ),
          and(
            eq(friends.user1Id, friendId),
            eq(friends.user2Id, req.user.id)
          )
        ));

      res.json({ message: "Friend removed successfully" });
    } catch (error) {
      console.error("Error removing friend:", error);
      res.status(500).send("Error removing friend");
    }
  });

  // Add endpoint for creating direct message channels
  app.post("/api/direct-messages/create", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const { friendId } = req.body;
    if (!friendId) {
      return res.status(400).send("Friend ID is required");
    }

    try {
      // Check if they are friends
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
        return res.status(403).send("You are not friends with this user");
      }

      // Check if direct message channel already exists
      const [existingDM] = await db
        .select()
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

      if (existingDM) {
        return res.status(400).send("Direct message channel already exists");
      }

      // Create a new channel
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
          userId: req.user.id,
          channelId: dmChannel.id
        },
        {
          userId: friendId,
          channelId: dmChannel.id
        }
      ]);

      // Create direct message channel relationship
      await db
        .insert(directMessageChannels)
        .values({
          user1Id: req.user.id,
          user2Id: friendId,
          channelId: dmChannel.id
        });

      res.json(dmChannel);
    } catch (error) {
      console.error("Error creating direct message channel:", error);
      res.status(500).send("Error creating direct message channel");
    }
  });

  // Add message read status endpoint
  app.post("/api/messages/:messageId/read", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const messageId = parseInt(req.params.messageId);
    if (isNaN(messageId)) {
      return res.status(400).send("Invalid message ID");
    }

    try {
      // Check if read receipt already exists
      const [existingRead] = await db
        .select()
        .from(messageReads)
        .where(and(
          eq(messageReads.messageId, messageId),
          eq(messageReads.userId, req.user.id)
        ))
        .limit(1);

      if (!existingRead) {
        // Create new read receipt
        await db.insert(messageReads).values({
          messageId,
          userId: req.user.id,
        });
      }

      // Get updated message with read receipts
      const updatedMessage = await db.query.messages.findFirst({
        where: eq(messages.id, messageId),
        with: {
          user: true,
          reactions: {
            with: {
              user: true
            }
          },
          reads: {
            with: {
              user: true
            }
          }
        }
      });

      if (!updatedMessage) {
        return res.status(404).send("Message not found");
      }

      // Send WebSocket notification about the read status
      wss.clients.forEach((client: any) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: 'message_read',
            messageId,
            userId: req.user.id,
            readAt: new Date().toISOString()
          }));
        }
      });

      res.json(updatedMessage);
    } catch (error) {
      console.error("Error marking message as read:", error);
      res.status(500).send("Error marking message as read");
    }
  });

  return server;
}

function setupWebSocket(server: Server){
  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });
  return {wss}
}