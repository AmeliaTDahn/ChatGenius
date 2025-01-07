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
import { useState } from "react";
import { useChannels } from "@/hooks/use-channels";
import { DirectMessageList } from "./DirectMessageList";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import type { Channel } from "@db/schema";

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

  // Filter out direct message channels
  const regularChannels = channels.filter(channel => !channel.isDirectMessage);

  const handleCreateChannel = async () => {
    if (newChannelName.trim()) {
      await createChannel({ name: newChannelName.trim() });
      setNewChannelName("");
      setIsOpen(false);
    }
  };

  const handleChannelSelect = async (channel: Channel) => {
    try {
      onSelectChannel(channel);

      // Mark messages as read when selecting the channel
      await fetch(`/api/channels/${channel.id}/read`, {
        method: 'POST',
        credentials: 'include'
      });

      // Invalidate both queries to refresh the unread status
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['/api/direct-messages'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/channels'] }),
        queryClient.invalidateQueries({ queryKey: [`/api/channels/${channel.id}/messages`] })
      ]);
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
              {channel.unreadCount && channel.unreadCount > 0 && (
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