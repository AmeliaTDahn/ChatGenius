import { useEffect, useRef } from "react";
import { useMessages } from "@/hooks/use-messages";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Loader2, FileIcon, Download } from "lucide-react";
import { ReactionPicker } from "./ReactionPicker";
import type { Message, MessageAttachment } from "@db/schema";

type MessageListProps = {
  channelId: number;
};

export function MessageList({ channelId }: MessageListProps) {
  const { messages, isLoading, addReaction } = useMessages(channelId);
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

  const MessageComponent = ({ message, onReply }: { message: Message, onReply?: (message: Message) => void }) => {
    const handleReaction = async (emoji: string) => {
      await addReaction({ messageId: message.id, emoji });
    };

    // Group reactions by emoji
    const reactionGroups = message.reactions?.reduce<Record<string, number>>((acc, reaction) => {
      acc[reaction.emoji] = (acc[reaction.emoji] || 0) + 1;
      return acc;
    }, {}) ?? {};

    const formatFileSize = (bytes: number) => {
      if (bytes < 1024) return bytes + ' B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

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

          {message.attachments && message.attachments.length > 0 && (
            <div className="mt-2 space-y-2">
              {message.attachments.map((attachment: MessageAttachment) => (
                <div
                  key={attachment.id}
                  className="flex items-center gap-2 p-2 rounded-md bg-secondary/50"
                >
                  <FileIcon className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {attachment.filename}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(attachment.fileSize)}
                    </p>
                  </div>
                  <a
                    href={attachment.fileUrl}
                    download={attachment.filename}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <Download className="h-4 w-4" />
                    </Button>
                  </a>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 mt-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => onReply?.(message)}
            >
              Reply
            </Button>
            {message.replyCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-muted-foreground"
                onClick={() => onReply?.(message)}
              >
                {message.replyCount} {message.replyCount === 1 ? 'reply' : 'replies'}
              </Button>
            )}
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