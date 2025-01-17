import { useEffect, useRef, useCallback, useState } from 'react';
import type { Message } from '@db/schema';
import { useToast } from '@/hooks/use-toast';

type WSMessage = {
  type: 'message' | 'typing' | 'presence' | 'ping' | 'friend_request' | 'ai_message';
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
  aiResponse?: string;
};

export function useWebSocket() {
  const ws = useRef<WebSocket | null>(null);
  const { toast } = useToast();
  const [lastMessage, setLastMessage] = useState<WSMessage | null>(null);
  const tabId = useRef<string | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = Infinity;

  if (!tabId.current) {
    if (!localStorage.getItem('tabId')) {
      localStorage.setItem('tabId', `${Date.now()}-${Math.random()}`);
    }
    tabId.current = localStorage.getItem('tabId');
  }

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws?tabId=${tabId.current}`;

    const connect = () => {
      if (ws.current?.readyState === WebSocket.OPEN) {
        return;
      }

      ws.current = new WebSocket(wsUrl);

      ws.current.onmessage = (event) => {
        try {
          const data: WSMessage = JSON.parse(event.data);
          setLastMessage(data);

          switch (data.type) {
            case 'message':
              // Handle regular messages
              break;
            case 'presence':
              // Handle presence updates
              break;
            case 'friend_request':
              if (data.friendRequest) {
                toast({
                  title: 'New Friend Request',
                  description: `${data.friendRequest.sender.username} sent you a friend request!`,
                  duration: 5000,
                });
              }
              break;
            case 'ai_message':
              // Handle AI messages
              break;
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      ws.current.onopen = () => {
        console.log('WebSocket connected');
        reconnectAttempts.current = 0;
      };

      ws.current.onclose = () => {
        if (reconnectAttempts.current < maxReconnectAttempts) {
          console.log('WebSocket connection closed, attempting to reconnect...');
          const delay = Math.min(1000 * Math.pow(1.5, reconnectAttempts.current), 30000);
          console.log(`Attempting to reconnect in ${delay/1000} seconds...`);
          setTimeout(() => {
            reconnectAttempts.current++;
            connect();
          }, delay);
        }
      };

     /* ws.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        toast({
          title: 'Connection Error',
          description: 'Failed to connect to the server. Please check your connection.',
          variant: 'destructive',
        });
      };*/
    };

    connect();

    const pingInterval = setInterval(() => {
      if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ type: 'ping', tabId: tabId.current }));
      }
    }, 25000);

    return () => {
      clearInterval(pingInterval);
      ws.current?.close();
    };
  }, [toast]);

  const sendMessage = useCallback((message: Partial<WSMessage>) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ ...message, tabId: tabId.current }));
    } else {
      console.warn('WebSocket not connected, queueing message');
    }
  }, []);

  return { sendMessage, lastMessage };
}