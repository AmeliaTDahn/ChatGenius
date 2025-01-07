import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Hash, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";
import { useChannels } from "@/hooks/use-channels";
import { DirectMessageList } from "./DirectMessageList";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import type { Channel } from "@db/schema";
import { useUser } from "@/hooks/use-user";

type ChannelListProps = {
  selectedChannel: Channel | null;
  onSelectChannel: (channel: Channel) => void;
};

export function ChannelList({ selectedChannel, onSelectChannel }: ChannelListProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const { channels, createChannel } = useChannels();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useUser();

  // Filter out direct message channels
  const regularChannels = channels.filter(channel => !channel.isDirectMessage);

  useEffect(() => {
    // Use secure WebSocket (wss://) when the page is loaded over HTTPS
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}`);

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'new_message' && data.senderId !== user?.id) {
        // Only update unread count if the message is not from the current user
        // and the channel is not currently selected
        if (selectedChannel?.id !== data.channelId) {
          queryClient.setQueryData(['channels'], (oldData: Channel[] | undefined) => {
            if (!oldData) return oldData;
            return oldData.map(ch => 
              ch.id === data.channelId ? { ...ch, unreadCount: (ch.unreadCount || 0) + 1 } : ch
            );
          });
        }
      }
    };

    return () => {
      ws.close();
    };
  }, [selectedChannel?.id, user?.id, queryClient]);

  const handleCreateChannel = async () => {
    if (newChannelName.trim()) {
      await createChannel({ name: newChannelName.trim() });
      setNewChannelName("");
      setIsOpen(false);
    }
  };

  const handleChannelSelect = async (channel: Channel) => {
    try {
      // First, update the selected channel in the parent component
      onSelectChannel(channel);

      // Immediately update the UI to remove the unread indicator
      queryClient.setQueryData(['channels'], (oldData: Channel[] | undefined) => {
        if (!oldData) return oldData;
        return oldData.map(ch => 
          ch.id === channel.id ? { ...ch, unreadCount: 0 } : ch
        );
      });

      // Then mark messages as read on the server
      await fetch(`/api/channels/${channel.id}/read`, {
        method: 'POST',
        credentials: 'include'
      });

      // Finally, invalidate queries to ensure data consistency
      await queryClient.invalidateQueries({ queryKey: ['channels'] });
      await queryClient.invalidateQueries({ queryKey: ['direct-messages'] });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to mark messages as read",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="h-full flex flex-col bg-sidebar">
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold text-lg">Channels</h2>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon">
                <Plus className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Channel</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <Input
                  placeholder="Channel name"
                  value={newChannelName}
                  onChange={(e) => setNewChannelName(e.target.value)}
                />
                <Button onClick={handleCreateChannel} className="w-full">
                  Create Channel
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-1 p-2">
          {regularChannels.map((channel) => (
            <Button
              key={channel.id}
              variant={channel.id === selectedChannel?.id ? "secondary" : "ghost"}
              className="w-full justify-start relative"
              onClick={() => handleChannelSelect(channel)}
            >
              <Hash className="h-4 w-4 mr-2" />
              {channel.name}
              {channel.unreadCount > 0 && channel.id !== selectedChannel?.id && (
                <div className="absolute right-2 w-2 h-2 rounded-full bg-red-500" />
              )}
            </Button>
          ))}
        </div>

        <Separator className="my-2 mx-2" />

        <div className="p-2">
          <h3 className="text-sm font-medium mb-2 px-2">Direct Messages</h3>
          <DirectMessageList onSelectChannel={handleChannelSelect} />
        </div>
      </ScrollArea>
    </div>
  );
}