import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

type FriendRequest = {
  id: number;
  sender: {
    id: number;
    username: string;
    avatarUrl?: string;
  };
  status: string;
  createdAt: string;
};

export function FriendRequests() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: requests, isLoading } = useQuery<FriendRequest[]>({
    queryKey: ['/api/friend-requests'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const respondToRequest = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: 'accepted' | 'rejected' }) => {
      const res = await fetch(`/api/friend-requests/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
        credentials: 'include'
      });

      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (_, variables) => {
      toast({
        title: variables.status === 'accepted' ? "Friend request accepted" : "Friend request rejected",
        description: variables.status === 'accepted' 
          ? "You are now friends!" 
          : "The friend request has been rejected.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/friend-requests'] });
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
    return <div className="text-sm text-muted-foreground">Loading requests...</div>;
  }

  if (!requests?.length) {
    return <div className="text-sm text-muted-foreground">No pending friend requests</div>;
  }

  return (
    <Card className="p-4">
      <h3 className="font-semibold mb-4">Friend Requests</h3>
      <div className="space-y-4">
        {requests.map((request) => (
          <div key={request.id} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Avatar>
                {request.sender.avatarUrl ? (
                  <AvatarImage src={request.sender.avatarUrl} alt={request.sender.username} />
                ) : (
                  <AvatarFallback>
                    {request.sender.username[0].toUpperCase()}
                  </AvatarFallback>
                )}
              </Avatar>
              <div>
                <p className="font-medium">{request.sender.username}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(request.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="default"
                size="sm"
                onClick={() => respondToRequest.mutate({ id: request.id, status: 'accepted' })}
                disabled={respondToRequest.isPending}
              >
                Accept
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => respondToRequest.mutate({ id: request.id, status: 'rejected' })}
                disabled={respondToRequest.isPending}
              >
                Decline
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
