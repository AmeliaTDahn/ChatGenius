import { MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  showText?: boolean;
}

export function Logo({ className, showText = true }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <MessageSquare className="h-6 w-6 text-primary" />
      {showText && (
        <span className="font-bold text-xl bg-gradient-to-r from-primary to-primary/50 bg-clip-text text-transparent">
          Chat Genius
        </span>
      )}
    </div>
  );
}
