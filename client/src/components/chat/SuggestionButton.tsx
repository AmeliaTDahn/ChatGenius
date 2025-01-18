import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Lightbulb, Loader2, ThumbsUp, ThumbsDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface SuggestionButtonProps {
  channelId: number;
  onSuggestion: (suggestion: string) => void;
  disabled?: boolean;
  isMessageDirectedAtUser: boolean;
}

export function SuggestionButton({ channelId, onSuggestion, disabled, isMessageDirectedAtUser }: SuggestionButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [currentSuggestion, setCurrentSuggestion] = useState("");
  const [feedbackGiven, setFeedbackGiven] = useState<boolean | null>(null);
  const { toast } = useToast();

  const recordStyleFeedback = async (content: string, wasLiked: boolean) => {
    setFeedbackGiven(wasLiked);
    try {
      await fetch(`/api/channels/${channelId}/suggestion-feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          content, 
          wasAccepted: false,
          wasLiked,
          messageLength: content.length 
        }),
        credentials: 'include',
      });
    } catch (error) {
      console.error('Error recording style feedback:', error);
    }
  };

  const recordUsageFeedback = async (content: string, wasAccepted: boolean) => {
    try {
      await fetch(`/api/channels/${channelId}/suggestion-feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          content, 
          wasAccepted,
          messageLength: content.length 
        }),
        credentials: 'include',
      });
    } catch (error) {
      console.error('Error recording usage feedback:', error);
    }
  };

  const handleGetSuggestion = async () => {
    if (!isMessageDirectedAtUser) {
      toast({
        title: "Cannot generate suggestion",
        description: "This message is not directed at you",
        variant: "destructive",
      });
      return;
    }

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

  const handleUseSuggestion = async () => {
    if (currentSuggestion) {
      await recordUsageFeedback(currentSuggestion, true);
      onSuggestion(currentSuggestion);
      setShowDialog(false);
    }
  };

  const handleRejectSuggestion = async () => {
    if (currentSuggestion) {
      await recordUsageFeedback(currentSuggestion, false);
      setShowDialog(false);
    }
  };

  const handleQualityFeedback = async (wasLiked: boolean) => {
    if (currentSuggestion) {
      await recordStyleFeedback(currentSuggestion, wasLiked);
    }
  };

  const handleDialogChange = (open: boolean) => {
    setShowDialog(open);
    // Only clear suggestion when the dialog is explicitly closed via buttons
    // Not when it's dismissed by clicking outside or pressing ESC
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleGetSuggestion}
        disabled={disabled || isLoading || !isMessageDirectedAtUser}
        title="Get AI reply suggestion"
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Lightbulb className="h-4 w-4" />
        )}
      </Button>

      <Dialog open={showDialog} onOpenChange={handleDialogChange}>
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
          <DialogFooter className="mt-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleQualityFeedback(false)}
                  className={`hover:bg-destructive/10 ${feedbackGiven === false ? 'bg-destructive/10' : ''}`}
                  title="This style doesn't match my communication"
                >
                  <ThumbsDown className={`h-4 w-4 ${feedbackGiven === false ? 'text-destructive' : 'text-muted-foreground'}`} />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleQualityFeedback(true)}
                  className={`hover:bg-primary/10 ${feedbackGiven === true ? 'bg-primary/10' : ''}`}
                  title="This style matches my communication"
                >
                  <ThumbsUp className={`h-4 w-4 ${feedbackGiven === true ? 'text-primary' : 'text-muted-foreground'}`} />
                </Button>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleRejectSuggestion}>
                  Don't Use
                </Button>
                <Button onClick={handleUseSuggestion}>
                  Use This Reply
                </Button>
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}