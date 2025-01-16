import { useEffect, useRef, useState } from "react";
import { useMessages } from "@/hooks/use-messages";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Reply, Lightbulb, Loader2 } from "lucide-react";
import { ReactionPicker } from "./ReactionPicker";
import { ThreadView } from "./ThreadView";
import { SuggestionButton } from "./SuggestionButton";
import { MessageInput } from "./MessageInput";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/hooks/use-user";
import type { Message, MessageAttachment } from "@db/schema";

type MessageListProps = {
  channelId: number;
};

export function MessageList({ channelId }: MessageListProps) {
  const { messages, isLoading, addReaction } = useMessages(channelId);
  const { user } = useUser();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [showThread, setShowThread] = useState(false);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const [draftMessage, setDraftMessage] = useState<string>(""); // State for draft message
  const { toast } = useToast();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleUseSuggestion = (suggestion: string) => {
    setDraftMessage(suggestion); // Set the suggestion as the draft message
  };

  const handleSendMessage = async (content: string, files?: File[]) => {
    // Logic for sending a message
    try {
      // Implement your sendMessage API call here
      console.log("Sending message:", content, files);
      setDraftMessage(""); // Clear the draft after sending
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      });
    }
  };

  const MessageComponent = ({ message }: { message: Message }) => {
    const handleReaction = async (emoji: string) => {
      await addReaction({ messageId: message.id, emoji });
    };

    const handleReply = () => {
      setSelectedMessage(message);
      setShowThread(true);
    };

    const handleImageError = (fileUrl: string) => {
      setFailedImages((prev) => new Set([...prev, fileUrl]));
    };

    const isImageFile = (filename: string) => {
      const imageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"];
      return imageExtensions.some((ext) => filename.toLowerCase().endsWith(ext));
    };

    return (
      <div className="flex items-start gap-3">
        <Avatar className="h-8 w-8 flex-shrink-0">
          {message.user.avatarUrl ? (
            <AvatarImage src={message.user.avatarUrl} alt={message.user.username} />
          ) : (
            <AvatarFallback>{message.user.username[0].toUpperCase()}</AvatarFallback>
          )}
        </Avatar>
        <div className="flex-1">
          <div className="flex items-baseline gap-2">
            <span className="font-medium text-sm">{message.user.username}</span>
            <span className="text-xs text-muted-foreground">
              {new Date(message.createdAt).toLocaleTimeString()}
            </span>
          </div>
          <div className="text-sm mt-1">{message.content}</div>
          {message.attachments && (
            <div className="mt-2">
              {message.attachments.map((attachment: MessageAttachment) => (
                <div key={attachment.id}>
                  {isImageFile(attachment.filename) ? (
                    <img
                      src={attachment.fileUrl}
                      alt={attachment.filename}
                      onError={() => handleImageError(attachment.fileUrl)}
                      className="rounded-lg"
                    />
                  ) : (
                    <a href={attachment.fileUrl} download>
                      {attachment.filename}
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2 mt-2">
            <Button variant="ghost" size="sm" onClick={handleReply}>
              <Reply className="h-4 w-4 mr-1" />
              Reply
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1 p-4">
        {messages.map((message) => (
          <MessageComponent key={message.id} message={message} />
        ))}
        <div ref={bottomRef} />
      </ScrollArea>
      <div className="p-4 border-t">
        <SuggestionButton channelId={channelId} onSuggestion={handleUseSuggestion} />
        <MessageInput
          onSendMessage={handleSendMessage}
          channelId={channelId}
          message={draftMessage}
          onMessageChange={setDraftMessage}
        />
      </div>
    </div>
  );
}
