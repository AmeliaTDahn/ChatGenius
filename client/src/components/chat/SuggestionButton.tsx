
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Lightbulb, Loader2, X, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface SuggestionButtonProps {
  channelId: number;
  onSuggestion: (suggestion: string) => void;
  disabled?: boolean;
}

export function SuggestionButton({ channelId, onSuggestion, disabled }: SuggestionButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [currentSuggestion, setCurrentSuggestion] = useState("");
  const { toast } = useToast();

  const handleGetSuggestion = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/channels/${channelId}/suggest-reply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to get suggestion');
      }

      const data = await response.json();
      if (data.suggestion) {
        setCurrentSuggestion(data.suggestion);
        setShowPreview(true);
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

  const handleAccept = () => {
    if (currentSuggestion) {
      // Remove any formatting tags before setting the suggestion
      const plainText = currentSuggestion
        .replace(/\[color=#[0-9a-f]{6}\](.*?)\[\/color\]/gi, '$1')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1');
      onSuggestion(plainText);
      setShowPreview(false);
      setCurrentSuggestion("");
    }
  };

  const handleDecline = () => {
    setShowPreview(false);
    setCurrentSuggestion("");
  };

  return (
    <>
      {showPreview && (
        <div className="fixed top-0 left-0 right-0 bg-background/95 backdrop-blur-sm p-4 border-b shadow-lg z-50" style={{ marginTop: "var(--header-height, 64px)" }}>
          <div className="max-w-2xl mx-auto">
            <div className="flex justify-between items-start mb-2">
              <div>
                <h3 className="font-semibold">Suggested Reply</h3>
                <p className="text-sm text-muted-foreground">Here's a suggested reply based on the conversation:</p>
              </div>
              <Button variant="ghost" size="icon" onClick={handleDecline}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="bg-muted p-3 rounded-md mb-3">
              <p className="text-sm whitespace-pre-wrap">{currentSuggestion}</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={handleDecline}>
                <X className="h-4 w-4 mr-2" />
                Decline
              </Button>
              <Button size="sm" onClick={handleAccept}>
                <Check className="h-4 w-4 mr-2" />
                Accept
              </Button>
            </div>
          </div>
        </div>
      )}

      <Button
        variant="ghost"
        size="icon"
        onClick={handleGetSuggestion}
        disabled={disabled || isLoading}
        title="Get AI reply suggestion"
        className="hover:bg-accent hover:text-accent-foreground"
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Lightbulb className="h-4 w-4" />
        )}
      </Button>
    </>
  );
}
