import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { UserPlus, Bell, Users } from "lucide-react";
import type { User } from "@db/schema";
import { useToast } from "@/hooks/use-toast";

type UserHeaderProps = {
  user: User;
  onLogout: () => Promise<void>;
  onAddFriend: () => void;
  onViewRequests: () => void;
  onViewFriends: () => void;
};

export function UserHeader({ user, onLogout, onAddFriend, onViewRequests, onViewFriends }: UserHeaderProps) {
  const { toast } = useToast();

  // Safe fallback for username display
  const displayName = user?.username || 'User';
  const fallbackInitial = displayName.charAt(0).toUpperCase();

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

  return (
    <div className="flex items-center justify-between p-4 border-b bg-background">
      {/* Left side: User info */}
      <div className="flex items-center gap-3">
        <Avatar>
          {user?.avatarUrl ? (
            <AvatarImage src={user.avatarUrl} alt={displayName} />
          ) : (
            <AvatarFallback>{fallbackInitial}</AvatarFallback>
          )}
        </Avatar>
        <div>
          <p className="font-medium text-sm">{displayName}</p>
          <p className="text-xs text-muted-foreground">Online</p>
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

      {/* Right side: Logout text button */}
      <Button 
        variant="ghost" 
        size="sm"
        onClick={handleLogout}
        className="text-sm font-medium hover:bg-destructive/10"
      >
        Logout
      </Button>
    </div>
  );
}