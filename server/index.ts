import express from "express";
import { createServer } from "http";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import session from 'express-session';
import type { User } from "@db/schema";
import createMemoryStore from "memorystore";

declare module 'express-session' {
  interface SessionData {
    user?: User;
  }
}

const app = express();
const server = createServer(app);

// Create memory store
const MemoryStore = createMemoryStore(session);

// Session middleware
const sessionMiddleware = session({
  secret: process.env.REPL_ID || "chat-app-secret",
  resave: false,
  saveUninitialized: false,
  store: new MemoryStore({
    checkPeriod: 86400000
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000
  }
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

// Setup WebSocket and routes
const wss = registerRoutes(app);

// Handle WebSocket upgrade
server.on('upgrade', (request, socket, head) => {
  if (request.headers['sec-websocket-protocol'] === 'vite-hmr') {
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});


// Error handling middleware
interface AppError extends Error {
  status?: number;
  statusCode?: number;
}

app.use((err: AppError, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
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
const PORT = parseInt(process.env.PORT || '3000', 10); // Use 3000 as default from edited code
server.listen(PORT, "0.0.0.0", () => {
  log(`Server running on port ${PORT}`);
});