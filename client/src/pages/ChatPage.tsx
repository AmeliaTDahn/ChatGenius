import { useState } from "react";
import { useUser } from "@/hooks/use-user";
import { useWebSocket } from "@/hooks/use-websocket";
import { UserHeader } from "@/components/chat/UserHeader";
import { ChannelList } from "@/components/chat/ChannelList";
import { MessageList } from "@/components/chat/MessageList";
import { MessageInput } from "@/components/chat/MessageInput";
import { UserSearch } from "@/components/chat/UserSearch";
import { FriendRequests } from "@/components/chat/FriendRequests";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Channel } from "@db/schema";

export default function ChatPage() {
  const { user, logout } = useUser();
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const { sendMessage } = useWebSocket(user);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isRequestsOpen, setIsRequestsOpen] = useState(false);

  if (!user) return null;

  const handleSendMessage = (content: string) => {
    if (selectedChannel && content.trim()) {
      sendMessage({
        type: "message",
        channelId: selectedChannel.id,
        content: content.trim()
      });
    }
  };

  return (
    <div className="h-screen flex">
      <div className="w-64 flex flex-col border-r">
        <UserHeader 
          user={user} 
          onLogout={logout} 
          onAddFriend={() => setIsSearchOpen(true)}
          onViewRequests={() => setIsRequestsOpen(true)}
        />
        <ChannelList
          selectedChannel={selectedChannel}
          onSelectChannel={setSelectedChannel}
        />
      </div>
      <div className="flex-1 flex flex-col">
        {selectedChannel ? (
          <>
            <div className="p-4 border-b">
              <h2 className="font-semibold text-lg"># {selectedChannel.name}</h2>
              {selectedChannel.description && (
                <p className="text-sm text-muted-foreground">
                  {selectedChannel.description}
                </p>
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
    </div>
  );
}