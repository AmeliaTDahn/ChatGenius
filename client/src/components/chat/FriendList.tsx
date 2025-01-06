import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { MessageCircle } from "lucide-react";

type Friend = {
  id: number;
  username: string;
  avatarUrl?: string;
};

export function FriendList() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

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
    onSuccess: () => {
      toast({
        title: "Friend removed",
        description: "The friend has been removed from your list.",
      });
      // Invalidate friends and direct messages queries
      queryClient.invalidateQueries({ queryKey: ['/api/friends'] });
      queryClient.invalidateQueries({ queryKey: ['/api/direct-messages'] });
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
            <div className="flex items-center gap-2">
              <Avatar>
                {friend.avatarUrl ? (
                  <AvatarImage src={friend.avatarUrl} alt={friend.username} />
                ) : (
                  <AvatarFallback>
                    {friend.username[0].toUpperCase()}
                  </AvatarFallback>
                )}
              </Avatar>
              <div>
                <p className="font-medium">{friend.username}</p>
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
    </Card>
  );
}