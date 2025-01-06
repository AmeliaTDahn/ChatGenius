import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import type { Channel, User } from "@db/schema";

type ChannelInvite = {
  id: number;
  channel: Channel;
  sender: User;
  status: string;
  createdAt: string;
};

export function ChannelInvites() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: invites, isLoading } = useQuery<ChannelInvite[]>({
    queryKey: ['/api/channel-invites'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const respondToInvite = useMutation({
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
    onSuccess: (_, variables) => {
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

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading invites...</div>;
  }

  if (!invites?.length) {
    return <div className="text-sm text-muted-foreground">No pending channel invites</div>;
  }

  return (
    <Card className="p-4">
      <h3 className="font-semibold mb-4">Channel Invites</h3>
      <div className="space-y-4">
        {invites.map((invite) => (
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
                  Invited you to join #{invite.channel.name}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="default"
                size="sm"
                onClick={() => respondToInvite.mutate({ id: invite.id, status: 'accepted' })}
                disabled={respondToInvite.isPending}
              >
                Accept
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => respondToInvite.mutate({ id: invite.id, status: 'rejected' })}
                disabled={respondToInvite.isPending}
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
