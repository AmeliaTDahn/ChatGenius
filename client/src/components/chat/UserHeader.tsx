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
      // Redirect after showing the toast
      window.location.href = '/';
    } catch (error) {
      console.error('Logout failed:', error);
      toast({
        title: "Logout failed",
        description: "Please try again",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex items-center justify-between p-4 border-b">
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
      <div className="flex gap-2">
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
        <Button 
          variant="ghost" 
          size="icon"
          onClick={handleLogout}
          className="hover:bg-destructive/10"
          title="Logout"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}