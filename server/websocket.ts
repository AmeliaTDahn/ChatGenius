import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { IncomingMessage } from 'http';
import type { Message } from '@db/schema';
import { db } from '@db';
import { eq } from 'drizzle-orm';
import { messages } from '@db/schema';
import type { RequestHandler } from 'express';
import type { SessionData } from 'express-session';

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
const authenticatedClients = new Set<AuthenticatedWebSocket>();

export function setupWebSocket(server: Server, sessionMiddleware: RequestHandler) {
  // Setup ping interval for connection maintenance
  const pingInterval = setInterval(() => {
    authenticatedClients.forEach((ws) => {
      if (!ws.isAlive) {
        authenticatedClients.delete(ws);
        ws.terminate();
        return;
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000); // Check every 30 seconds

  wss.on('close', () => {
    clearInterval(pingInterval);
  });

  wss.on('connection', async (ws: AuthenticatedWebSocket, req: IncomingMessage) => {
    try {
      const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
      const userId = parseInt(url.searchParams.get('userId') || '0');
      const tabId = url.searchParams.get('tabId');

      if (!userId || !tabId) {
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

      authenticatedClients.add(ws);

      ws.on('pong', () => {
        ws.isAlive = true;
      });

      ws.on('message', async (data: Buffer) => {
        try {
          const message: WSMessage = JSON.parse(data.toString());

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
                const inserted = await db.insert(messages)
                  .values({
                    content: message.content,
                    channelId: message.channelId,
                    userId: ws.userId,
                  })
                  .returning();

                if (!inserted || !inserted[0]) {
                  throw new Error('Failed to create message');
                }

                const newMessage = inserted[0];

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

                if (fullMessage) {
                  authenticatedClients.forEach((client) => {
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
                console.error('Error handling message:', error);
                ws.send(JSON.stringify({
                  type: 'error',
                  error: 'Failed to process message'
                }));
              }
              break;
            }

            case 'ping': {
              ws.isAlive = true;
              break;
            }

            default:
              ws.send(JSON.stringify({
                type: 'error',
                error: 'Unknown message type'
              }));
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
        authenticatedClients.delete(ws);
        ws.terminate();
      });

      ws.on('close', () => {
        authenticatedClients.delete(ws);
        ws.isAlive = false;
      });

    } catch (error) {
      console.error('Error in WebSocket connection:', error);
      ws.terminate();
    }
  });

  server.on('upgrade', (request: IncomingMessage, socket, head) => {
    // Ignore Vite HMR requests
    if (request.headers['sec-websocket-protocol'] === 'vite-hmr') {
      return;
    }

    sessionMiddleware(request as any, {} as any, () => {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    });
  });

  return wss;
}