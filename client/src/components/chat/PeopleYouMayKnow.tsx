import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { UserPlus2, Users } from "lucide-react";
import { motion } from "framer-motion";

type RecommendedUser = {
  id: number;
  username: string;
  avatarUrl?: string;
  mutualFriendCount: number;
  mutualFriends?: {
    id: number;
    username: string;
    avatarUrl?: string;
  }[];
};

export function PeopleYouMayKnow() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: recommendations, isLoading } = useQuery<RecommendedUser[]>({
    queryKey: ['/api/friend-recommendations'],
    refetchInterval: 60000, // Refresh every minute
  });

  const sendFriendRequest = useMutation({
    mutationFn: async (receiverId: number) => {
      const res = await fetch('/api/friend-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiverId }),
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
      queryClient.invalidateQueries({ queryKey: ['/api/friend-recommendations'] });
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
    return (
      <Card className="p-4">
        <h3 className="font-semibold mb-4">People You May Know</h3>
        <div className="space-y-4 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-muted" />
                <div className="space-y-2">
                  <div className="h-4 w-24 bg-muted rounded" />
                  <div className="h-3 w-32 bg-muted rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    );
  }

  if (!recommendations?.length) {
    return (
      <Card className="p-4">
        <h3 className="font-semibold mb-4">People You May Know</h3>
        <div className="text-sm text-muted-foreground text-center py-8">
          No recommendations available right now
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <h3 className="font-semibold mb-4 flex items-center gap-2">
        <Users className="w-4 h-4" />
        People You May Know
      </h3>
      <div className="space-y-4">
        {recommendations.map((user, index) => (
          <motion.div
            key={user.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="flex items-center justify-between p-2 rounded-lg hover:bg-muted"
          >
            <div className="flex items-center gap-3">
              <Avatar>
                {user.avatarUrl ? (
                  <AvatarImage src={user.avatarUrl} alt={user.username} />
                ) : (
                  <AvatarFallback>
                    {user.username[0].toUpperCase()}
                  </AvatarFallback>
                )}
              </Avatar>
              <div>
                <p className="font-medium">{user.username}</p>
                <p className="text-xs text-muted-foreground">
                  {user.mutualFriendCount} mutual {user.mutualFriendCount === 1 ? 'friend' : 'friends'}
                </p>
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => sendFriendRequest.mutate(user.id)}
              disabled={sendFriendRequest.isPending}
              className="gap-2"
            >
              <UserPlus2 className="w-4 h-4" />
              Add Friend
            </Button>
          </motion.div>
        ))}
      </div>
    </Card>
  );
}
