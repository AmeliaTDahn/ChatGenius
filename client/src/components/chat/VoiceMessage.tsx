import { useState, useRef } from 'react';
import { Mic, Square } from 'lucide-react';
import { Button } from "@/components/ui/button";

interface VoiceMessageProps {
  onSendVoice: (audioBlob: Blob) => void;
  disabled?: boolean;
}

export function VoiceMessage({ onSendVoice, disabled }: VoiceMessageProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        onSendVoice(audioBlob);
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
        // Reset recording time
        setRecordingTime(0);
      };

      mediaRecorder.start();
      setIsRecording(true);

      // Start timer
      timerRef.current = window.setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (error) {
      console.error('Error starting recording:', error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-2">
      {isRecording ? (
        <>
          <span className="text-sm text-muted-foreground animate-pulse">
            Recording {formatTime(recordingTime)}
          </span>
          <Button
            variant="destructive"
            size="icon"
            onClick={stopRecording}
            disabled={disabled}
          >
            <Square className="h-4 w-4" />
          </Button>
        </>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          onClick={startRecording}
          disabled={disabled}
        >
          <Mic className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}