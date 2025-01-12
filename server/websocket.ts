import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { IncomingMessage } from 'http';
import type { User, Message } from '@db/schema';
import { db } from '@db';
import { eq } from 'drizzle-orm';
import { users, messages, channels } from '@db/schema';

interface AuthenticatedWebSocket extends WebSocket {
  userId?: number;
  sessionId?: string;
  isAlive: boolean;
}

type WSMessage = {
  type: 'message' | 'typing' | 'presence' | 'ping';
  channelId?: number;
  content?: string;
  userId?: number;
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
        return client.terminate();
      }
      client.isAlive = false;
      client.ping();
    });
  }, 30000);

  const broadcastToOthers = async (channelId: number, message: any, senderId: number) => {
    wss.clients.forEach((ws) => {
      const client = ws as AuthenticatedWebSocket;
      if (client.readyState === WebSocket.OPEN && client.userId !== senderId) {
        client.send(JSON.stringify(message));
      }
    });
  };

  wss.on('connection', async (ws: AuthenticatedWebSocket, req: IncomingMessage) => {
    try {
      if (!(req as any).user?.id) {
        ws.close(1008, 'Not authenticated');
        return;
      }

      ws.userId = (req as any).user.id;
      ws.isAlive = true;

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
                    },
                    reactions: true,
                    attachments: true
                  }
                });

                // Send to all clients in the channel except the sender
                await broadcastToOthers(message.channelId, {
                  type: 'message',
                  message: fullMessage
                }, ws.userId);

                // Send back to sender to confirm receipt
                ws.send(JSON.stringify({
                  type: 'message',
                  message: fullMessage
                }));
              }
              break;
            }

            case 'typing': {
              if (!message.channelId || !ws.userId) return;
              await broadcastToOthers(message.channelId, {
                type: 'typing',
                channelId: message.channelId,
                userId: ws.userId
              }, ws.userId);
              break;
            }
          }
        } catch (error) {
          console.error('Error processing WebSocket message:', error);
        }
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        ws.terminate();
      });

    } catch (error) {
      console.error('WebSocket connection error:', error);
      ws.terminate();
    }
  });

  wss.on('close', () => clearInterval(interval));

  return wss;
}