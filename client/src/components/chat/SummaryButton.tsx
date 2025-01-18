import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { FileText } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface SummaryButtonProps {
  channelId: number;
}

export function SummaryButton({ channelId }: SummaryButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();

  const generateSummary = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/channels/${channelId}/summary`, {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to generate summary');
      }

      const data = await response.json();
      setSummary(data.summary);
      setIsOpen(true);
    } catch (error) {
      console.error('Error generating summary:', error);
      toast({
        title: "Error",
        description: "Failed to generate conversation summary",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  }, [channelId, toast]);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={generateSummary}
        disabled={isLoading}
        className="gap-2"
      >
        <FileText className="h-4 w-4" />
        {isLoading ? "Generating..." : "Summary"}
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Conversation Summary</DialogTitle>
            <DialogDescription>
              Here's a summary of the conversation in this channel.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 text-sm text-muted-foreground whitespace-pre-wrap">
            {summary}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
