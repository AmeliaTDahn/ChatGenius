import { useEffect, useRef, useState } from "react";
import { useMessages } from "@/hooks/use-messages";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { ReactionPicker } from "./ReactionPicker";
import type { Message } from "@db/schema";
import { useUser } from "@/hooks/use-user";

type MessageListProps = {
  channelId: number;
};

export function MessageList({ channelId }: MessageListProps) {
  const { messages, isLoading, addMessage } = useMessages(channelId);
  const bottomRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const { user } = useUser();
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);

  useEffect(() => {
    if (!user) return;

    const connectWebSocket = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.addEventListener('open', () => {
        ws.send(JSON.stringify({
          type: 'auth',
          userId: user.id
        }));
      });

      ws.addEventListener('message', (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'new_message' && data.message.channelId === channelId) {
          addMessage(data.message);
          if (shouldAutoScroll) {
            bottomRef.current?.scrollIntoView({ behavior: "smooth" });
          }
        }
      });

      ws.addEventListener('close', () => {
        // Attempt to reconnect after a delay
        setTimeout(connectWebSocket, 3000);
      });

      ws.addEventListener('error', () => {
        ws.close();
      });
    };

    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [user, channelId, addMessage, shouldAutoScroll]);

  // Handle scroll position and auto-scroll behavior
  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const { scrollHeight, scrollTop, clientHeight } = event.currentTarget;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
    setShouldAutoScroll(isNearBottom);
  };

  useEffect(() => {
    if (shouldAutoScroll) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, shouldAutoScroll]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1 p-4" onScroll={handleScroll}>
      <div className="space-y-4">
        {messages.map((message) => (
          <div key={message.id} className="flex items-start gap-3">
            <Avatar className="h-8 w-8">
              {message.user.avatarUrl ? (
                <AvatarImage src={message.user.avatarUrl} alt={message.user.username} />
              ) : (
                <AvatarFallback>
                  {message.user.username[0].toUpperCase()}
                </AvatarFallback>
              )}
            </Avatar>
            <div className="flex-1">
              <div className="flex items-baseline gap-2">
                <span className="font-medium text-sm">
                  {message.user.username}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(message.createdAt).toLocaleTimeString()}
                </span>
              </div>
              <p className="text-sm mt-1">{message.content}</p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}