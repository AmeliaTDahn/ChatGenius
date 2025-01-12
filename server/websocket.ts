import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { IncomingMessage } from 'http';
import type { User, Message } from '@db/schema';
import { db } from '@db';
import { eq } from 'drizzle-orm';
import { users, messages, channels } from '@db/schema';

interface AuthenticatedWebSocket extends WebSocket {
  userId?: number;
  tabId?: string;
  isAlive: boolean;
}

type WSMessage = {
  type: 'message' | 'typing' | 'presence';
  channelId?: number;
  content?: string;
  userId?: number;
  tabId?: string;
  isOnline?: boolean;
  parentId?: number;
};

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ noServer: true });

  const heartbeat = (ws: AuthenticatedWebSocket) => {
    ws.isAlive = true;
  };

  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      const client = ws as AuthenticatedWebSocket;
      if (!client.isAlive) {
        if (client.userId) updateUserPresence(client.userId, false);
        return client.terminate();
      }
      client.isAlive = false;
      client.ping();
    });
  }, 30000);

  const broadcastToChannel = async (channelId: number, message: any) => {
    const channelMembers = await db
      .select({ userId: channels.id })
      .from(channels)
      .where(eq(channels.id, channelId));

    const memberIds = new Set(channelMembers.map(m => m.userId));

    wss.clients.forEach((ws) => {
      const client = ws as AuthenticatedWebSocket;
      if (client.readyState === WebSocket.OPEN && client.userId && memberIds.has(client.userId)) {
        client.send(JSON.stringify(message));
      }
    });
  };

  const updateUserPresence = async (userId: number, isOnline: boolean) => {
    await db.update(users).set({ isOnline }).where(eq(users.id, userId));
    wss.clients.forEach((ws) => {
      const client = ws as AuthenticatedWebSocket;
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: 'presence', userId, isOnline }));
      }
    });
  };

  wss.on('connection', async (ws: AuthenticatedWebSocket, req: IncomingMessage) => {
    try {
      if (!req.session?.passport?.user) {
        ws.close(1008, 'Not authenticated');
        return;
      }

      ws.userId = req.session.passport.user;
      ws.isAlive = true;

      await updateUserPresence(ws.userId, true);

      ws.on('pong', () => heartbeat(ws));

      ws.on('message', async (data) => {
        try {
          const message: WSMessage = JSON.parse(data.toString());

          switch (message.type) {
            case 'message': {
              if (!message.channelId || !message.content || !ws.userId) {
                return;
              }

              const [newMessage] = await db.insert(messages)
                .values({
                  content: message.content,
                  channelId: message.channelId,
                  userId: ws.userId,
                  parentId: message.parentId
                })
                .returning();

              if (newMessage) {
                const fullMessage = await db.query.messages.findFirst({
                  where: eq(messages.id, newMessage.id),
                  with: {
                    user: {
                      columns: {
                        id: true,
                        username: true,
                        avatarUrl: true,
                      }
                    }
                  }
                });

                await broadcastToChannel(message.channelId, {
                  type: 'message',
                  message: fullMessage
                });
              }
              break;
            }

            case 'typing': {
              if (message.channelId) {
                await broadcastToChannel(message.channelId, {
                  type: 'typing',
                  channelId: message.channelId,
                  userId: ws.userId
                });
              }
              break;
            }
          }
        } catch (error) {
          console.error('Error processing WebSocket message:', error);
        }
      });

      ws.on('close', () => {
        if (ws.userId) {
          updateUserPresence(ws.userId, false);
        }
      });

    } catch (error) {
      console.error('WebSocket connection error:', error);
      ws.terminate();
    }
  });

  wss.on('close', () => clearInterval(interval));

  return wss;
}