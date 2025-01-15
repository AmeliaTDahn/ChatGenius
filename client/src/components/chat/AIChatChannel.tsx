import { useState, useEffect, useRef } from "react";
import { MessageInput } from "./MessageInput";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useWebSocket } from "@/hooks/use-websocket";
import { marked } from 'marked';

interface AIChatMessage {
  content: string;
  isBot: boolean;
  timestamp: Date;
}

export function AIChatChannel() {
  const [messages, setMessages] = useState<AIChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { sendMessage, lastMessage } = useWebSocket();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (content: string) => {
    try {
      setIsLoading(true);

      // Add user message to the local state
      setMessages(prev => [...prev, {
        content,
        isBot: false,
        timestamp: new Date()
      }]);

      // Send message through WebSocket
      sendMessage({
        type: 'message',
        channelId: -1, // Special AI channel ID
        content,
      });

    } catch (error) {
      console.error("Error sending message to AI:", error);
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      });
      setIsLoading(false);
    }
  };

  // Handle incoming WebSocket messages
  useEffect(() => {
    if (!lastMessage) return;

    if (lastMessage.type === 'message' && lastMessage.channelId === -1 && lastMessage.message) {
      setMessages(prev => [...prev, {
        content: lastMessage.message.content,
        isBot: true,
        timestamp: new Date(lastMessage.message.createdAt)
      }]);
      setIsLoading(false);
    } else if (lastMessage.type === 'error') {
      toast({
        title: "Error",
        description: lastMessage.message || "Something went wrong",
        variant: "destructive",
      });
      setIsLoading(false);
    }
  }, [lastMessage, toast]);

  const renderMessage = (content: string) => {
    try {
      return { __html: marked.parse(content) };
    } catch (error) {
      console.error('Error parsing markdown:', error);
      return { __html: content };
    }
  };

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {messages.map((message, index) => (
            <div key={index} className="flex items-start gap-3">
              <Avatar className="h-8 w-8">
                {message.isBot ? (
                  <AvatarFallback className="bg-primary/10 text-primary">AI</AvatarFallback>
                ) : (
                  <AvatarFallback>ME</AvatarFallback>
                )}
              </Avatar>
              <div className="flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="font-medium text-sm">
                    {message.isBot ? "AI Assistant" : "You"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {message.timestamp.toLocaleTimeString()}
                  </span>
                </div>
                <div 
                  className="text-sm mt-1 prose-sm max-w-none"
                  dangerouslySetInnerHTML={renderMessage(message.content)}
                />
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>AI is thinking...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>
      <div className="p-4 border-t mt-auto">
        <MessageInput 
          onSendMessage={handleSendMessage}
          disabled={isLoading}
          placeholder="Ask me anything..."
        />
      </div>
    </div>
  );
}