
import { useState, useEffect, useRef } from "react";
import { MessageInput } from "./MessageInput";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { marked } from 'marked';

interface AIChatMessage {
  content: string;
  isBot: boolean;
  timestamp: Date;
}

const WELCOME_MESSAGE = "👋 Hello! I'm your AI Assistant. I'm here to help with any questions or tasks you have. Feel free to ask me anything, and I'll do my best to assist you!";

export function AIChatChannel() {
  const [messages, setMessages] = useState<AIChatMessage[]>([{
    content: WELCOME_MESSAGE,
    isBot: true,
    timestamp: new Date()
  }]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
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
      
      setMessages(prev => [...prev, {
        content,
        isBot: false,
        timestamp: new Date()
      }]);

      const response = await fetch('/api/chat/ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: content }),
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`Error: ${response.statusText}`);
      }

      const data = await response.json();
      
      setMessages(prev => [...prev, {
        content: data.response,
        isBot: true,
        timestamp: new Date()
      }]);
    } catch (error) {
      console.error("Error sending message to AI:", error);
      toast({
        title: "Error",
        description: "Failed to get response from AI. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const renderMessage = (content: string) => {
    try {
      return { __html: marked.parse(content) };
    } catch (error) {
      console.error('Error parsing markdown:', error);
      return { __html: content };
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <ScrollArea className="flex-1 px-4 py-6">
        <div className="space-y-6 max-w-2xl mx-auto">
          {messages.map((message, index) => (
            <div key={index} className={`flex items-start gap-3 ${message.isBot ? '' : 'flex-row-reverse'}`}>
              <Avatar className="h-8 w-8">
                <AvatarFallback className={message.isBot ? "bg-primary text-primary-foreground" : "bg-muted"}>
                  {message.isBot ? "AI" : "ME"}
                </AvatarFallback>
              </Avatar>
              <div className={`flex-1 ${message.isBot ? 'mr-12' : 'ml-12'}`}>
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <div dangerouslySetInnerHTML={renderMessage(message.content)} />
                </div>
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
      <div className="p-4 border-t mt-auto max-w-2xl mx-auto w-full">
        <MessageInput 
          onSendMessage={handleSendMessage}
          disabled={isLoading}
          placeholder="Ask me anything..."
        />
      </div>
    </div>
  );
}
