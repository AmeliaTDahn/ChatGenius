import type { Express } from "express";
import { createServer, type Server } from "http";
import { db } from "@db";
import { users, type User } from "@db/schema";
import { eq } from "drizzle-orm";
import { setupAuth } from "./auth";
import { channels, channelMembers, messages } from "@db/schema";
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
        user: true
      },
      orderBy: (messages, { desc }) => [desc(messages.createdAt)]
    });

    res.json(channelMessages);
  });

  return server;
}