import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, Users, ArrowLeft } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
import { Link } from "wouter";

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

export default function SuggestedFriends() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: recommendations, isLoading } = useQuery<RecommendedFriend[]>({
    queryKey: ['/api/friends/recommendations'],
    refetchInterval: 30000, // Refresh every 30 seconds
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

  return (
    <div className="container max-w-2xl mx-auto p-4 space-y-4">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/" className="hover:opacity-80">
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <h1 className="text-2xl font-bold">Suggested Friends</h1>
      </div>

      {isLoading ? (
        <Card className="p-8">
          <div className="flex flex-col items-center justify-center text-muted-foreground">
            <Users className="h-12 w-12 mb-4 animate-pulse" />
            <p>Finding people you may know...</p>
          </div>
        </Card>
      ) : !recommendations?.length ? (
        <Card className="p-8">
          <div className="flex flex-col items-center justify-center text-muted-foreground">
            <Users className="h-12 w-12 mb-4" />
            <p className="font-medium">No suggestions available</p>
            <p className="text-sm mt-2">Add some friends to get personalized suggestions</p>
          </div>
        </Card>
      ) : (
        <AnimatePresence>
          <motion.div 
            className="grid gap-4 sm:grid-cols-1 md:grid-cols-2"
            variants={container}
            initial="hidden"
            animate="show"
          >
            {recommendations.map((friend) => (
              <motion.div 
                key={friend.id}
                variants={item}
                layout
              >
                <Card className="p-4">
                  <HoverCard>
                    <HoverCardTrigger>
                      <div className="flex items-center gap-3 cursor-pointer">
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
                          <p className="font-medium">{friend.username}</p>
                          <motion.p 
                            className="text-sm text-muted-foreground"
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
                          <Avatar className="h-16 w-16">
                            {friend.avatarUrl ? (
                              <AvatarImage src={friend.avatarUrl} alt={friend.username} />
                            ) : (
                              <AvatarFallback className="text-xl">
                                {friend.username[0].toUpperCase()}
                              </AvatarFallback>
                            )}
                          </Avatar>
                          <div>
                            <h4 className="text-lg font-semibold">{friend.username}</h4>
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
                  <div className="mt-4">
                    <Button
                      className="w-full"
                      variant="secondary"
                      size="sm"
                      onClick={() => sendFriendRequest.mutate(friend.id)}
                      disabled={sendFriendRequest.isPending}
                    >
                      <UserPlus className="h-4 w-4 mr-2" />
                      Add Friend
                    </Button>
                  </div>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}
