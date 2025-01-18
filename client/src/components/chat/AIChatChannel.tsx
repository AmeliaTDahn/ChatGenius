import { useState, useEffect, useRef } from "react";
import { MessageInput } from "./MessageInput";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { marked } from 'marked';
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Message } from "@db/schema";

interface AIMessage extends Message {
  user: {
    id: number;
    username: string;
    avatarUrl: string | null;
  };
}

const WELCOME_MESSAGE = "👋 Hello! I'm your AI Assistant. I'm here to help with any questions or tasks you have. Feel free to ask me anything, and I'll do my best to assist you!";

export function AIChatChannel() {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data: messages = [] } = useQuery<AIMessage[]>({
    queryKey: ['/api/channels/-1/messages'],
    initialData: [{
      id: 0,
      content: WELCOME_MESSAGE,
      channelId: -1,
      userId: -1,
      createdAt: new Date(),
      isAIMessage: true,
      user: {
        id: -1,
        username: 'AI Assistant',
        avatarUrl: null
      }
    }]
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (content: string) => {
    try {
      setIsLoading(true);

      // Send message via WebSocket
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

      ws.onopen = () => {
        ws.send(JSON.stringify({
          type: 'message',
          channelId: -1,
          content
        }));
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'message' || data.type === 'ai_status') {
          queryClient.invalidateQueries({ queryKey: ['/api/channels/-1/messages'] });
        }
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        toast({
          title: "Error",
          description: "Failed to send message. Please try again.",
          variant: "destructive",
        });
      };

    } catch (error) {
      console.error("Error sending message:", error);
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
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
          {messages.map((message) => (
            <div key={message.id} className={`flex items-start gap-3 ${message.userId !== -1 ? 'flex-row-reverse justify-start' : ''}`}>
              <Avatar className="h-8 w-8">
                <AvatarFallback className={message.userId === -1 ? "bg-primary text-primary-foreground" : "bg-muted"}>
                  {message.userId === -1 ? "AI" : "ME"}
                </AvatarFallback>
              </Avatar>
              <div className={`flex-1 ${message.userId !== -1 ? 'ml-12' : 'mr-12'}`}>
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