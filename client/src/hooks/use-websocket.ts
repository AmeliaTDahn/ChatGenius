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
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const reconnectDelay = 1000; // Start with 1 second delay
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

    const connect = () => {
      console.log('Connecting to WebSocket:', wsUrl);

      if (ws.current?.readyState === WebSocket.OPEN) {
        console.log('WebSocket already connected');
        return;
      }

      ws.current = new WebSocket(wsUrl);

      ws.current.onopen = () => {
        console.log('WebSocket connected');
        reconnectAttempts.current = 0; // Reset reconnect attempts on successful connection
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
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      ws.current.onclose = (event) => {
        console.log('WebSocket closed:', event);
        if (reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          setTimeout(() => {
            if (user) {
              console.log(`Attempting to reconnect (${reconnectAttempts.current + 1}/${maxReconnectAttempts})...`);
              reconnectAttempts.current++;
              connect();
            }
          }, delay);
        } else {
          toast({
            title: 'Connection Lost',
            description: 'Failed to reconnect to chat server. Please refresh the page.',
            variant: 'destructive',
          });
        }
      };

      ws.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        toast({
          title: 'Connection Error',
          description: 'Failed to connect to chat server. Retrying...',
          variant: 'destructive',
        });
      };
    };

    connect();

    // Setup ping interval to keep connection alive
    const pingInterval = setInterval(() => {
      if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ type: 'ping', tabId: tabId.current }));
      }
    }, 25000); // Send ping every 25 seconds

    return () => {
      clearInterval(pingInterval);
      if (ws.current) {
        ws.current.onclose = null; // Prevent reconnection attempts on intentional close
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