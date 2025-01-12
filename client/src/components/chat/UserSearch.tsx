import { useState } from "react";
import { Search } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, UserPlus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";

type User = {
  id: number;
  username: string;
  avatarUrl?: string;
  isFriend?: boolean;
};

type RecommendedFriend = {
  id: number;
  username: string;
  avatarUrl?: string;
  mutualFriendCount: number;
};

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const item = {
  hidden: { y: 20, opacity: 0 },
  show: {
    y: 0,
    opacity: 1,
    transition: {
      type: "spring",
      stiffness: 300,
      damping: 24
    }
  }
};

export function UserSearch() {
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

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

  const { data: recommendations, isLoading: isLoadingRecommendations } = useQuery<RecommendedFriend[]>({
    queryKey: ['/api/friends/recommendations'],
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
      queryClient.invalidateQueries({ queryKey: ['/api/users/search'] });
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

        {recommendations && recommendations.length > 0 && !searchQuery && (
          <div className="mb-4">
            <h3 className="font-semibold mb-2 text-sm">Suggested Friends</h3>
            <AnimatePresence>
              <motion.div 
                className="space-y-2"
                variants={container}
                initial="hidden"
                animate="show"
              >
                {recommendations.map((friend) => (
                  <motion.div 
                    key={friend.id} 
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-muted"
                    variants={item}
                    layout
                  >
                    <HoverCard>
                      <HoverCardTrigger>
                        <div className="flex items-center gap-2 cursor-pointer">
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
                            <motion.p 
                              className="text-xs text-muted-foreground"
                              initial={{ opacity: 0, y: -5 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: 0.2 }}
                            >
                              {friend.mutualFriendCount} mutual {friend.mutualFriendCount === 1 ? 'friend' : 'friends'}
                            </motion.p>
                          </div>
                        </div>
                      </HoverCardTrigger>
                      <HoverCardContent 
                        className="w-80"
                        align="start"
                      >
                        <div className="flex flex-col gap-3">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-12 w-12">
                              {friend.avatarUrl ? (
                                <AvatarImage src={friend.avatarUrl} alt={friend.username} />
                              ) : (
                                <AvatarFallback className="text-lg">
                                  {friend.username[0].toUpperCase()}
                                </AvatarFallback>
                              )}
                            </Avatar>
                            <div>
                              <h4 className="text-sm font-semibold">{friend.username}</h4>
                              <p className="text-sm text-muted-foreground">
                                {friend.mutualFriendCount} mutual {friend.mutualFriendCount === 1 ? 'friend' : 'friends'}
                              </p>
                            </div>
                          </div>
                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 }}
                            className="text-sm text-muted-foreground"
                          >
                            Connect with {friend.username} to expand your network and join mutual conversations.
                          </motion.div>
                        </div>
                      </HoverCardContent>
                    </HoverCard>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => sendFriendRequest.mutate(friend.id)}
                      disabled={sendFriendRequest.isPending}
                      className="ml-2"
                    >
                      <UserPlus className="h-4 w-4 mr-2" />
                      Add Friend
                    </Button>
                  </motion.div>
                ))}
              </motion.div>
            </AnimatePresence>
          </div>
        )}

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
        ) : !recommendations?.length ? (
          <div className="text-sm text-muted-foreground text-center py-8">
            Type at least 2 characters to search for users
          </div>
        ) : null}
      </div>
    </Card>
  );
}