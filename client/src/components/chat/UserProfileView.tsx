import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import type { User } from "@db/schema";

type UserProfileViewProps = {
  user: User;
  isOpen: boolean;
  onClose: () => void;
};

export function UserProfileView({ user, isOpen, onClose }: UserProfileViewProps) {
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

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Profile</DialogTitle>
        </DialogHeader>
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
                className={`absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-background ${getStatusColor(user.status)}`}
              />
            </div>
            <div className="text-center">
              <h3 className="font-semibold text-lg">{user.username}</h3>
              <p className="text-sm text-muted-foreground">
                {user.isOnline ? user.status : 'offline'}
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

            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-1">Member since</h4>
              <p>{formatDate(user.createdAt)}</p>
            </div>

            {user.lastActive && (
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-1">Last active</h4>
                <p>{formatDate(user.lastActive)}</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}