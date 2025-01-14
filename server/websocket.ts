import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { IncomingMessage } from 'http';
import type { Message } from '@db/schema';
import { db } from '@db';
import { eq } from 'drizzle-orm';
import { messages } from '@db/schema';
import type { RequestHandler } from 'express';

interface AuthenticatedWebSocket extends WebSocket {
  userId?: number;
  tabId?: string;
  isAlive: boolean;
}

type WSMessage = {
  type: 'message' | 'typing' | 'presence' | 'ping' | 'error';
  channelId?: number;
  content?: string;
  userId?: number;
  tabId?: string;
  isOnline?: boolean;
  message?: Message;
  error?: string;
};

const wss = new WebSocketServer({ noServer: true });

export function setupWebSocket(server: Server, sessionMiddleware: RequestHandler) {
  console.log('WebSocket server created');

  const pingInterval = setInterval(() => {
    wss.clients.forEach((ws: AuthenticatedWebSocket) => {
      if (ws.isAlive === false) {
        console.log('Terminating inactive WebSocket connection');
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => {
    console.log('WebSocket server closing');
    clearInterval(pingInterval);
  });

  wss.on('connection', async (ws: AuthenticatedWebSocket, req: IncomingMessage) => {
    try {
      console.log('New WebSocket connection attempt');
      const urlParams = new URL(req.url!, `http://${req.headers.host}`).searchParams;
      const userId = parseInt(urlParams.get('userId') || '0', 10);
      const tabId = urlParams.get('tabId');

      if (!userId || !tabId) {
        console.log('Invalid connection parameters:', { userId, tabId });
        ws.send(JSON.stringify({ 
          type: 'error', 
          error: 'Invalid connection parameters' 
        }));
        ws.close(1008, 'Missing userId or tabId');
        return;
      }

      ws.userId = userId;
      ws.tabId = tabId;
      ws.isAlive = true;

      console.log(`WebSocket connected for user ${userId} with tabId ${tabId}`);

      ws.on('pong', () => {
        ws.isAlive = true;
      });

      ws.on('message', async (data: Buffer) => {
        try {
          const message: WSMessage = JSON.parse(data.toString());
          console.log('Received message:', message);

          switch (message.type) {
            case 'message': {
              if (!message.content || !message.channelId || !ws.userId) {
                ws.send(JSON.stringify({
                  type: 'error',
                  error: 'Invalid message format'
                }));
                return;
              }

              try {
                const [newMessage] = await db.insert(messages)
                  .values({
                    content: message.content,
                    channelId: message.channelId,
                    userId: ws.userId,
                  })
                  .returning();

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
                    reactions: {
                      with: {
                        user: {
                          columns: {
                            id: true,
                            username: true,
                            avatarUrl: true,
                          }
                        }
                      }
                    }
                  }
                });

                if (fullMessage) {
                  console.log('Broadcasting message to all clients');
                  wss.clients.forEach((client: AuthenticatedWebSocket) => {
                    if (client.readyState === WebSocket.OPEN) {
                      client.send(JSON.stringify({
                        type: 'message',
                        message: fullMessage,
                        channelId: message.channelId
                      }));
                    }
                  });
                }
              } catch (error) {
                console.error('Error saving message:', error);
                ws.send(JSON.stringify({
                  type: 'error',
                  error: 'Failed to save message'
                }));
              }
              break;
            }

            case 'typing': {
              if (!message.channelId || !ws.userId) {
                return;
              }

              console.log('Broadcasting typing status');
              wss.clients.forEach((client: AuthenticatedWebSocket) => {
                if (client.readyState === WebSocket.OPEN && client.tabId !== ws.tabId) {
                  client.send(JSON.stringify({
                    type: 'typing',
                    channelId: message.channelId,
                    userId: ws.userId
                  }));
                }
              });
              break;
            }

            case 'ping': {
              ws.isAlive = true;
              break;
            }
          }
        } catch (error) {
          console.error('WebSocket message error:', error);
          ws.send(JSON.stringify({
            type: 'error',
            error: 'Failed to process message'
          }));
        }
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        ws.terminate();
      });

      ws.on('close', () => {
        console.log(`WebSocket closed for user ${userId}`);
        ws.isAlive = false;
      });

    } catch (error) {
      console.error('Error in WebSocket connection:', error);
      ws.terminate();
    }
  });

  server.on('upgrade', (request, socket, head) => {
    if (request.headers['sec-websocket-protocol'] === 'vite-hmr') {
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  return wss;
}