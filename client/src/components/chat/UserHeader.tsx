import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { LogOut, UserPlus, Bell, Users } from "lucide-react";
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
      {/* Left side: User info and action buttons */}
      <div className="flex items-center gap-2">
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
        <div className="flex gap-2 ml-4">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={onViewFriends}
            title="Friends"
          >
            <Users className="h-4 w-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon"
            onClick={onViewRequests}
            title="Friend Requests"
          >
            <Bell className="h-4 w-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon"
            onClick={onAddFriend}
            title="Add Friend"
          >
            <UserPlus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Right side: Logout button */}
      <Button 
        variant="ghost" 
        size="icon"
        onClick={handleLogout}
        title="Logout"
        className="hover:bg-destructive/10"
      >
        <LogOut className="h-4 w-4" />
      </Button>
    </div>
  );
}