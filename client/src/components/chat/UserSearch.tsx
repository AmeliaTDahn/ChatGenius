import { useState } from "react";
import { Search } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

type User = {
  id: number;
  username: string;
  avatarUrl?: string;
};

export function UserSearch() {
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: searchResults, isLoading } = useQuery<User[]>({
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
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  });

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

        {isLoading ? (
          <div className="text-sm text-muted-foreground">Searching...</div>
        ) : searchResults && searchResults.length > 0 ? (
          <div className="space-y-2">
            {searchResults.map((user) => (
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
                  <span className="font-medium">{user.username}</span>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => sendFriendRequest.mutate(user.id)}
                  disabled={sendFriendRequest.isPending}
                >
                  Add Friend
                </Button>
              </div>
            ))}
          </div>
        ) : searchQuery.length >= 2 ? (
          <div className="text-sm text-muted-foreground">No users found</div>
        ) : null}
      </div>
    </Card>
  );
}
