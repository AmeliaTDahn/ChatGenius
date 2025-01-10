import { useState } from "react";
import { Search } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Users } from "lucide-react";

type User = {
  id: number;
  username: string;
  avatarUrl?: string;
  isFriend?: boolean;
  mutualFriendCount?: number;
  mutualFriends?: {
    id: number;
    username: string;
    avatarUrl?: string;
  }[];
};

export function UserSearch() {
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: recommendations, isLoading: isLoadingRecommendations } = useQuery<User[]>({
    queryKey: ['/api/friend-recommendations'],
    queryFn: async () => {
      const res = await fetch('/api/friend-recommendations', {
        credentials: 'include'
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  });

  const { data: searchResults, isLoading: isLoadingSearch } = useQuery<User[]>({
    queryKey: ['/api/users/search', searchQuery],
    queryFn: async () => {
      if (!searchQuery.trim()) return [];
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(searchQuery)}`, {
        credentials: 'include'
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: searchQuery.length >= 2
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
      queryClient.invalidateQueries({ queryKey: ['/api/users/search'] });
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

  const UserCard = ({ user }: { user: User }) => (
    <div key={user.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted">
      <div className="flex items-center gap-2">
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
          <span className="font-medium">{user.username}</span>
          {user.mutualFriendCount !== undefined && user.mutualFriendCount > 0 && (
            <p className="text-xs text-muted-foreground">
              {user.mutualFriendCount} mutual {user.mutualFriendCount === 1 ? 'friend' : 'friends'}
            </p>
          )}
          {user.mutualFriends && user.mutualFriends.length > 0 && (
            <div className="flex -space-x-2 mt-1">
              {user.mutualFriends.slice(0, 3).map((friend) => (
                <Avatar key={friend.id} className="h-5 w-5 border-2 border-background">
                  {friend.avatarUrl ? (
                    <AvatarImage src={friend.avatarUrl} alt={friend.username} />
                  ) : (
                    <AvatarFallback className="text-xs">
                      {friend.username[0].toUpperCase()}
                    </AvatarFallback>
                  )}
                </Avatar>
              ))}
            </div>
          )}
        </div>
      </div>
      {user.isFriend ? (
        <Button
          variant="secondary"
          size="sm"
          disabled={true}
        >
          Added
        </Button>
      ) : (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => sendFriendRequest.mutate(user.id)}
          disabled={sendFriendRequest.isPending}
        >
          Add Friend
        </Button>
      )}
    </div>
  );

  return (
    <Card className="p-4">
      <div className="space-y-4">
        <div className="relative">
          <Input
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
          />
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
        </div>

        {isLoadingSearch || isLoadingRecommendations ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : searchQuery.length >= 2 ? (
          <div className="space-y-2">
            {searchResults && searchResults.length > 0 ? (
              searchResults.map((user) => (
                <UserCard key={user.id} user={user} />
              ))
            ) : (
              <div className="text-sm text-muted-foreground">No users found</div>
            )}
          </div>
        ) : recommendations && recommendations.length > 0 ? (
          <div className="space-y-2">
            <h3 className="text-sm font-medium flex items-center gap-2 text-muted-foreground mb-2">
              <Users className="h-4 w-4" />
              Suggested Friends
            </h3>
            {recommendations.map((user) => (
              <UserCard key={user.id} user={user} />
            ))}
          </div>
        ) : !searchQuery ? (
          <div className="text-sm text-muted-foreground text-center py-8">
            No recommendations available. Add some friends to see suggestions!
          </div>
        ) : null}
      </div>
    </Card>
  );
}