import { useState, useEffect, useRef } from "react";
import { MessageInput } from "./MessageInput";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { marked } from 'marked';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface Message {
  id: number;
  content: string;
  userId: number;
  isAIMessage: boolean;
  createdAt: string;
  user: {
    username: string;
    avatarUrl: string | null;
  };
}

const AI_CHANNEL_ID = -1;
const WELCOME_MESSAGE = "👋 Hello! I'm Sarah. I'll adapt my responses to match your communication style based on your chat history. How can I help you today?";

export function AIChatChannel() {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Fetch message history
  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: [`/api/channels/${AI_CHANNEL_ID}/messages`],
    initialData: [{
      id: 0,
      content: WELCOME_MESSAGE,
      userId: -1,
      isAIMessage: true,
      createdAt: new Date().toISOString(),
      user: {
        username: 'Sarah',
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

  const sendMessage = useMutation({
    mutationFn: async (content: string) => {
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

      return response.json();
    },
    onMutate: () => {
      setIsLoading(true);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/channels/${AI_CHANNEL_ID}/messages`] });
    },
    onError: (error) => {
      console.error("Error sending message to AI:", error);
      toast({
        title: "Error",
        description: "Failed to get response from AI. Please try again.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsLoading(false);
    }
  });

  const handleSendMessage = async (content: string) => {
    await sendMessage.mutateAsync(content);
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
            <div key={message.id} className={`flex items-start gap-3 ${!message.isAIMessage ? 'flex-row-reverse justify-start' : ''}`}>
              <Avatar className="h-8 w-8">
                <AvatarFallback className={message.isAIMessage ? "bg-primary text-primary-foreground" : "bg-muted"}>
                  {message.isAIMessage ? "AI" : "ME"}
                </AvatarFallback>
              </Avatar>
              <div className={`flex-1 ${!message.isAIMessage ? 'ml-12' : 'mr-12'}`}>
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <div dangerouslySetInnerHTML={renderMessage(message.content)} />
                </div>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Sarah is thinking...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>
      <div className="p-4 border-t mt-auto max-w-2xl mx-auto w-full">
        <MessageInput 
          onSendMessage={handleSendMessage}
          isLoading={isLoading}
          placeholder="Ask me anything..."
        />
      </div>
    </div>
  );
}