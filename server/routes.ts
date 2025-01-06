import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { setupWebSocket } from "./websocket";
import { db } from "@db";
import { channels, messages, channelMembers, messageReactions, users, friendRequests, channelInvites, userProfiles } from "@db/schema";
import { eq, desc, ilike, and, or } from "drizzle-orm";

declare module 'express-session' {
  interface SessionData {
    passport: {
      user: number;
    };
  }
}

export function registerRoutes(app: Express): Server {
  setupAuth(app);
  const server = createServer(app);
  setupWebSocket(server);

  // Profile Setup
  app.post("/api/user/profile", async (req, res) => {
    if (!req.isAuthenticated() || !req.user?.id) {
      return res.status(401).send("Not authenticated");
    }

    const { displayName, bio, timezone, interests } = req.body;
    if (!displayName || !timezone) {
      return res.status(400).send("Display name and timezone are required");
    }

    try {
      const [profile] = await db
        .insert(userProfiles)
        .values({
          userId: req.user.id,
          displayName,
          bio,
          timezone,
          interests,
          isProfileComplete: true,
        })
        .returning();

      res.json(profile);
    } catch (error) {
      console.error("Error creating user profile:", error);
      res.status(500).send("Error creating user profile");
    }
  });

  // Get user profile with the user data
  app.get("/api/user", async (req, res) => {
    if (!req.isAuthenticated() || !req.user?.id) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const user = await db.query.users.findFirst({
        where: eq(users.id, req.user.id),
        with: {
          profile: true,
        },
      });

      if (!user) {
        return res.status(404).send("User not found");
      }

      res.json(user);
    } catch (error) {
      console.error("Error fetching user profile:", error);
      res.status(500).send("Error fetching user profile");
    }
  });

  // User Search
  app.get("/api/users/search", async (req, res) => {
    if (!req.isAuthenticated() || !req.user?.id) {
      return res.status(401).send("Not authenticated");
    }

    const query = req.query.q as string;
    if (!query) {
      return res.status(400).send("Search query is required");
    }

    try {
      const searchResults = await db
        .select()
        .from(users)
        .where(and(
          ilike(users.username, `%${query}%`),
          eq(users.id, req.user.id).not()
        ))
        .limit(10);

      res.json(searchResults.map(user => ({
        id: user.id,
        username: user.username,
        avatarUrl: user.avatarUrl,
      })));
    } catch (error) {
      console.error("Error searching users:", error);
      res.status(500).send("Error searching users");
    }
  });

  // Friend Requests
  app.post("/api/friend-requests", async (req, res) => {
    if (!req.isAuthenticated() || !req.user?.id) {
      return res.status(401).send("Not authenticated");
    }

    const { receiverId } = req.body;
    if (!receiverId) {
      return res.status(400).send("Receiver ID is required");
    }

    try {
      const existingRequests = await db
        .select()
        .from(friendRequests)
        .where(
          or(
            and(
              eq(friendRequests.senderId, req.user.id),
              eq(friendRequests.receiverId, receiverId)
            ),
            and(
              eq(friendRequests.senderId, receiverId),
              eq(friendRequests.receiverId, req.user.id)
            )
          )
        );

      if (existingRequests.length > 0) {
        return res.status(400).send("Friend request already exists");
      }

      const [request] = await db
        .insert(friendRequests)
        .values({
          senderId: req.user.id,
          receiverId: receiverId,
        })
        .returning();

      res.json(request);
    } catch (error) {
      console.error("Error creating friend request:", error);
      res.status(500).send("Error creating friend request");
    }
  });

  app.put("/api/friend-requests/:id", async (req, res) => {
    if (!req.isAuthenticated() || !req.user?.id) {
      return res.status(401).send("Not authenticated");
    }

    const { id } = req.params;
    const { status } = req.body;
    if (!status || !["accepted", "rejected"].includes(status)) {
      return res.status(400).send("Valid status is required");
    }

    try {
      const [request] = await db
        .update(friendRequests)
        .set({ status })
        .where(
          and(
            eq(friendRequests.id, parseInt(id)),
            eq(friendRequests.receiverId, req.user.id),
            eq(friendRequests.status, "pending")
          )
        )
        .returning();

      if (!request) {
        return res.status(404).send("Friend request not found");
      }

      res.json(request);
    } catch (error) {
      console.error("Error updating friend request:", error);
      res.status(500).send("Error updating friend request");
    }
  });

  // Channel Invites
  app.post("/api/channels/:channelId/invites", async (req, res) => {
    if (!req.isAuthenticated() || !req.user?.id) {
      return res.status(401).send("Not authenticated");
    }

    const channelId = parseInt(req.params.channelId);
    const { receiverId } = req.body;
    if (!receiverId) {
      return res.status(400).send("Receiver ID is required");
    }

    try {
      const memberships = await db
        .select()
        .from(channelMembers)
        .where(
          and(
            eq(channelMembers.channelId, channelId),
            eq(channelMembers.userId, req.user.id)
          )
        );

      if (memberships.length === 0) {
        return res.status(403).send("You are not a member of this channel");
      }

      const existingInvites = await db
        .select()
        .from(channelInvites)
        .where(
          and(
            eq(channelInvites.channelId, channelId),
            eq(channelInvites.receiverId, receiverId),
            eq(channelInvites.status, "pending")
          )
        );

      if (existingInvites.length > 0) {
        return res.status(400).send("Invite already exists");
      }

      const [invite] = await db
        .insert(channelInvites)
        .values({
          channelId,
          senderId: req.user.id,
          receiverId,
        })
        .returning();

      res.json(invite);
    } catch (error) {
      console.error("Error creating channel invite:", error);
      res.status(500).send("Error creating channel invite");
    }
  });

  app.put("/api/channel-invites/:id", async (req, res) => {
    if (!req.isAuthenticated() || !req.user?.id) {
      return res.status(401).send("Not authenticated");
    }

    const { id } = req.params;
    const { status } = req.body;
    if (!status || !["accepted", "rejected"].includes(status)) {
      return res.status(400).send("Valid status is required");
    }

    try {
      const [invite] = await db
        .update(channelInvites)
        .set({ status })
        .where(
          and(
            eq(channelInvites.id, parseInt(id)),
            eq(channelInvites.receiverId, req.user.id),
            eq(channelInvites.status, "pending")
          )
        )
        .returning();

      if (!invite) {
        return res.status(404).send("Channel invite not found");
      }

      if (status === "accepted") {
        // Add user to channel
        await db.insert(channelMembers).values({
          channelId: invite.channelId,
          userId: req.user.id,
        });
      }

      res.json(invite);
    } catch (error) {
      console.error("Error updating channel invite:", error);
      res.status(500).send("Error updating channel invite");
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

    try {
      const channelMessages = await db.query.messages.findMany({
        where: eq(messages.channelId, channelId),
        with: {
          user: true,
        },
        orderBy: desc(messages.createdAt)
      });

      res.json(channelMessages);
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).send("Error fetching messages");
    }
  });

  app.post("/api/channels/:channelId/messages", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const channelId = parseInt(req.params.channelId);
    if (isNaN(channelId)) {
      return res.status(400).send("Invalid channel ID");
    }

    const { content } = req.body;
    if (!content || typeof content !== "string") {
      return res.status(400).send("Message content is required");
    }

    try {
      const [message] = await db.insert(messages)
        .values({
          content,
          channelId,
          userId: req.user.id,
        })
        .returning();

      const [messageWithRelations] = await db.query.messages.findMany({
        where: eq(messages.id, message.id),
        with: {
          user: true
        },
        limit: 1
      });

      res.json(messageWithRelations);
    } catch (error) {
      console.error("Error creating message:", error);
      res.status(500).send("Error creating message");
    }
  });

  // Message Reactions
  app.post("/api/messages/:messageId/reactions", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    const messageId = parseInt(req.params.messageId);
    if (isNaN(messageId)) {
      return res.status(400).send("Invalid message ID");
    }

    const { emoji } = req.body;
    if (!emoji || typeof emoji !== "string") {
      return res.status(400).send("Emoji is required");
    }

    try {
      // Check if user already reacted with this emoji
      const existingReactions = await db
        .select()
        .from(messageReactions)
        .where(eq(messageReactions.messageId, messageId))
        .where(eq(messageReactions.userId, req.user.id))
        .where(eq(messageReactions.emoji, emoji));

      if (existingReactions.length > 0) {
        // Remove reaction if it already exists
        await db
          .delete(messageReactions)
          .where(eq(messageReactions.id, existingReactions[0].id));
      } else {
        // Add new reaction
        await db.insert(messageReactions).values({
          messageId,
          userId: req.user.id,
          emoji,
        });
      }

      const [message] = await db.query.messages.findMany({
        where: eq(messages.id, messageId),
        with: {
          user: true,
          reactions: {
            with: {
              user: true,
            },
          },
        },
        limit: 1,
      });

      res.json(message);
    } catch (error) {
      console.error("Error managing reaction:", error);
      res.status(500).send("Error managing reaction");
    }
  });

  return server;
}