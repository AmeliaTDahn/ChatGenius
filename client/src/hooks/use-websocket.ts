import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { User, Message } from '@db/schema';
import { useToast } from '@/hooks/use-toast';

type WSMessage = {
  type: 'message' | 'typing' | 'presence' | 'ping' | 'friend_request';
  channelId?: number;
  content?: string;
  userId?: number;
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
};

export function useWebSocket(user: User | null) {
  const ws = useRef<WebSocket | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    if (!user) return;

    // Use secure WebSocket if the page is loaded over HTTPS
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws?userId=${user.id}`;
    ws.current = new WebSocket(wsUrl);
    
    // Attempt to reconnect on connection close
    ws.current.onclose = () => {
      setTimeout(() => {
        if (user) {
          ws.current = new WebSocket(wsUrl);
        }
      }, 1000);
    };

    ws.current.onmessage = (event) => {
      const message: WSMessage = JSON.parse(event.data);

      switch (message.type) {
        case 'message':
          if (message.channelId && message.message) {
            queryClient.setQueryData<Message[]>(
              [`/api/channels/${message.channelId}/messages`],
              (oldMessages = []) => {
                // Avoid duplicate messages
                const exists = oldMessages.some(m => m.id === message.message!.id);
                if (exists) return oldMessages;
                return [message.message, ...oldMessages];
              }
            );
            // Don't invalidate the query as we've already updated the cache
          }
          break;
        case 'presence':
          if (message.userId) {
            queryClient.setQueryData(['users', message.userId], (oldData: any) => ({
              ...oldData,
              isOnline: message.isOnline,
            }));
          }
          break;
        case 'friend_request':
          if (message.friendRequest) {
            // Update friend requests cache
            queryClient.setQueryData<any[]>(
              ['/api/friend-requests'],
              (oldRequests = []) => [message.friendRequest, ...oldRequests]
            );

            // Show notification toast
            toast({
              title: "New Friend Request",
              description: `${message.friendRequest.sender.username} sent you a friend request!`,
              duration: 5000,
            });
          }
          break;
      }
    };

    const pingInterval = setInterval(() => {
      if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ type: 'ping' }));
      }
    }, 25000);

    return () => {
      clearInterval(pingInterval);
      ws.current?.close();
    };
  }, [user, queryClient, toast]);

  const sendMessage = useCallback((message: WSMessage & { userId: number }) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(message));
    }
  }, []);

  return { sendMessage };
}