import { useEffect, useRef, useState } from "react";
import { useMessages } from "@/hooks/use-messages";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ThreadView } from "./ThreadView";
import type { Message } from "@db/schema";

export function MessageList({ channelId }: { channelId: number }) {
  const { messages, isLoading, handleWebSocketMessage } = useMessages(channelId);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [showThread, setShowThread] = useState(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const MessageComponent = ({ message }: { message: Message }) => {
    const handleReply = () => {
      setSelectedMessage(message);
      setShowThread(true);
    };

    return (
      <div id={`message-${message.id}`} className="flex items-start gap-3">
        <Avatar className="h-8 w-8">
          {message.user.avatarUrl ? (
            <AvatarImage src={message.user.avatarUrl} alt={message.user.username} />
          ) : (
            <AvatarFallback>{message.user.username[0].toUpperCase()}</AvatarFallback>
          )}
        </Avatar>
        <div className="flex-1">
          <div className="flex items-baseline gap-2">
            <span className="font-medium text-sm">{message.user.username}</span>
            <span className="text-xs text-muted-foreground">{new Date(message.createdAt).toLocaleTimeString()}</span>
          </div>
          <p className="text-sm mt-1">{message.content}</p>
          <div className="mt-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={handleReply}
            >
              Reply {message.replyCount > 0 && `(${message.replyCount})`}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {messages.map((message) => (
            <MessageComponent key={message.id} message={message} />
          ))}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>
      {showThread && selectedMessage && (
        <ThreadView
          message={selectedMessage}
          onClose={() => {
            setShowThread(false);
            setSelectedMessage(null);
          }}
        />
      )}
    </div>
  );
}