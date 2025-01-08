import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import type { User } from "@db/schema";

type UserProfileViewProps = {
  user: User;
  isOpen?: boolean;
  onClose?: () => void;
  asChild?: boolean;
};

export function UserProfileView({ user, isOpen, onClose, asChild = false }: UserProfileViewProps) {
  const getStatusColor = (isOnline: boolean, hideActivity: boolean) => {
    if (hideActivity) {
      return 'bg-gray-500';
    }
    return isOnline ? 'bg-green-500' : 'bg-gray-500';
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const Content = (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <Avatar className="h-24 w-24">
            {user.avatarUrl ? (
              <AvatarImage src={user.avatarUrl} alt={user.username} />
            ) : (
              <AvatarFallback>{user.username[0].toUpperCase()}</AvatarFallback>
            )}
          </Avatar>
          <div 
            className={`absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-background ${getStatusColor(user.isOnline, user.hideActivity)}`}
          />
        </div>
        <div className="text-center">
          <h3 className="font-semibold text-lg">{user.username}</h3>
          <p className="text-sm text-muted-foreground">
            {user.hideActivity ? 'Activity Hidden' : (user.isOnline ? 'Online' : 'Offline')}
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {user.age && (
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-1">Age</h4>
            <p>{user.age} years old</p>
          </div>
        )}

        {user.city && (
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-1">Location</h4>
            <p>{user.city}</p>
          </div>
        )}

        {user.timezone && (
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-1">Time Zone</h4>
            <p>{user.timezone}</p>
          </div>
        )}

        {user.lastActive && (
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-1">Last active</h4>
            <p>{formatDate(user.lastActive)}</p>
          </div>
        )}
      </div>
    </div>
  );

  if (asChild) {
    return Content;
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Profile</DialogTitle>
        </DialogHeader>
        {Content}
      </DialogContent>
    </Dialog>
  );
}