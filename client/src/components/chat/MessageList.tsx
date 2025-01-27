import { useState, useEffect, useRef } from "react";
import { useMessages } from "@/hooks/use-messages";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Loader2, FileIcon, Download, Reply, Lightbulb } from "lucide-react";
import { ReactionPicker } from "./ReactionPicker";
import { ThreadView } from "./ThreadView";
import { TextToSpeechButton } from "./TextToSpeechButton";
import { SummaryButton } from "./SummaryButton";
import type { Message, MessageAttachment } from "@db/schema";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/hooks/use-user";
import { SuggestionButton } from "./SuggestionButton";

// Helper function to check if a message is directed at a user
function isMessageDirectedAtUser(message: Message, currentUser: any) {
  if (!currentUser || !message) return false;

  // Check for @mentions
  const mentionPattern = new RegExp(`@${currentUser.username}\\b`, 'i');
  if (mentionPattern.test(message.content)) return true;

  // Check for direct address (starting with the username)
  if (message.content.toLowerCase().startsWith(currentUser.username.toLowerCase())) return true;

  // If it's a reply to user's message
  if (message.parentId && message.parentMessage?.userId === currentUser.id) return true;

  return false;
}

function parseFormattedText(text: string) {
  text = text.replace(/\[color=(#[0-9a-f]{6})\](.*?)\[\/color\]/gi, 
    (_, color, content) => `<span style="color: ${color}">${content}</span>`);

  text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

  text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');

  return text;
}

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
  const [isGeneratingSuggestion, setIsGeneratingSuggestion] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSuggestion = (suggestion: string) => {
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
    if (textarea) {
      const inputComponent = textarea.closest('form');
      if (inputComponent) {
        const event = new CustomEvent('suggestionPaste', { 
          detail: { text: suggestion },
          bubbles: true 
        });
        inputComponent.dispatchEvent(event);
      }
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
      setFailedImages(prev => new Set([...prev, fileUrl]));
    };

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
          </div>
          <div 
            className="text-sm mt-1 break-words"
            dangerouslySetInnerHTML={{ 
              __html: parseFormattedText(message.content)
            }}
          />

          {message.attachments && message.attachments.length > 0 && (
            <div className="mt-2 space-y-2">
              {message.attachments.map((attachment: MessageAttachment) => {
                const isImage = attachment.mimeType?.startsWith('image/');
                const showFallback = failedImages.has(attachment.fileUrl);

                return (
                  <div
                    key={attachment.id}
                    className="flex flex-col gap-2"
                  >
                    {isImage && !showFallback ? (
                      <div className="relative group max-w-2xl">
                        <img
                          src={attachment.fileUrl}
                          alt={attachment.filename}
                          className="rounded-lg object-contain max-h-[500px] bg-secondary/50"
                          onError={() => handleImageError(attachment.fileUrl)}
                          loading="lazy"
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
                );
              })}
            </div>
          )}

          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={handleReply}
            >
              <Reply className="h-3 w-3 mr-1" />
              Reply
            </Button>
            {message.replyCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-muted-foreground"
                onClick={handleReply}
              >
                {message.replyCount} {message.replyCount === 1 ? 'reply' : 'replies'}
              </Button>
            )}
            <div className="flex gap-1 flex-wrap">
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
            <TextToSpeechButton messageId={message.id} />
          </div>
        </div>
      </div>
    );
  };

  const lastMessage = messages[messages.length - 1];
  const showSuggestionButton = lastMessage && 
    lastMessage.userId !== user?.id && 
    channelId !== -1;

  return (
    <div className="flex h-full overflow-hidden relative">
      {showSuggestionButton && (
        <div className="absolute top-0 right-4 z-10 p-4 bg-background/80 backdrop-blur-sm rounded-b-lg shadow-lg">
          <SuggestionButton
            channelId={channelId}
            onSuggestion={handleSuggestion}
            disabled={isGeneratingSuggestion}
          />
        </div>
      )}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4 pt-14">
          {messages.map((message) => (
            <MessageComponent key={message.id} message={message} />
          ))}
          <div ref={bottomRef} />
          {messages.length > 0 && channelId !== -1 && (
            <div className="flex justify-end mt-4">
              <SummaryButton channelId={channelId} />
            </div>
          )}
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