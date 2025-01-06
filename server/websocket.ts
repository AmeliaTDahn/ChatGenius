import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { User } from '@db/schema';
import { db } from '@db';
import { eq } from 'drizzle-orm';
import { users } from '@db/schema';

interface AuthenticatedWebSocket extends WebSocket {
  userId?: number;
  isAlive: boolean;
}

type WSMessage = {
  type: 'message' | 'typing' | 'presence' | 'ping';
  channelId?: number;
  content?: string;
  userId?: number;
};

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ 
    server,
    path: '/ws',
    // Handle vite HMR connections
    verifyClient: (info) => {
      const protocol = info.req.headers['sec-websocket-protocol'];
      // Allow vite HMR connections
      if (protocol === 'vite-hmr') {
        return false;
      }
      return true;
    }
  });

  const clients = new Map<number, AuthenticatedWebSocket>();

  const heartbeat = (ws: AuthenticatedWebSocket) => {
    ws.isAlive = true;
  };

  const interval = setInterval(() => {
    wss.clients.forEach((ws: AuthenticatedWebSocket) => {
      if (ws.isAlive === false) {
        updateUserPresence(ws.userId!, false);
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  const broadcastToChannel = (channelId: number, message: WSMessage) => {
    wss.clients.forEach((client: AuthenticatedWebSocket) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(message));
      }
    });
  };

  const updateUserPresence = async (userId: number, isOnline: boolean) => {
    try {
      await db.update(users)
        .set({ isOnline })
        .where(eq(users.id, userId));

      wss.clients.forEach((client: AuthenticatedWebSocket) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: 'presence',
            userId,
            isOnline
          }));
        }
      });
    } catch (err) {
      console.error('Error updating user presence:', err);
    }
  };

  wss.on('connection', (ws: AuthenticatedWebSocket, req) => {
    try {
      const userId = parseInt(req.url?.split('=')[1] || '0');
      if (!userId) {
        ws.close();
        return;
      }

      ws.userId = userId;
      ws.isAlive = true;
      clients.set(userId, ws);
      updateUserPresence(userId, true);

      ws.on('pong', () => heartbeat(ws));

      ws.on('message', async (data) => {
        try {
          const message: WSMessage = JSON.parse(data.toString());

          switch (message.type) {
            case 'message':
              if (message.channelId && message.content) {
                broadcastToChannel(message.channelId, message);
              }
              break;
            case 'typing':
              if (message.channelId) {
                broadcastToChannel(message.channelId, {
                  type: 'typing',
                  channelId: message.channelId,
                  userId: ws.userId
                });
              }
              break;
            case 'ping':
              ws.isAlive = true;
              break;
          }
        } catch (err) {
          console.error('Invalid message format:', err);
        }
      });

      ws.on('close', () => {
        updateUserPresence(userId, false);
        clients.delete(userId);
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        ws.terminate();
      });
    } catch (err) {
      console.error('Error in WebSocket connection:', err);
      ws.terminate();
    }
  });

  wss.on('close', () => {
    clearInterval(interval);
  });

  return wss;
}