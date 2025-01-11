import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { UserPlus, Bell, Users, User as UserIcon, Settings } from "lucide-react";
import type { User } from "@db/schema";
import { useToast } from "@/hooks/use-toast";
import { Logo } from "@/components/ui/logo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { UserSettings } from "./UserSettings";
import { useState, useEffect } from "react";
import { ThemeToggle } from "@/components/ui/theme-toggle";


type UserHeaderProps = {
  user: User;
  onLogout: () => Promise<void>;
  onAddFriend: () => void;
  onViewRequests: () => void;
  onViewFriends: () => void;
};

export function UserHeader({ user, onLogout, onAddFriend, onViewRequests, onViewFriends }: UserHeaderProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showSettings, setShowSettings] = useState(false);
  const [ws, setWs] = useState<WebSocket | null>(null);

  // Initialize WebSocket connection
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    const socket = new WebSocket(wsUrl);

    socket.addEventListener('message', (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'status_update') {
        // Update local user data if it's the current user
        if (data.userId === user.id) {
          queryClient.setQueryData(['user'], (oldData: any) => ({
            ...oldData,
            hideActivity: data.hideActivity,
            isOnline: data.isOnline
          }));
        }
        // Invalidate friends query to update friend statuses
        queryClient.invalidateQueries({ queryKey: ['/api/friends'] });
      }
    });

    setWs(socket);

    return () => {
      socket.close();
    };
  }, [user.id, queryClient]);

  const updateStatus = useMutation({
    mutationFn: async (hideActivity: boolean) => {
      const res = await fetch('/api/user/status', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hideActivity }),
        credentials: 'include'
      });

      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (updatedUser) => {
      queryClient.setQueryData(['user'], updatedUser);
      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const getStatusColor = (isOnline: boolean, hideActivity: boolean) => {
    if (hideActivity) {
      return 'bg-gray-500';
    }
    return isOnline ? 'bg-green-500' : 'bg-gray-500';
  };

  // Safe fallback for username display
  const displayName = user.username;
  const fallbackInitial = displayName.charAt(0).toUpperCase();

  // Query for pending notifications
  const { data: friendRequests = [] } = useQuery({
    queryKey: ['/api/friend-requests'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const { data: channelInvites = [] } = useQuery({
    queryKey: ['/api/channel-invites'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const hasNotifications = friendRequests.length > 0 || channelInvites.length > 0;

  return (
    <div className="flex flex-col border-b bg-background">
      {/* Top section with logo, user info, and main actions */}
      <div className="flex items-center justify-between px-6 py-4">
        {/* Left side: Logo and User info */}
        <div className="flex items-center gap-4">
          <Logo showText={false} />
          <div className="flex items-center gap-3">
            <div className="relative">
              <Avatar>
                {user?.avatarUrl ? (
                  <AvatarImage src={user.avatarUrl} alt={displayName} />
                ) : (
                  <AvatarFallback>{fallbackInitial}</AvatarFallback>
                )}
              </Avatar>
              <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-background ${getStatusColor(user.isOnline, user.hideActivity)}`} />
            </div>
            <div>
              <p className="font-medium text-sm">{displayName}</p>
              <DropdownMenu>
                <DropdownMenuTrigger className="text-xs text-muted-foreground hover:text-foreground">
                  {user.hideActivity ? 'Activity Hidden' : 'Online'}
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => updateStatus.mutate(false)}>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                      Show Activity
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => updateStatus.mutate(true)}>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-gray-500" />
                      Hide Activity
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowSettings(true)}>
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>

        {/* Right side: Action buttons */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowSettings(true)}
            title="Settings"
            className="w-9 h-9"
          >
            <UserIcon className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Action buttons section */}
      <div className="flex flex-col border-t">
        <div className="flex items-center gap-3 px-6 py-3">
          <Button
            variant="ghost"
            onClick={onViewFriends}
            className="flex items-center gap-2 hover:bg-accent/10 rounded-none"
          >
            <Users className="h-4 w-4" />
            <span className="text-sm font-medium">Friends</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onAddFriend}
            title="Add Friend"
            className="w-9 h-9"
          >
            <UserPlus className="h-5 w-5" />
          </Button>
        </div>


        <Button
          variant="ghost"
          onClick={onViewRequests}
          className="flex items-center gap-2 px-6 py-3 justify-start hover:bg-accent/10 rounded-none border-t relative"
        >
          <Bell className="h-4 w-4" />
          <span className="text-sm font-medium">Notifications</span>
          {hasNotifications && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-background" />
          )}
        </Button>
      </div>

      {/* Settings Dialog */}
      {showSettings && (
        <UserSettings user={user} onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}