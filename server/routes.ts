import type { Express } from "express";
import { createServer, type Server } from "http";
import { db } from "@db";
import { users, type User } from "@db/schema";
import { eq, and, or, ilike, desc } from "drizzle-orm";
import { setupAuth } from "./auth";
import { friendRequests } from "@db/schema";
import { channelMembers } from "@db/schema";
import { channels } from "@db/schema";
import { messages } from "@db/schema";
import { channelInvites } from "@db/schema";
import { messageReactions } from "@db/schema";


declare module 'express-session' {
  interface SessionData {
    passport: {
      user: number;
    };
  }
}

declare global {
  namespace Express {
    interface User extends User {}
  }
}

export function registerRoutes(app: Express): Server {
  setupAuth(app);
  const server = createServer(app);

  // Get user data
  app.get("/api/user", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).send("Not authenticated");
    }

    try {
      const [user] = await db
        .select()
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
return server;
}