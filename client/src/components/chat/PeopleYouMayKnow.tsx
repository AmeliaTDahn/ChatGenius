import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { UserPlus } from "lucide-react";

type RecommendedFriend = {
  id: number;
  username: string;
  avatarUrl?: string;
  mutualFriendCount: number;
};

export function PeopleYouMayKnow() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: recommendations, isLoading } = useQuery<RecommendedFriend[]>({
    queryKey: ['/api/friends/recommendations'],
    refetchInterval: 60000, // Refresh every minute
  });

  const sendFriendRequest = useMutation({
    mutationFn: async (userId: number) => {
      const res = await fetch('/api/friend-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiverId: userId }),
        credentials: 'include'
      });

      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Friend request sent",
        description: "They will be notified of your request.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/friends/recommendations'] });
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
    return null;
  }

  if (!recommendations?.length) {
    return null;
  }

  return (
    <Card className="p-4 mb-4">
      <h3 className="font-semibold mb-4">People You May Know</h3>
      <div className="space-y-4">
        {recommendations.map((friend) => (
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
                <p className="text-xs text-muted-foreground">
                  {friend.mutualFriendCount} mutual {friend.mutualFriendCount === 1 ? 'friend' : 'friends'}
                </p>
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => sendFriendRequest.mutate(friend.id)}
              disabled={sendFriendRequest.isPending}
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Add Friend
            </Button>
          </div>
        ))}
      </div>
    </Card>
  );
}
