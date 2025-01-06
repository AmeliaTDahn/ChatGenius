import { useEffect, useRef } from "react";
import { useMessages } from "@/hooks/use-messages";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2 } from "lucide-react";
import type { Message } from "@db/schema";

type MessageListProps = {
  channelId: number;
};

export function MessageList({ channelId }: MessageListProps) {
  const { messages, isLoading } = useMessages(channelId);
  const bottomRef = useRef<HTMLDivElement>(null);

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

  const MessageComponent = ({ message }: { message: Message }) => (
    <div className="flex items-start gap-3">
      <Avatar className="h-8 w-8">
        {message.user.avatarUrl && (
          <AvatarImage src={message.user.avatarUrl} alt={message.user.username} />
        )}
        <AvatarFallback>
          {message.user.username[0].toUpperCase()}
        </AvatarFallback>
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
        {message.replies && message.replies.length > 0 && (
          <div className="ml-4 mt-2 space-y-2 border-l-2 pl-4">
            {message.replies.map((reply) => (
              <MessageComponent key={reply.id} message={reply as Message} />
            ))}
          </div>
        )}
      </div>
    </div>
  );

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