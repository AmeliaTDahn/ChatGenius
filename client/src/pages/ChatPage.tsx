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
import { MessageSearch } from "@/components/chat/MessageSearch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { UserPlus, Loader2, Search } from "lucide-react";
import type { Channel } from "@db/schema";
import type { Message } from "@db/schema"; // Added import for Message type
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export default function ChatPage() {
  const queryClient = useQueryClient();
  const { user, logout } = useUser();
  const { toast } = useToast();
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const { sendMessage } = useWebSocket(user);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isMessageSearchOpen, setIsMessageSearchOpen] = useState(false);
  const [isRequestsOpen, setIsRequestsOpen] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isFriendsOpen, setIsFriendsOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  if (!user) return null;

  const handleSendMessage = async (content: string, files?: File[]) => {
    if (selectedChannel && (content.trim() || (files && files.length > 0)) && user) {
      try {
        // First, handle file upload and message creation through REST API
        const queryKey = [`/api/channels/${selectedChannel.id}/messages`];
        const formData = new FormData();
        formData.append('content', content.trim());

        if (files && files.length > 0) {
          files.forEach(file => {
            formData.append('files', file);
          });
        }

        const response = await fetch(`/api/channels/${selectedChannel.id}/messages`, {
          method: 'POST',
          body: formData,
          credentials: 'include',
        });

        if (!response.ok) {
          throw new Error(await response.text());
        }

        const newMessage = await response.json();

        // Notify other users through WebSocket
        sendMessage({
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
    // Scroll to message or highlight it
    const element = document.getElementById(`message-${messageId}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
      element.classList.add("bg-accent/20");
      setTimeout(() => element.classList.remove("bg-accent/20"), 2000);
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

          {/* Bottom left logout button */}
          <Button 
            variant="ghost" 
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="w-64 py-4 rounded-none border-t hover:bg-destructive/10 text-sm font-medium transition-colors relative"
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