import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { db } from '@db';
import { eq, sql } from 'drizzle-orm';
import { messages, users } from '@db/schema';

interface AuthenticatedWebSocket extends WebSocket {
  userId?: number;
  isAlive: boolean;
}

type WSMessage = {
  type: 'message' | 'typing';
  channelId?: number;
  content?: string;
  userId?: number;
  parentId?: number;
};

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: AuthenticatedWebSocket) => {
    ws.isAlive = true;

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', async (data) => {
      const message: WSMessage = JSON.parse(data.toString());
      switch (message.type) {
        case 'message':
          if (message.channelId && message.content && ws.userId) {
            const [newMessage] = await db.insert(messages)
              .values({
                content: message.content,
                channelId: message.channelId,
                userId: ws.userId,
                parentId: message.parentId || null,
              })
              .returning();

            if (newMessage.parentId) {
              await db.update(messages)
                .set({ replyCount: sql`reply_count + 1` })
                .where(eq(messages.id, newMessage.parentId));
            }

            const fullMessage = await db.query.messages.findFirst({
              where: eq(messages.id, newMessage.id),
              with: { user: true },
            });

            wss.clients.forEach((client) => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: 'message', message: fullMessage }));
              }
            });
          }
          break;
      }
    });
  });

  setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) {
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);
}
