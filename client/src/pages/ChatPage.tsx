import { useState } from "react";
import { useUser } from "@/hooks/use-user";
import { useWebSocket } from "@/hooks/use-websocket";
import { UserHeader } from "@/components/chat/UserHeader";
import { ChannelList } from "@/components/chat/ChannelList";
import { MessageList } from "@/components/chat/MessageList";
import { MessageInput } from "@/components/chat/MessageInput";
import type { Channel } from "@db/schema";

export default function ChatPage() {
  const { user, logout } = useUser();
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const { sendMessage } = useWebSocket(user);

  if (!user) return null;

  const handleSendMessage = (content: string) => {
    if (selectedChannel) {
      sendMessage({
        type: "message",
        channelId: selectedChannel.id,
        content,
      });
    }
  };

  return (
    <div className="h-screen flex">
      <div className="w-64 flex flex-col border-r">
        <UserHeader user={user} onLogout={logout} />
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
    </div>
  );
}
