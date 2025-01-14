
import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageSquare, Bot } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Message {
  content: string;
  isBot: boolean;
}

export function ChatBot() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage = { content: input, isBot: false };
    setMessages(prev => [...prev, userMessage]);
    setInput('');

    // Here you can integrate with your AI backend
    const botResponse = { content: 'This is a sample response. Integrate with your AI backend.', isBot: true };
    setMessages(prev => [...prev, botResponse]);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 p-2 border-b">
        <Bot className="h-4 w-4" />
        <span className="font-medium">Chat Assistant</span>
      </div>
      
      <ScrollArea className="flex-1 p-2">
        <div className="space-y-4">
          {messages.map((message, i) => (
            <div
              key={i}
              className={`flex gap-2 ${message.isBot ? 'items-start' : 'items-start flex-row-reverse'}`}
            >
              <Avatar className="h-6 w-6">
                <AvatarFallback>
                  {message.isBot ? 'B' : 'U'}
                </AvatarFallback>
              </Avatar>
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

      <form onSubmit={handleSubmit} className="p-2 border-t flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask anything..."
          className="flex-1"
        />
        <Button type="submit" size="icon">
          <MessageSquare className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
