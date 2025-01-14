
import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageSquare } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Message {
  content: string;
  isBot: boolean;
}

export function ChatBot() {
  const [messages, setMessages] = useState<Message[]>([
    { content: "Hello! I'm your AI assistant. How can I help you today?", isBot: true }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = { content: input, isBot: false };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Mock response for now
      const botResponse = { content: "I'm a demo chatbot. In the future, I'll be connected to a real AI service.", isBot: true };
      setTimeout(() => {
        setMessages(prev => [...prev, botResponse]);
        setIsLoading(false);
      }, 1000);
    } catch (error) {
      console.error('Error:', error);
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {messages.map((message, i) => (
            <div
              key={i}
              className={`flex gap-2 ${message.isBot ? 'items-start' : 'items-start flex-row-reverse'}`}
            >
              {message.isBot && (
                <Avatar className="h-8 w-8">
                  <AvatarFallback>AI</AvatarFallback>
                </Avatar>
              )}
              <div
                className={`rounded-lg px-3 py-2 max-w-[80%] ${
                  message.isBot ? 'bg-secondary' : 'bg-primary text-primary-foreground'
                }`}
              >
                <p className="text-sm">{message.content}</p>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      <form onSubmit={handleSubmit} className="p-4 border-t flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message..."
          className="flex-1"
          disabled={isLoading}
        />
        <Button type="submit" size="icon" disabled={isLoading}>
          <MessageSquare className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
