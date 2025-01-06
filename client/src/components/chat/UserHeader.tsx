import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { LogOut, UserPlus, Bell } from "lucide-react";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { UserSearch } from "./UserSearch";
import { FriendRequests } from "./FriendRequests";
import type { User } from "@db/schema";
import { useQuery } from "@tanstack/react-query";

type UserHeaderProps = {
  user: User;
  onLogout: () => Promise<void>;
};

export function UserHeader({ user, onLogout }: UserHeaderProps) {
  const { data: requests } = useQuery<any[]>({
    queryKey: ['/api/friend-requests'],
    refetchInterval: 30000,
  });

  const pendingRequests = requests?.filter(r => r.status === 'pending')?.length || 0;

  // Safe fallback for username display
  const displayName = user?.username || 'User';
  const fallbackInitial = displayName.charAt(0).toUpperCase();

  const handleLogout = async () => {
    try {
      await onLogout();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <div className="flex items-center justify-between p-4 border-b bg-sidebar">
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
      <div className="flex items-center gap-2">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-4 w-4" />
              {pendingRequests > 0 && (
                <Badge className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center">
                  {pendingRequests}
                </Badge>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Friend Requests</SheetTitle>
            </SheetHeader>
            <div className="mt-4">
              <FriendRequests />
            </div>
          </SheetContent>
        </Sheet>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon">
              <UserPlus className="h-4 w-4" />
            </Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Add Friends</SheetTitle>
            </SheetHeader>
            <div className="mt-4">
              <UserSearch />
            </div>
          </SheetContent>
        </Sheet>
        <ThemeToggle />
        <Button variant="ghost" size="icon" onClick={handleLogout}>
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}