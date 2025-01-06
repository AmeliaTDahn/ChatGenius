import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { IncomingMessage } from 'http';
import type { User, Message } from '@db/schema';
import { db } from '@db';
import { eq } from 'drizzle-orm';
import { users, messages } from '@db/schema';

interface AuthenticatedWebSocket extends WebSocket {
  userId?: number;
  isAlive: boolean;
}

type WSMessage = {
  type: 'message' | 'typing' | 'presence' | 'ping';
  channelId?: number;
  content?: string;
  userId?: number;
  isOnline?: boolean;
  message?: Message;
};

type VerifyClientInfo = {
  origin: string;
  secure: boolean;
  req: IncomingMessage;
};

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ 
    server,
    path: '/ws',
    verifyClient: (info: VerifyClientInfo) => {
      const protocol = info.req.headers['sec-websocket-protocol'];
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
    wss.clients.forEach((ws) => {
      const client = ws as AuthenticatedWebSocket;
      if (client.isAlive === false) {
        if (client.userId) {
          updateUserPresence(client.userId, false);
        }
        return client.terminate();
      }
      client.isAlive = false;
      client.ping();
    });
  }, 30000);

  const broadcastToChannel = async (channelId: number, message: WSMessage) => {
    try {
      if (message.type === 'message' && message.content && message.userId) {
        // Save message to database
        const [newMessage] = await db
          .insert(messages)
          .values({
            content: message.content,
            channelId: channelId,
            userId: message.userId,
          })
          .returning();

        if (!newMessage) {
          throw new Error('Failed to insert message');
        }

        // Fetch complete message with user data
        const messageWithUser = await db.query.messages.findFirst({
          where: eq(messages.id, newMessage.id),
          with: {
            user: true,
          },
        });

        if (!messageWithUser) {
          throw new Error('Failed to fetch message with user');
        }

        // Broadcast to all clients in the channel
        wss.clients.forEach((ws) => {
          const client = ws as AuthenticatedWebSocket;
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
              type: 'message',
              channelId,
              message: messageWithUser,
            }));
          }
        });
      } else {
        // For non-message types (typing, presence)
        wss.clients.forEach((ws) => {
          const client = ws as AuthenticatedWebSocket;
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
          }
        });
      }
    } catch (error) {
      console.error('Error broadcasting message:', error);
    }
  };

  const updateUserPresence = async (userId: number, isOnline: boolean) => {
    try {
      await db
        .update(users)
        .set({ isOnline })
        .where(eq(users.id, userId));

      wss.clients.forEach((ws) => {
        const client = ws as AuthenticatedWebSocket;
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

  wss.on('connection', async (ws: AuthenticatedWebSocket, req) => {
    try {
      const userId = parseInt(new URL(req.url!, `http://${req.headers.host}`).searchParams.get('userId') || '0');
      if (!userId) {
        ws.close();
        return;
      }

      ws.userId = userId;
      ws.isAlive = true;
      clients.set(userId, ws);
      await updateUserPresence(userId, true);

      ws.on('pong', () => heartbeat(ws));

      ws.on('message', async (data) => {
        try {
          const message: WSMessage = JSON.parse(data.toString());

          switch (message.type) {
            case 'message':
              if (message.channelId && message.content) {
                await broadcastToChannel(message.channelId, {
                  ...message,
                  userId: ws.userId
                });
              }
              break;
            case 'typing':
              if (message.channelId) {
                await broadcastToChannel(message.channelId, {
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
        if (ws.userId) {
          updateUserPresence(ws.userId, false);
          clients.delete(ws.userId);
        }
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