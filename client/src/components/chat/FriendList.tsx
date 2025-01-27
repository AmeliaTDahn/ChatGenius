import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { UserProfileView } from "./UserProfileView";
import { useLocation } from "wouter";

type Friend = {
  id: number;
  username: string;
  displayName?: string;
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
  const [, setLocation] = useLocation();

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
      // Invalidate the friends query to force a refetch
      queryClient.invalidateQueries({ queryKey: ['/api/friends'] });

      // Update the direct messages cache
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
            <Button
              variant="destructive"
              size="sm"
              onClick={() => removeFriend.mutate(friend.id)}
              disabled={removeFriend.isPending}
            >
              Remove
            </Button>
          </div>
        ))}
      </div>

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