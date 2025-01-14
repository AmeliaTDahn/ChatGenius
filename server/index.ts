import express, { type Request, Response, NextFunction } from "express";
import { createServer } from "http";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { setupWebSocket } from './websocket';
import session from 'express-session';
import type { User } from "@db/schema";
import createMemoryStore from "memorystore";

// Declare session type to include user
declare module 'express-session' {
  interface SessionData {
    user?: User;
  }
}

const app = express();
const server = createServer(app);

// Create a MemoryStore instance for session storage
const MemoryStore = createMemoryStore(session);

// Session middleware configuration with improved security
const sessionMiddleware = session({
  secret: process.env.REPL_ID || "chat-app-secret",
  resave: false,
  saveUninitialized: false,
  name: 'sessionId', // Set a specific cookie name
  proxy: true,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    httpOnly: true,
  },
  store: new MemoryStore({
    checkPeriod: 86400000, // Prune expired entries every 24h
    stale: false, // Don't serve stale data
  })
});

// Apply middleware
app.use(sessionMiddleware);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (req.path.startsWith("/api")) {
      log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
    }
  });
  next();
});

// Register routes before error handling
registerRoutes(app);

// Setup WebSocket with session handling
setupWebSocket(server, sessionMiddleware);

// Error handling middleware
interface AppError extends Error {
  status?: number;
  statusCode?: number;
}

app.use((err: AppError, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Error:', err);
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  res.status(status).json({ message });
});

// Setup Vite or serve static files
if (process.env.NODE_ENV === "development") {
  setupVite(app, server);
} else {
  serveStatic(app);
}

// Start server
const PORT = parseInt(process.env.PORT || '5000', 10);
server.listen(PORT, "0.0.0.0", () => {
  log(`Server running at http://0.0.0.0:${PORT}`);
});