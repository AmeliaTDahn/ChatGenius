import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Volume2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface TextToSpeechButtonProps {
  messageId: number;
  disabled?: boolean;
}

export function TextToSpeechButton({ messageId, disabled }: TextToSpeechButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);

  const handleTextToSpeech = async () => {
    try {
      // If audio is already playing, stop it
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
        setAudio(null);
        return;
      }

      setIsLoading(true);
      const response = await fetch(`/api/messages/${messageId}/text-to-speech`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to generate speech');
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const newAudio = new Audio(audioUrl);
      
      newAudio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        setAudio(null);
      };
      
      setAudio(newAudio);
      newAudio.play();
    } catch (error) {
      console.error('Error generating speech:', error);
      toast({
        title: "Error",
        description: "Failed to generate speech",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleTextToSpeech}
      disabled={disabled || isLoading}
      title="Listen to AI reading this message"
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Volume2 className={`h-4 w-4 ${audio ? 'text-primary' : ''}`} />
      )}
    </Button>
  );
}
