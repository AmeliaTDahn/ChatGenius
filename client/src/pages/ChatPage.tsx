import { useState } from "react";
import { useUser } from "@/hooks/use-user";
import { useWebSocket } from "@/hooks/use-websocket";
import { useMessages } from "@/hooks/use-messages";
import { UserHeader } from "@/components/chat/UserHeader";
import { ChannelList } from "@/components/chat/ChannelList";
import { MessageList } from "@/components/chat/MessageList";
import { MessageInput } from "@/components/chat/MessageInput";
import { UserSearch } from "@/components/chat/UserSearch";
import { FriendRequests } from "@/components/chat/FriendRequests";
import { FriendList } from "@/components/chat/FriendList";
import { InviteToChannel } from "@/components/chat/InviteToChannel";
import { MessageSearch } from "@/components/chat/MessageSearch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { UserPlus, Loader2, Search, LogOut, Palette } from "lucide-react";
import type { Channel, User } from "@db/schema";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useChannels } from "@/hooks/use-channels";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// Extended Channel type to include otherUser for direct messages
type ExtendedChannel = Channel & {
  otherUser?: User;
  backgroundColor?: string;
};

export default function ChatPage() {
  const queryClient = useQueryClient();
  const { user, logout } = useUser();
  const { toast } = useToast();
  const [selectedChannel, setSelectedChannel] = useState<ExtendedChannel | null>(null);
  const { handleWebSocketMessage, sendMessage: sendWebSocketMessage } = useMessages(selectedChannel?.id || 0);
  const { sendMessage: sendWsMessage } = useWebSocket(user, handleWebSocketMessage);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isMessageSearchOpen, setIsMessageSearchOpen] = useState(false);
  const [isRequestsOpen, setIsRequestsOpen] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isFriendsOpen, setIsFriendsOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const { leaveChannel, updateChannelColor } = useChannels();

  if (!user) return null;

  const handleLeaveChannel = async () => {
    if (!selectedChannel || selectedChannel.isDirectMessage) return;

    try {
      await leaveChannel(selectedChannel.id);
      setSelectedChannel(null);

      toast({
        title: "Success",
        description: `Left channel ${selectedChannel.name}`,
      });
    } catch (error: any) {
      console.error('Failed to leave channel:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to leave channel",
        variant: "destructive",
      });
    }
  };

  const handleColorChange = async (color: string) => {
    if (!selectedChannel || selectedChannel.isDirectMessage) return;

    try {
      const updatedChannel = await updateChannelColor({
        channelId: selectedChannel.id,
        backgroundColor: color,
      });

      // Update the selected channel state with the new color
      setSelectedChannel(prev => prev ? {
        ...prev,
        backgroundColor: updatedChannel.backgroundColor
      } : null);

    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update channel color",
        variant: "destructive",
      });
    }
  };

  const handleSendMessage = async (content: string, files?: File[]) => {
    if (selectedChannel && (content.trim() || (files && files.length > 0)) && user) {
      try {
        await sendWebSocketMessage({ content: content.trim(), files });
        sendWsMessage({
          type: "message",
          channelId: selectedChannel.id,
          content: content.trim(),
          userId: user.id,
        });
      } catch (error: any) {
        console.error('Failed to send message:', error);
        toast({
          title: "Error",
          description: error.message || "Failed to send message",
          variant: "destructive",
        });
      }
    }
  };

  const handleLogout = async () => {
    if (isLoggingOut) return;

    try {
      setIsLoggingOut(true);
      await logout();
      toast({
        title: "Logged out successfully",
        description: "Redirecting to login page...",
      });
      window.location.reload();
    } catch (error: any) {
      console.error('Logout failed:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to logout",
        variant: "destructive",
      });
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handleMessageSelect = (messageId: number) => {
    const element = document.getElementById(`message-${messageId}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
      element.classList.add("bg-accent/20");
      setTimeout(() => element.classList.remove("bg-accent/20"), 2000);
    }
  };

  return (
    <div className="h-screen flex flex-col">
      <div className="flex-1 flex overflow-hidden">
        <div className="w-64 flex flex-col border-r">
          <UserHeader
            user={user}
            onLogout={handleLogout}
            onAddFriend={() => setIsSearchOpen(true)}
            onViewRequests={() => setIsRequestsOpen(true)}
            onViewFriends={() => setIsFriendsOpen(true)}
          />
          <div className="flex-1 overflow-y-auto">
            <ChannelList
              selectedChannel={selectedChannel}
              onSelectChannel={setSelectedChannel}
            />
          </div>

          <Button
            variant="ghost"
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="w-full py-4 rounded-none border-t hover:bg-destructive/10 text-sm font-medium transition-colors relative"
          >
            {isLoggingOut ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Logging out...
              </>
            ) : (
              'Logout'
            )}
          </Button>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
            {selectedChannel ? (
              <>
                <div className="p-4 border-b flex items-center justify-between bg-background">
                  <div>
                    {selectedChannel.isDirectMessage ? (
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={selectedChannel.otherUser?.avatarUrl || ""} alt={selectedChannel.otherUser?.username} />
                          <AvatarFallback>
                            {selectedChannel.otherUser?.username?.[0].toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <h2 className="font-semibold text-lg">
                          {selectedChannel.otherUser?.username}
                        </h2>
                      </div>
                    ) : (
                      <>
                        <h2 className="font-semibold text-lg"># {selectedChannel.name}</h2>
                        {selectedChannel.description && (
                          <p className="text-sm text-muted-foreground">
                            {selectedChannel.description}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setIsMessageSearchOpen(true)}
                      title="Search Messages"
                    >
                      <Search className="h-4 w-4" />
                    </Button>
                    {!selectedChannel.isDirectMessage && (
                      <>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Change Channel Color"
                            >
                              <Palette className="h-4 w-4" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-2">
                            <div className="flex gap-1">
                              {[
                                "#FFB3B3", // Pastel Red
                                "#FFDAB3", // Pastel Orange
                                "#FFF2B3", // Pastel Yellow
                                "#B3E6CC", // Pastel Green
                                "#B3D9FF", // Pastel Blue
                                "#D9B3FF", // Pastel Purple
                                "#FFB3E6", // Pastel Pink
                                "#ffffff", // White
                              ].map((color) => (
                                <Button
                                  key={color}
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className={cn(
                                    "w-6 h-6 p-0",
                                    selectedChannel?.backgroundColor === color && "ring-2 ring-primary"
                                  )}
                                  style={{ backgroundColor: color }}
                                  onClick={() => handleColorChange(color)}
                                />
                              ))}
                            </div>
                          </PopoverContent>
                        </Popover>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setIsInviteOpen(true)}
                          title="Invite to Channel"
                        >
                          <UserPlus className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={handleLeaveChannel}
                          title="Leave Channel"
                        >
                          <LogOut className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                <div 
                  className="flex-1 min-h-0"
                  style={{ 
                    backgroundColor: selectedChannel.backgroundColor || '#ffffff',
                    transition: 'background-color 0.2s ease-in-out'
                  }}
                >
                  <MessageList channelId={selectedChannel.id} />
                </div>
                <div className="p-4 border-t bg-background">
                  <MessageInput onSendMessage={handleSendMessage} />
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                Select a channel to start chatting
              </div>
            )}
          </div>
      </div>

      <Dialog open={isSearchOpen} onOpenChange={setIsSearchOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Friend</DialogTitle>
          </DialogHeader>
          <UserSearch />
        </DialogContent>
      </Dialog>

      <Dialog open={isRequestsOpen} onOpenChange={setIsRequestsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Friend Requests</DialogTitle>
          </DialogHeader>
          <FriendRequests />
        </DialogContent>
      </Dialog>

      <Dialog open={isFriendsOpen} onOpenChange={setIsFriendsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Friends</DialogTitle>
          </DialogHeader>
          <FriendList />
        </DialogContent>
      </Dialog>

      {selectedChannel && !selectedChannel.isDirectMessage && (
        <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite to {selectedChannel.name}</DialogTitle>
            </DialogHeader>
            <InviteToChannel channelId={selectedChannel.id} />
          </DialogContent>
        </Dialog>
      )}

      <MessageSearch
        isOpen={isMessageSearchOpen}
        onClose={() => setIsMessageSearchOpen(false)}
        channelId={selectedChannel?.id}
        onMessageSelect={handleMessageSelect}
      />
    </div>
  );
}