import { useQuery } from "@tanstack/react-query";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { MessageCircle } from "lucide-react";
import type { Channel, User } from "@db/schema";

type DirectMessage = Channel & {
  otherUser: User;
};

export function DirectMessageList({ onSelectChannel }: { onSelectChannel: (channel: Channel) => void }) {
  const { data: directMessages, isLoading } = useQuery<DirectMessage[]>({
    queryKey: ['/api/direct-messages'],
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  if (isLoading) {
    return <div className="text-sm text-muted-foreground p-4">Loading direct messages...</div>;
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
          className="w-full justify-start space-x-2"
          onClick={() => onSelectChannel(dm)}
        >
          <Avatar className="h-6 w-6">
            {dm.otherUser.avatarUrl ? (
              <AvatarImage src={dm.otherUser.avatarUrl} alt={dm.otherUser.username} />
            ) : (
              <AvatarFallback>
                {dm.otherUser.username[0].toUpperCase()}
              </AvatarFallback>
            )}
          </Avatar>
          <span className="truncate">{dm.otherUser.username}</span>
          <MessageCircle className="h-4 w-4 ml-auto text-muted-foreground" />
        </Button>
      ))}
    </div>
  );
}