import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { IncomingMessage } from 'http';
import type { User, Message } from '@db/schema';
import { db } from '@db';
import { eq } from 'drizzle-orm';
import { users, messages } from '@db/schema';
import { aiService } from './services/ai';

interface AuthenticatedWebSocket extends WebSocket {
  userId?: number;
  tabId?: string;
  isAlive: boolean;
}

type WSMessage = {
  type: 'message' | 'typing' | 'presence' | 'ping' | 'friend_request' | 'message_read';
  channelId?: number;
  content?: string;
  userId?: number;
  tabId?: string;
  isOnline?: boolean;
  message?: Message;
  friendRequest?: {
    id: number;
    sender: {
      id: number;
      username: string;
      avatarUrl?: string;
    };
  };
  messageId?: number;
  readAt?: string;
};

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({
    server,
    path: '/ws',
  });

  const clients = new Map<string, AuthenticatedWebSocket>();

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

  const broadcastToChannel = async (channelId: number, message: WSMessage, senderTabId: string, senderId?: number) => {
    wss.clients.forEach((ws) => {
      const client = ws as AuthenticatedWebSocket;
      if (client.readyState === WebSocket.OPEN && (!senderId || client.userId !== senderId)) {
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
      const urlParams = new URL(req.url!, `http://${req.headers.host}`).searchParams;
      const userId = parseInt(urlParams.get('userId') || '0');
      const tabId = urlParams.get('tabId');

      if (!userId || !tabId) {
        ws.close(1008, 'Missing userId or tabId');
        return;
      }

      ws.userId = userId;
      ws.tabId = tabId;
      ws.isAlive = true;

      const clientKey = `${userId}-${tabId}`;
      clients.set(clientKey, ws);

      await updateUserPresence(userId, true);

      ws.on('pong', () => heartbeat(ws));

      ws.on('message', async (data) => {
        const message: WSMessage = JSON.parse(data.toString());

        switch (message.type) {
          case 'message':
            if (message.channelId && message.content && ws.userId) {
              try {
                console.log('Processing message for channel:', message.channelId);

                // Process message with AI service
                const aiResponse = await aiService.processMessage(message.channelId, message.content);
                console.log('Got AI response');

                // Create AI message in database
                const [newMessage] = await db.insert(messages)
                  .values({
                    content: aiResponse,
                    channelId: message.channelId,
                    userId: -1, // Special AI user ID
                    isAIMessage: true
                  })
                  .returning();

                console.log('Stored AI response in database');

                // Broadcast AI response
                await broadcastToChannel(
                  message.channelId,
                  {
                    type: 'message',
                    channelId: message.channelId,
                    message: {
                      ...newMessage,
                      user: {
                        id: -1,
                        username: 'AI Assistant',
                        avatarUrl: null
                      }
                    }
                  },
                  ws.tabId!
                );

                console.log('Broadcasted AI response to channel');
              } catch (error) {
                console.error('Error processing AI message:', error);
                ws.send(JSON.stringify({
                  type: 'error',
                  message: 'Failed to process AI message'
                }));
              }
            }
            break;

          case 'typing':
            if (message.channelId) {
              await broadcastToChannel(message.channelId, { type: 'typing', channelId: message.channelId, userId: ws.userId }, ws.tabId!);
            }
            break;

          case 'ping':
            ws.isAlive = true;
            break;
        }
      });

      ws.on('close', () => {
        clients.delete(clientKey);
        if (Array.from(clients.keys()).filter((key) => key.startsWith(`${userId}-`)).length === 0) {
          updateUserPresence(userId, false);
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

  wss.on('close', () => clearInterval(interval));

  return { wss, broadcastToChannel };
}