import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { MessageCircle } from "lucide-react";
import { useState } from "react";
import { UserProfileView } from "./UserProfileView";

type Friend = {
  id: number;
  username: string;
  displayName?: string; // Added displayName
  avatarUrl?: string;
  isOnline: boolean;
  hideActivity: boolean;
  age?: number;
  city?: string;
  lastActive?: Date;
  createdAt: Date;
};

export function FriendList() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedFriend, setSelectedFriend] = useState<Friend | null>(null);

  const { data: friends, isLoading } = useQuery<Friend[]>({
    queryKey: ['/api/friends'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const removeFriend = useMutation({
    mutationFn: async (friendId: number) => {
      const res = await fetch(`/api/friends/${friendId}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (data, friendId) => {
      // Immediately update the friends list cache
      queryClient.setQueryData<Friend[]>(['/api/friends'], (oldFriends = []) => {
        return oldFriends.filter(friend => friend.id !== friendId);
      });

      // Immediately update the direct messages cache
      queryClient.setQueryData<any[]>(['/api/direct-messages'], (oldDMs = []) => {
        return oldDMs.filter(dm => dm.otherUser.id !== friendId);
      });

      toast({
        title: "Friend removed",
        description: "The friend has been removed from your list.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const startDirectMessage = useMutation({
    mutationFn: async (friendId: number) => {
      const res = await fetch('/api/direct-messages/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ friendId }),
        credentials: 'include'
      });

      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/direct-messages'] });
      toast({
        title: "Direct message channel created",
        description: "You can now start chatting with your friend.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const getStatusColor = (isOnline: boolean, hideActivity: boolean) => {
    if (hideActivity || !isOnline) {
      return 'bg-gray-500';
    }
    return 'bg-green-500';
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading friends...</div>;
  }

  if (!friends?.length) {
    return <div className="text-sm text-muted-foreground">No friends yet</div>;
  }

  return (
    <Card className="p-4">
      <h3 className="font-semibold mb-4">Friends</h3>
      <div className="space-y-4">
        {friends.map((friend) => (
          <div key={friend.id} className="flex items-center justify-between">
            <div 
              className="flex items-center gap-2 cursor-pointer"
              onClick={() => setSelectedFriend(friend)}
            >
              <div className="relative">
                <Avatar>
                  {friend.avatarUrl ? (
                    <AvatarImage src={friend.avatarUrl} alt={friend.username} />
                  ) : (
                    <AvatarFallback>
                      {friend.username[0].toUpperCase()}
                    </AvatarFallback>
                  )}
                </Avatar>
                <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-background ${getStatusColor(friend.isOnline, friend.hideActivity)}`} />
              </div>
              <div>
                <p className="font-medium">{friend.displayName || friend.username}</p>
                <p className="text-xs text-muted-foreground">
                  {friend.hideActivity || !friend.isOnline ? 'offline' : 'online'}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => startDirectMessage.mutate(friend.id)}
                disabled={startDirectMessage.isPending}
              >
                <MessageCircle className="h-4 w-4" />
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => removeFriend.mutate(friend.id)}
                disabled={removeFriend.isPending}
              >
                Remove
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Friend Profile View Dialog */}
      {selectedFriend && (
        <UserProfileView
          user={selectedFriend}
          isOpen={true}
          onClose={() => setSelectedFriend(null)}
        />
      )}
    </Card>
  );
}