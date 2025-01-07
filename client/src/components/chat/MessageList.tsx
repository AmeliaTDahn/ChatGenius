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
  const { messages, isLoading, addReaction, addMessage } = useMessages(channelId);
  const bottomRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const { user } = useUser();

  useEffect(() => {
    if (!user) return;

    // Initialize WebSocket connection
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.addEventListener('open', () => {
      // Send authentication message
      ws.send(JSON.stringify({
        type: 'auth',
        userId: user.id
      }));
    });

    ws.addEventListener('message', (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'new_message' && data.message.channelId === channelId) {
        addMessage(data.message);
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    });

    // Cleanup on unmount
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [user, channelId, addMessage]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const MessageComponent = ({ message }: { message: Message }) => {
    const handleReaction = async (emoji: string) => {
      await addReaction(message.id, emoji);
    };

    // Group reactions by emoji
    const reactionGroups = message.reactions?.reduce<Record<string, number>>((acc, reaction) => {
      acc[reaction.emoji] = (acc[reaction.emoji] || 0) + 1;
      return acc;
    }, {}) ?? {};

    return (
      <div id={`message-${message.id}`} className="flex items-start gap-3 transition-colors duration-200">
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

          <div className="flex items-center gap-2 mt-2">
            <div className="flex gap-1">
              {Object.entries(reactionGroups).map(([emoji, count]) => (
                <Button
                  key={emoji}
                  variant="secondary"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => handleReaction(emoji)}
                >
                  <span>{emoji}</span>
                  <span className="ml-1">{count}</span>
                </Button>
              ))}
            </div>
            <ReactionPicker onSelectEmoji={handleReaction} />
          </div>
        </div>
      </div>
    );
  };

  return (
    <ScrollArea className="flex-1 p-4">
      <div className="space-y-4">
        {messages.map((message) => (
          <MessageComponent key={message.id} message={message} />
        ))}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}