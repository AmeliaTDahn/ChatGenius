import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Loader2 } from "lucide-react";
import { useMessageSearch } from "@/hooks/use-message-search";
import { format } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type MessageSearchProps = {
  isOpen: boolean;
  onClose: () => void;
  channelId?: number;
  onMessageSelect?: (messageId: number) => void;
};

export function MessageSearch({ isOpen, onClose, channelId, onMessageSelect }: MessageSearchProps) {
  const [query, setQuery] = useState("");
  const { data: messages, isLoading } = useMessageSearch(query, channelId);

  // Function to highlight matching text
  const highlightMatch = (text: string, searchQuery: string) => {
    if (!searchQuery) return text;

    const parts = text.split(new RegExp(`(${searchQuery})`, 'gi'));
    return parts.map((part, i) => 
      part.toLowerCase() === searchQuery.toLowerCase() ? 
        <span key={i} className="bg-yellow-200 dark:bg-yellow-900">{part}</span> : 
        part
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Search Messages</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search messages..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
            autoFocus
          />
        </div>

        {query.length >= 2 && (
          <ScrollArea className="flex-1 mt-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : messages?.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No messages found
              </p>
            ) : (
              <div className="space-y-4">
                {messages?.map((message) => (
                  <Button
                    key={message.id}
                    variant="ghost"
                    className="w-full justify-start"
                    onClick={() => {
                      onMessageSelect?.(message.id);
                      onClose();
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={message.user.avatarUrl || undefined} alt={message.user.username} />
                        <AvatarFallback>{message.user.username[0].toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 text-left">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{message.user.username}</span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(message.createdAt), "MMM d, h:mm a")}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {highlightMatch(message.content, query)}
                        </p>
                        {!channelId && message.channel && (
                          <p className="text-xs text-muted-foreground mt-1">
                            in {message.channel.name}
                          </p>
                        )}
                      </div>
                    </div>
                  </Button>
                ))}
              </div>
            )}
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}