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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online':
        return 'bg-green-500';
      case 'away':
        return 'bg-yellow-500';
      case 'busy':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

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
            <div className={`absolute bottom-0 right-0 w-2 h-2 rounded-full border-2 border-background ${dm.otherUser.isOnline ? getStatusColor(dm.otherUser.status) : 'bg-gray-500'}`} />
          </div>
          <div className="flex flex-col items-start text-left">
            <span className="text-sm">{dm.otherUser.username}</span>
            <span className="text-xs text-muted-foreground">
              {dm.otherUser.isOnline ? dm.otherUser.status : 'offline'}
            </span>
          </div>
          <MessageCircle className="h-4 w-4 ml-auto text-muted-foreground" />
        </Button>
      ))}
    </div>
  );
}