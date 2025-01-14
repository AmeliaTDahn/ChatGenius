import { useState } from "react";
import { MessageInput } from "./MessageInput";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2 } from "lucide-react";

interface AIChatMessage {
  content: string;
  isBot: boolean;
  timestamp: Date;
}

export function AIChatChannel() {
  const [messages, setMessages] = useState<AIChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSendMessage = async (content: string) => {
    try {
      setIsLoading(true);

      // Add user message
      setMessages(prev => [...prev, {
        content,
        isBot: false,
        timestamp: new Date()
      }]);

      // Call the external chatbot API
      const response = await fetch("https://ai-chatbot-ameliadahn.replit.app/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ message: content })
      });

      if (!response.ok) {
        throw new Error("Failed to get response from chatbot");
      }

      const data = await response.json();

      // Add bot response
      setMessages(prev => [...prev, {
        content: data.response || "Sorry, I couldn't process that request.",
        isBot: true,
        timestamp: new Date()
      }]);
    } catch (error) {
      console.error("Error sending message to AI:", error);
      // Add error message
      setMessages(prev => [...prev, {
        content: "Sorry, I encountered an error. Please try again.",
        isBot: true,
        timestamp: new Date()
      }]);
    } finally {
      setIsLoading(false);
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
                <div className="text-sm mt-1 prose-sm max-w-none">
                  {message.content}
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