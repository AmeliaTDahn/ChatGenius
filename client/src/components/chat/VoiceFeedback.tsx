import { Button } from "@/components/ui/button";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";

interface VoiceFeedbackProps {
  messageContent: string;
  voiceSettings: any;
  onFeedbackComplete?: () => void;
}

export function VoiceFeedback({ messageContent, voiceSettings, onFeedbackComplete }: VoiceFeedbackProps) {
  const { toast } = useToast();

  const submitFeedback = useMutation({
    mutationFn: async (wasLiked: boolean) => {
      const response = await fetch('/api/voice-feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messageContent,
          voiceSettings,
          wasLiked,
        }),
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        description: "Thanks for your feedback! This will help improve voice tone matching.",
      });
      onFeedbackComplete?.();
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        description: error.message,
      });
    },
  });

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">How was the voice tone?</span>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => submitFeedback.mutate(true)}
        disabled={submitFeedback.isPending}
      >
        <ThumbsUp className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => submitFeedback.mutate(false)}
        disabled={submitFeedback.isPending}
      >
        <ThumbsDown className="h-4 w-4" />
      </Button>
    </div>
  );
}
