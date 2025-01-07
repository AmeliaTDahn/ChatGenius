import { useState } from "react";
import { useUser } from "@/hooks/use-user";
import { useWebSocket } from "@/hooks/use-websocket";
import { UserHeader } from "@/components/chat/UserHeader";
import { ChannelList } from "@/components/chat/ChannelList";
import { MessageList } from "@/components/chat/MessageList";
import { MessageInput } from "@/components/chat/MessageInput";
import { UserSearch } from "@/components/chat/UserSearch";
import { FriendRequests } from "@/components/chat/FriendRequests";
import { FriendList } from "@/components/chat/FriendList";
import { InviteToChannel } from "@/components/chat/InviteToChannel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { UserPlus } from "lucide-react";
import type { Channel } from "@db/schema";
import { useToast } from "@/hooks/use-toast";

export default function ChatPage() {
  const { user, logout } = useUser();
  const { toast } = useToast();
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const { sendMessage } = useWebSocket(user);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isRequestsOpen, setIsRequestsOpen] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isFriendsOpen, setIsFriendsOpen] = useState(false);

  if (!user) return null;

  const handleSendMessage = (content: string) => {
    if (selectedChannel && content.trim() && user) {
      sendMessage({
        type: "message",
        channelId: selectedChannel.id,
        content: content.trim(),
        userId: user.id
      });
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      toast({
        title: "Logged out successfully",
        description: "Redirecting to login page...",
      });
    } catch (error: any) {
      console.error('Logout failed:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to logout",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="h-screen flex flex-col">
      <div className="flex flex-1 overflow-hidden">
        <div className="w-64 flex flex-col border-r">
          <UserHeader 
            user={user} 
            onLogout={handleLogout} 
            onAddFriend={() => setIsSearchOpen(true)}
            onViewRequests={() => setIsRequestsOpen(true)}
            onViewFriends={() => setIsFriendsOpen(true)}
          />
          <ChannelList
            selectedChannel={selectedChannel}
            onSelectChannel={setSelectedChannel}
          />
        </div>
        <div className="flex-1 flex flex-col">
          {selectedChannel ? (
            <>
              <div className="p-4 border-b flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-lg"># {selectedChannel.name}</h2>
                  {selectedChannel.description && (
                    <p className="text-sm text-muted-foreground">
                      {selectedChannel.description}
                    </p>
                  )}
                </div>
                {!selectedChannel.isDirectMessage && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsInviteOpen(true)}
                    title="Invite to Channel"
                  >
                    <UserPlus className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <MessageList channelId={selectedChannel.id} />
              <MessageInput onSendMessage={handleSendMessage} />
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              Select a channel to start chatting
            </div>
          )}
        </div>
      </div>

      {/* Fixed logout button at the bottom */}
      <Button 
        variant="ghost" 
        onClick={handleLogout}
        className="w-full py-4 rounded-none border-t hover:bg-destructive/10 text-sm font-medium transition-colors"
      >
        Logout
      </Button>

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
    </div>
  );
}