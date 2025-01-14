import { useEffect, useRef, useCallback } from 'react';
import type { User, Message } from '@db/schema';
import { useToast } from '@/hooks/use-toast';

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

export function useWebSocket(user: User | null, onMessage?: (message: Message) => void) {
  const ws = useRef<WebSocket | null>(null);
  const { toast } = useToast();
  const tabId = useRef<string | null>(null);

  if (!tabId.current) {
    if (!localStorage.getItem('tabId')) {
      localStorage.setItem('tabId', `${Date.now()}-${Math.random()}`);
    }
    tabId.current = localStorage.getItem('tabId');
  }

  useEffect(() => {
    if (!user) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}?userId=${user.id}&tabId=${tabId.current}`;
    console.log('Connecting to WebSocket:', wsUrl);

    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => {
      console.log('WebSocket connected');
    };

    ws.current.onmessage = (event) => {
      try {
        const data: WSMessage = JSON.parse(event.data);
        console.log('Received WebSocket message:', data);

        switch (data.type) {
          case 'message':
            if (data.message && onMessage) {
              onMessage(data.message);
            }
            break;
          case 'error':
            if (data.error) {
              toast({
                title: 'Error',
                description: data.error,
                variant: 'destructive',
              });
            }
            break;
          case 'typing':
            // Handle typing indicator if needed
            break;
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    ws.current.onclose = (event) => {
      console.log('WebSocket closed:', event);
      setTimeout(() => {
        if (user) {
          console.log('Attempting to reconnect WebSocket...');
          ws.current = new WebSocket(wsUrl);
        }
      }, 1000);
    };

    ws.current.onerror = (error) => {
      console.error('WebSocket error:', error);
      toast({
        title: 'Connection Error',
        description: 'Failed to connect to chat server. Retrying...',
        variant: 'destructive',
      });
    };

    const pingInterval = setInterval(() => {
      if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ type: 'ping', tabId: tabId.current }));
      }
    }, 25000);

    return () => {
      clearInterval(pingInterval);
      if (ws.current) {
        ws.current.close();
      }
    };
  }, [user, onMessage, toast]);

  const sendMessage = useCallback((message: WSMessage) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      console.log('Sending WebSocket message:', message);
      ws.current.send(JSON.stringify({ ...message, tabId: tabId.current }));
    } else {
      console.error('WebSocket is not connected');
      toast({
        title: 'Connection Error',
        description: 'Not connected to chat server. Please try again.',
        variant: 'destructive',
      });
    }
  }, [toast]);

  return { sendMessage };
}