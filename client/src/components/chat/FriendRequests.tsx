import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";

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

type ChannelInvite = {
  id: number;
  channel: {
    id: number;
    name: string;
    description?: string;
  };
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

  const { data: requests, isLoading: isLoadingRequests } = useQuery<FriendRequest[]>({
    queryKey: ['/api/friend-requests'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const { data: channelInvites, isLoading: isLoadingInvites } = useQuery<ChannelInvite[]>({
    queryKey: ['/api/channel-invites'],
    refetchInterval: 30000,
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
    onSuccess: (data, variables) => {
      if (variables.status === 'accepted') {
        // Update friends list cache immediately
        queryClient.setQueryData<any[]>(['/api/friends'], (oldFriends = []) => {
          const { sender } = data;
          // Add the new friend to the list if not already present
          if (!oldFriends.some(friend => friend.id === sender.id)) {
            return [...oldFriends, sender];
          }
          return oldFriends;
        });

        // Update direct messages cache to include the new DM channel
        queryClient.setQueryData<any[]>(['/api/direct-messages'], (oldDMs = []) => {
          if (data.dmChannel) {
            const newDM = {
              ...data.dmChannel,
              otherUser: data.sender
            };
            return [newDM, ...oldDMs];
          }
          return oldDMs;
        });
      }

      toast({
        title: variables.status === 'accepted' ? "Friend request accepted" : "Friend request rejected",
        description: variables.status === 'accepted' 
          ? "You are now friends!" 
          : "The friend request has been rejected.",
      });

      // Remove the request from the requests list
      queryClient.setQueryData<FriendRequest[]>(['/api/friend-requests'], (oldRequests = []) => {
        return oldRequests.filter(request => request.id !== variables.id);
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

  const respondToChannelInvite = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: 'accepted' | 'rejected' }) => {
      const res = await fetch(`/api/channel-invites/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
        credentials: 'include'
      });

      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (data, variables) => {
      toast({
        title: variables.status === 'accepted' ? "Channel invite accepted" : "Channel invite rejected",
        description: variables.status === 'accepted' 
          ? "You have joined the channel!" 
          : "The channel invite has been rejected.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/channel-invites'] });
      queryClient.invalidateQueries({ queryKey: ['/api/channels'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  if (isLoadingRequests || isLoadingInvites) {
    return <div className="text-sm text-muted-foreground">Loading...</div>;
  }

  const hasNoRequests = !requests?.length && !channelInvites?.length;
  if (hasNoRequests) {
    return <div className="text-sm text-muted-foreground">No pending requests or invites</div>;
  }

  return (
    <div className="space-y-6">
      {requests?.length > 0 && (
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
      )}

      {channelInvites?.length > 0 && (
        <Card className="p-4">
          <h3 className="font-semibold mb-4">Channel Invites</h3>
          <div className="space-y-4">
            {channelInvites.map((invite) => (
              <div key={invite.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Avatar>
                    {invite.sender.avatarUrl ? (
                      <AvatarImage src={invite.sender.avatarUrl} alt={invite.sender.username} />
                    ) : (
                      <AvatarFallback>
                        {invite.sender.username[0].toUpperCase()}
                      </AvatarFallback>
                    )}
                  </Avatar>
                  <div>
                    <p className="font-medium">{invite.sender.username}</p>
                    <p className="text-sm text-muted-foreground">
                      Invited you to #{invite.channel.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(invite.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => respondToChannelInvite.mutate({ id: invite.id, status: 'accepted' })}
                    disabled={respondToChannelInvite.isPending}
                  >
                    Join
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => respondToChannelInvite.mutate({ id: invite.id, status: 'rejected' })}
                    disabled={respondToChannelInvite.isPending}
                  >
                    Decline
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}