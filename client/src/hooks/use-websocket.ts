import { useEffect, useRef, useCallback } from 'react';
import type { User, Message } from '@db/schema';
import { useToast } from '@/hooks/use-toast';

type WSMessage = {
  type: 'message' | 'typing' | 'presence' | 'ping';
  channelId?: number;
  content?: string;
  userId?: number;
  tabId?: string;
  isOnline?: boolean;
  message?: Message;
  parentId?: number;
};

export function useWebSocket(user: User | null, onMessage?: (message: Message) => void) {
  const ws = useRef<WebSocket | null>(null);
  const { toast } = useToast();
  const reconnectTimeout = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (!user) return;

    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      if (ws.current?.readyState === WebSocket.OPEN) {
        return;
      }

      ws.current = new WebSocket(wsUrl);

      ws.current.onopen = () => {
        console.log('WebSocket connected');
        if (reconnectTimeout.current) {
          clearTimeout(reconnectTimeout.current);
          reconnectTimeout.current = undefined;
        }
      };

      ws.current.onmessage = (event) => {
        try {
          const data: WSMessage = JSON.parse(event.data);

          switch (data.type) {
            case 'message':
              if (data.message && onMessage) {
                onMessage(data.message);
              }
              break;
            case 'presence':
              // Handle presence updates if needed
              break;
          }
        } catch (error) {
          console.error('Error processing WebSocket message:', error);
        }
      };

      ws.current.onclose = () => {
        console.log('WebSocket disconnected, attempting to reconnect...');
        if (!reconnectTimeout.current) {
          reconnectTimeout.current = setTimeout(() => {
            connect();
          }, 3000);
        }
      };

      ws.current.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    };

    connect();

    // Ping to keep connection alive
    const pingInterval = setInterval(() => {
      if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ type: 'ping' }));
      }
    }, 25000);

    return () => {
      clearInterval(pingInterval);
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
      if (ws.current) {
        ws.current.close();
      }
    };
  }, [user, onMessage]);

  const sendMessage = useCallback((message: WSMessage) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(message));
    } else {
      console.error('WebSocket is not connected');
      toast({
        title: "Connection Error",
        description: "Unable to send message. Please try again.",
        variant: "destructive"
      });
    }
  }, [toast]);

  return { sendMessage };
}