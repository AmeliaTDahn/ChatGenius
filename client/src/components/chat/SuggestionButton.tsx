import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Lightbulb, Loader2, Copy, X } from "lucide-react";
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
      const response = await fetch(`/api/chat/suggest-reply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ channelId }),
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
          <DialogFooter className="flex justify-between items-center">
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              <X className="h-4 w-4 mr-2" />
              Decline
            </Button>
            <Button onClick={handleUseSuggestion}>
              <Copy className="h-4 w-4 mr-2" />
              Use This
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}