import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Lightbulb, Loader2, ThumbsUp, ThumbsDown, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface SuggestionButtonProps {
  channelId: number;
  onSuggestion: (suggestion: string) => void;
  disabled?: boolean;
}

export function SuggestionButton({ channelId, onSuggestion, disabled }: SuggestionButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [currentSuggestion, setCurrentSuggestion] = useState("");
  const { toast } = useToast();

  const handleGetSuggestion = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/channels/${channelId}/suggest-reply`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to get suggestion');
      }

      const data = await response.json();
      if (data.suggestion) {
        setCurrentSuggestion(data.suggestion);
        setShowDialog(true);
      }
    } catch (error) {
      console.error('Error getting suggestion:', error);
      toast({
        title: "Error",
        description: "Failed to get reply suggestion",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleUseSuggestion = () => {
    if (currentSuggestion) {
      onSuggestion(currentSuggestion);
      setShowDialog(false);
      setCurrentSuggestion("");
    }
  };

  const handleFeedback = async (isPositive: boolean) => {
    try {
      await fetch(`/api/channels/${channelId}/suggestion-feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          suggestion: currentSuggestion,
          isPositive
        }),
        credentials: 'include'
      });
      toast({
        title: "Thank you!",
        description: "Your feedback helps improve suggestions",
        variant: "default"
      });
    } catch (error) {
      console.error('Error sending feedback:', error);
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleGetSuggestion}
        disabled={disabled || isLoading}
        title="Get AI reply suggestion"
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Lightbulb className="h-4 w-4" />
        )}
      </Button>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suggested Reply</DialogTitle>
            <DialogDescription>
              Here's a suggested reply based on your communication style:
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 p-4 bg-muted rounded-md">
            <p className="text-sm whitespace-pre-wrap">{currentSuggestion}</p>
          </div>
          <div className="flex justify-between items-center mt-4">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleFeedback(true)}
                className="w-10"
                title="This suggestion was helpful"
              >
                <ThumbsUp className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleFeedback(false)}
                className="w-10"
                title="This suggestion wasn't helpful"
              >
                <ThumbsDown className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowDialog(false)}>
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}