import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Volume2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { VoiceFeedback } from "./VoiceFeedback";

interface TextToSpeechButtonProps {
  messageId: number;
  messageContent: string;
  disabled?: boolean;
}

export function TextToSpeechButton({ messageId, messageContent, disabled }: TextToSpeechButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const [currentVoiceSettings, setCurrentVoiceSettings] = useState<any>(null);
  const [showFeedback, setShowFeedback] = useState(false);

  const handleTextToSpeech = async () => {
    try {
      // If audio is already playing, stop it
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
        setAudio(null);
        setShowFeedback(false);
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

      // Get the voice settings from the response headers
      const voiceSettings = response.headers.get('X-Voice-Settings');
      if (voiceSettings) {
        setCurrentVoiceSettings(JSON.parse(voiceSettings));
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const newAudio = new Audio(audioUrl);

      newAudio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        setShowFeedback(true); // Show feedback when audio finishes playing
      };

      newAudio.onpause = () => {
        setShowFeedback(false); // Hide feedback when audio is stopped
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
    <div className="flex items-center gap-2">
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

      {showFeedback && currentVoiceSettings && (
        <VoiceFeedback
          messageContent={messageContent}
          voiceSettings={currentVoiceSettings}
          onFeedbackComplete={() => setShowFeedback(false)}
        />
      )}
    </div>
  );
}