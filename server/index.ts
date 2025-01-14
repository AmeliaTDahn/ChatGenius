import express, { type Request, Response, NextFunction } from "express";
import { createServer } from "http";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { setupWebSocket } from './websocket';
import session from 'express-session';
import type { User } from "@db/schema";

// Declare session type to include user
declare module 'express-session' {
  interface SessionData {
    user?: User;
  }
}

const app = express();
const server = createServer(app);

// Session middleware configuration
const sessionMiddleware = session({
  secret: process.env.REPL_ID || "chat-app-secret",
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
});

app.use(sessionMiddleware);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${Date.now() - start}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }
      log(logLine);
    }
  });
  next();
});

// Register routes before error handling
registerRoutes(app);

// Setup WebSocket with session handling
setupWebSocket(server, sessionMiddleware);

interface AppError extends Error {
  status?: number;
  statusCode?: number;
}

// Error handling middleware
app.use((err: AppError, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Error:', err);
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  res.status(status).json({ message });
  // Don't throw error here, just log it
});

// Setup Vite or serve static files
if (app.get("env") === "development") {
  setupVite(app, server);
} else {
  serveStatic(app);
}

// Start server
const PORT = parseInt(process.env.PORT || '5000', 10);
server.listen(PORT, "0.0.0.0", () => {
  log(`Server running at http://0.0.0.0:${PORT}`);
});