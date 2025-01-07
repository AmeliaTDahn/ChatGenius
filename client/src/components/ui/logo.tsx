import { MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  showText?: boolean;
}

export function Logo({ className, showText = true }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="relative flex items-center justify-center w-8 h-8 bg-gradient-to-br from-primary/90 to-primary/40 rounded-lg shadow-lg">
        <MessageSquare className="h-5 w-5 text-background absolute" />
      </div>
      {showText && (
        <span className="font-bold text-xl tracking-tight bg-gradient-to-br from-primary to-primary/60 bg-clip-text text-transparent">
          Chat Genius
        </span>
      )}
    </div>
  );
}