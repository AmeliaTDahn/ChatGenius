import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Bot } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { UserProfileView } from "./UserProfileView";
import type { Channel, User } from "@db/schema";
import { ChatBot } from './ChatBot';

type DirectMessage = Channel & {
  otherUser: User;
};

export function DirectMessageList({ onSelectChannel }: { onSelectChannel: (channel: Channel) => void }) {
  const [showChatBot, setShowChatBot] = useState(false);
  const { data: directMessages, isLoading } = useQuery<DirectMessage[]>({
    queryKey: ['/api/direct-messages'],
    refetchInterval: 5000,
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleSelectChannel = async (dm: DirectMessage) => {
    try {
      await fetch(`/api/channels/${dm.id}/read`, {
        method: 'POST',
        credentials: 'include'
      });
      queryClient.invalidateQueries({ queryKey: ['/api/direct-messages'] });
      queryClient.invalidateQueries({ queryKey: ['/api/channels'] });
      onSelectChannel(dm);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to mark messages as read",
        variant: "destructive"
      });
    }
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading direct messages...</div>;
  }

  if (!directMessages?.length) {
    return (
      <div className="p-4">
        <p className="text-sm text-muted-foreground">No direct messages yet</p>
        <p className="text-xs text-muted-foreground mt-1">Add friends to start chatting!</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 p-2">
      <Button
        variant="ghost"
        className="w-full justify-start"
        onClick={() => onSelectChannel({ id: -1, name: "Chat Assistant" } as Channel)}
      >
        <div className="flex items-center gap-2">
          <Avatar className="h-6 w-6">
            <AvatarFallback>AI</AvatarFallback>
          </Avatar>
          <span className="text-sm">Chat Assistant</span>
        </div>
      </Button>
      {directMessages.map((dm) => (
        <Button
          key={dm.id}
          variant="ghost"
          className="w-full justify-start relative"
          onClick={() => handleSelectChannel(dm)}
        >
          <div className="flex items-center gap-2 flex-1">
            <HoverCard>
              <HoverCardTrigger asChild>
                <div className="relative">
                  <Avatar className="h-6 w-6">
                    {dm.otherUser.avatarUrl ? (
                      <AvatarImage src={dm.otherUser.avatarUrl} alt={dm.otherUser.username} />
                    ) : (
                      <AvatarFallback>
                        {dm.otherUser.username[0].toUpperCase()}
                      </AvatarFallback>
                    )}
                  </Avatar>
                </div>
              </HoverCardTrigger>
              <HoverCardContent className="w-80" align="start">
                <UserProfileView user={dm.otherUser} asChild />
              </HoverCardContent>
            </HoverCard>
            <span className="text-sm truncate">{dm.otherUser.username}</span>
          </div>
        </Button>
      ))}
    </div>
  );
}