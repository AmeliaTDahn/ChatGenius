import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { MessageInput } from "./MessageInput";
import { useMessages } from "@/hooks/use-messages";
import type { Message } from "@db/schema";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type ThreadViewProps = {
  message: Message;
  onClose: () => void;
};

export function ThreadView({ message, onClose }: ThreadViewProps) {
  const { messages, sendMessage, isLoading } = useMessages(message.channelId, message.id);
  const [replying, setReplying] = useState(true);

  const handleSendReply = async (content: string, files?: File[]) => {
    try {
      await sendMessage({ content, files, parentId: message.id });
      setReplying(false);
    } catch (error) {
      console.error("Failed to send reply:", error);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b">
        <h3 className="font-semibold">Thread</h3>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1 p-4">
        {/* Original message */}
        <div className="pb-4 border-b mb-4">
          <div className="flex items-start gap-3">
            <Avatar className="h-8 w-8">
              {message.user.avatarUrl ? (
                <AvatarImage src={message.user.avatarUrl} alt={message.user.username} />
              ) : (
                <AvatarFallback>
                  {message.user.username[0].toUpperCase()}
                </AvatarFallback>
              )}
            </Avatar>
            <div>
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
        </div>

        {/* Replies */}
        <div className="space-y-4">
          {messages.map((reply) => (
            <div key={reply.id} className="flex items-start gap-3">
              <Avatar className="h-8 w-8">
                {reply.user.avatarUrl ? (
                  <AvatarImage src={reply.user.avatarUrl} alt={reply.user.username} />
                ) : (
                  <AvatarFallback>
                    {reply.user.username[0].toUpperCase()}
                  </AvatarFallback>
                )}
              </Avatar>
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="font-medium text-sm">
                    {reply.user.username}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(reply.createdAt).toLocaleTimeString()}
                  </span>
                </div>
                <p className="text-sm mt-1">{reply.content}</p>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="p-4 border-t mt-auto">
        <MessageInput onSendMessage={handleSendReply} />
      </div>
    </div>
  );
}