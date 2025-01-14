import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { UserProfileView } from "./UserProfileView";
import type { Channel, User } from "@db/schema";

type DirectMessage = Channel & {
  otherUser: User;
};

export function DirectMessageList({ onSelectChannel }: { onSelectChannel: (channel: Channel) => void }) {
  const { data: directMessages, isLoading } = useQuery<DirectMessage[]>({
    queryKey: ['/api/direct-messages'],
    refetchInterval: 5000, // Refresh every 5 seconds
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const getStatusColor = (isOnline: boolean, hideActivity: boolean) => {
    if (hideActivity || !isOnline) {
      return 'bg-gray-500';
    }
    return 'bg-green-500';
  };

  const handleSelectChannel = async (dm: DirectMessage) => {
    try {
      // Mark messages as read when selecting the channel
      await fetch(`/api/channels/${dm.id}/read`, {
        method: 'POST',
        credentials: 'include'
      });

      // Invalidate both queries to refresh the status
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