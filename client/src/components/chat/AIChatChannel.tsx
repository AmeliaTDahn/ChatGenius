
import { useState } from "react";
import { MessageInput } from "./MessageInput";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

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

      // Call your AI chatbot API
      const response = await fetch("YOUR_OTHER_REPL_URL/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ message: content })
      });

      const data = await response.json();

      // Add bot response
      setMessages(prev => [...prev, {
        content: data.response,
        isBot: true,
        timestamp: new Date()
      }]);
    } catch (error) {
      console.error("Error sending message to AI:", error);
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
                  <AvatarFallback>AI</AvatarFallback>
                ) : (
                  <AvatarFallback>ME</AvatarFallback>
                )}
              </Avatar>
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="font-medium text-sm">
                    {message.isBot ? "AI Assistant" : "You"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {message.timestamp.toLocaleTimeString()}
                  </span>
                </div>
                <p className="text-sm mt-1">{message.content}</p>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
      <div className="p-4 border-t mt-auto">
        <MessageInput onSendMessage={handleSendMessage} />
      </div>
    </div>
  );
}
