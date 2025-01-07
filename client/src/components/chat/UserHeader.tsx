import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { UserPlus, Bell, Users } from "lucide-react";
import type { User } from "@db/schema";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMutation, useQueryClient } from "@tanstack/react-query";

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

  // Safe fallback for username display
  const displayName = user?.username || 'User';
  const fallbackInitial = displayName.charAt(0).toUpperCase();

  const updateStatus = useMutation({
    mutationFn: async (status: string) => {
      const res = await fetch('/api/user/status', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
        credentials: 'include'
      });

      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
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

  const handleLogout = async () => {
    try {
      await onLogout();
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
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online':
        return 'bg-green-500';
      case 'away':
        return 'bg-yellow-500';
      case 'busy':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <div className="relative flex items-center justify-between p-4 border-b bg-background">
      {/* Absolute positioned logout button */}
      <Button 
        variant="ghost" 
        size="sm"
        onClick={handleLogout}
        className="absolute top-2 right-2 text-sm font-medium hover:bg-destructive/10"
      >
        Logout
      </Button>

      {/* Left side: User info */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <Avatar>
            {user?.avatarUrl ? (
              <AvatarImage src={user.avatarUrl} alt={displayName} />
            ) : (
              <AvatarFallback>{fallbackInitial}</AvatarFallback>
            )}
          </Avatar>
          <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${getStatusColor(user.status)}`} />
        </div>
        <div>
          <p className="font-medium text-sm">{displayName}</p>
          <DropdownMenu>
            <DropdownMenuTrigger className="text-xs text-muted-foreground hover:text-foreground">
              {user.status}
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => updateStatus.mutate('online')}>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  Online
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => updateStatus.mutate('away')}>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-yellow-500" />
                  Away
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => updateStatus.mutate('busy')}>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                  Busy
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Center: Action buttons */}
      <div className="flex items-center gap-2">
        <Button 
          variant="ghost" 
          size="icon"
          onClick={onViewFriends}
          title="Friends"
          className="w-9 h-9"
        >
          <Users className="h-5 w-5" />
        </Button>
        <Button 
          variant="ghost" 
          size="icon"
          onClick={onViewRequests}
          title="Friend Requests"
          className="w-9 h-9"
        >
          <Bell className="h-5 w-5" />
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
    </div>
  );
}