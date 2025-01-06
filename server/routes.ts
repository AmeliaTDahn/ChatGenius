import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { setupWebSocket } from "./websocket";
import { db } from "@db";
import { channels, messages, channelMembers, messageReactions } from "@db/schema";
import { eq, desc } from "drizzle-orm";

export function registerRoutes(app: Express): Server {
  setupAuth(app);
  const server = createServer(app);
  setupWebSocket(server);

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
      const [existingReaction] = await db
        .select()
        .from(messageReactions)
        .where(eq(messageReactions.messageId, messageId))
        .where(eq(messageReactions.userId, req.user.id))
        .where(eq(messageReactions.emoji, emoji));

      if (existingReaction) {
        // Remove reaction if it already exists
        await db
          .delete(messageReactions)
          .where(eq(messageReactions.id, existingReaction.id));
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