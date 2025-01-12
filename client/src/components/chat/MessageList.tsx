import { useEffect, useRef, useState } from "react";
import { useMessages } from "@/hooks/use-messages";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ThreadView } from "./ThreadView";
import { FileIcon, Download, Reply, MessageSquare } from "lucide-react";
import type { Message, MessageAttachment } from "@db/schema";
import { cn } from "@/lib/utils";

type MessageListProps = {
  channelId: number;
};

export function MessageList({ channelId }: MessageListProps) {
  const { messages, isLoading } = useMessages(channelId);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [showThread, setShowThread] = useState(false);

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
    const handleReply = () => {
      setSelectedMessage(message);
      setShowThread(true);
    };

    const formatFileSize = (bytes: number) => {
      if (bytes < 1024) return bytes + ' B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const isImageFile = (filename: string) => {
      const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif'];
      return imageExtensions.some(ext => filename.toLowerCase().endsWith(ext));
    };

    return (
      <div id={`message-${message.id}`} className="flex items-start gap-3 transition-colors duration-200">
        <Avatar className="h-8 w-8 flex-shrink-0">
          {message.user.avatarUrl ? (
            <AvatarImage src={message.user.avatarUrl} alt={message.user.username} />
          ) : (
            <AvatarFallback>
              {message.user.username[0].toUpperCase()}
            </AvatarFallback>
          )}
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="font-medium text-sm">
              {message.user.username}
            </span>
            <span className="text-xs text-muted-foreground">
              {new Date(message.createdAt).toLocaleTimeString()}
            </span>
            {message.replyCount > 0 && (
              <div className="flex items-center gap-1 text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                <MessageSquare className="h-3 w-3" />
                <span>{message.replyCount} replies</span>
              </div>
            )}
          </div>
          <div 
            className="text-sm mt-1 break-words"
            dangerouslySetInnerHTML={{ 
              __html: parseFormattedText(message.content)
            }}
          />

          {message.attachments && message.attachments.length > 0 && (
            <div className="mt-2 space-y-2">
              {message.attachments.map((attachment: MessageAttachment) => (
                <div
                  key={attachment.id}
                  className="flex flex-col gap-2"
                >
                  {isImageFile(attachment.filename) ? (
                    <div className="relative group">
                      <img
                        src={attachment.fileUrl}
                        alt={attachment.filename}
                        className="max-w-[300px] max-h-[300px] rounded-md object-cover"
                      />
                      <a
                        href={attachment.fileUrl}
                        download={attachment.filename}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Button variant="secondary" size="icon" className="h-8 w-8">
                          <Download className="h-4 w-4" />
                        </Button>
                      </a>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 p-2 rounded-md bg-secondary/50">
                      <FileIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
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
                        <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0">
                          <Download className="h-4 w-4" />
                        </Button>
                      </a>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 mt-2">
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-6 px-2 text-xs relative flex items-center gap-1",
                message.replyCount > 0 && "bg-primary/10 hover:bg-primary/20 text-primary"
              )}
              onClick={handleReply}
            >
              <Reply className={cn("h-3 w-3", message.replyCount > 0 && "text-primary")} />
              <span>Reply</span>
              {message.replyCount > 0 && (
                <span className="inline-flex items-center justify-center bg-primary text-primary-foreground rounded-full text-[10px] min-w-[16px] h-4 px-1">
                  {message.replyCount}
                </span>
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full overflow-hidden">
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {/* Only show messages that are not replies (no parentId) */}
          {messages.filter(message => !message.parentId).map((message) => (
            <MessageComponent key={message.id} message={message} />
          ))}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>
      {showThread && selectedMessage && (
        <div className="w-80 border-l">
          <ThreadView 
            message={selectedMessage} 
            onClose={() => {
              setShowThread(false);
              setSelectedMessage(null);
            }} 
          />
        </div>
      )}
    </div>
  );
}

function parseFormattedText(text: string) {
  // Replace color tags with spans
  text = text.replace(/\[color=(#[0-9a-f]{6})\](.*?)\[\/color\]/gi, 
    (_, color, content) => `<span style="color: ${color}">${content}</span>`);

  // Replace bold tags
  text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

  // Replace italic tags
  text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');

  return text;
}