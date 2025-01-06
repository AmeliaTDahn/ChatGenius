import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import type { User } from "@db/schema";

type UserHeaderProps = {
  user: User;
  onLogout: () => void;
};

export function UserHeader({ user, onLogout }: UserHeaderProps) {
  return (
    <div className="flex items-center justify-between p-4 border-b bg-sidebar">
      <div className="flex items-center gap-3">
        <Avatar>
          <AvatarImage src={user.avatarUrl} alt={user.username} />
          <AvatarFallback>{user.username[0].toUpperCase()}</AvatarFallback>
        </Avatar>
        <div>
          <p className="font-medium text-sm">{user.username}</p>
          <p className="text-xs text-muted-foreground">Online</p>
        </div>
      </div>
      <Button variant="ghost" size="icon" onClick={onLogout}>
        <LogOut className="h-4 w-4" />
      </Button>
    </div>
  );
}
