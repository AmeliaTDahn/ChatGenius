import { useState, useRef, useEffect } from "react";
import { SendHorizontal, Paperclip, X, Bold, Italic, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { SuggestionButton } from "./SuggestionButton";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type MessageInputProps = {
  onSendMessage: (content: string, files?: File[], tabId?: string | null) => void;
  channelId?: number;
  disabled?: boolean;
  placeholder?: string;
};

export function MessageInput({ onSendMessage, channelId, disabled, placeholder }: MessageInputProps) {
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [currentFormat, setCurrentFormat] = useState<{
    bold: boolean;
    italic: boolean;
    color: string | null;
  }>({
    bold: false,
    italic: false,
    color: null
  });
  const [isUploading, setIsUploading] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleSuggestion = (suggestion: string) => {
    setMessage(suggestion);
    if (textareaRef.current) {
      textareaRef.current.focus();
      const length = suggestion.length;
      textareaRef.current.setSelectionRange(length, length);
      // Ensure the textarea height updates
      textareaRef.current.style.height = "inherit";
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        200
      )}px`;
      // Trigger a submit since we have a valid suggestion
      handleSubmit(new Event('submit') as unknown as React.FormEvent);
    }
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "inherit";
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        200
      )}px`;
    }
  }, [message]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() || files.length > 0) {
      try {
        setIsUploading(true);
        let finalMessage = message;

        // Apply formatting in reverse order to handle nested formats
        if (currentFormat.color) {
          finalMessage = `[color=${currentFormat.color}]${finalMessage}[/color]`;
        }
        if (currentFormat.italic) {
          finalMessage = `*${finalMessage}*`;
        }
        if (currentFormat.bold) {
          finalMessage = `**${finalMessage}**`;
        }

        await onSendMessage(finalMessage, files, localStorage.getItem('tabId'));
        setMessage("");
        setFiles([]);
        setCurrentFormat({
          bold: false,
          italic: false,
          color: null
        });
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to send message. Please try again.",
          variant: "destructive",
        });
      } finally {
        setIsUploading(false);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const maxFileSize = 5 * 1024 * 1024; // 5MB
      const newFiles = Array.from(e.target.files).filter(file => {
        if (file.size > maxFileSize) {
          toast({
            title: "File too large",
            description: `${file.name} exceeds the 5MB limit`,
            variant: "destructive"
          });
          return false;
        }
        return true;
      });

      setFiles(prev => [...prev, ...newFiles]);
      // Reset the input value so the same file can be selected again
      e.target.value = '';
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const toggleFormat = (type: 'bold' | 'italic' | 'color', value?: string) => {
    if (type === 'color') {
      setCurrentFormat(prev => ({
        ...prev,
        color: value === prev.color ? null : value
      }));
    } else {
      setCurrentFormat(prev => ({
        ...prev,
        [type]: !prev[type]
      }));
    }
    textareaRef.current?.focus();
  };

  const COLORS = [
    "#ef4444", // Red
    "#f97316", // Orange
    "#eab308", // Yellow
    "#22c55e", // Green
    "#3b82f6", // Blue
    "#8b5cf6", // Purple
    "#ec4899", // Pink
  ];

  return (
    <form onSubmit={handleSubmit} className="p-4 border-t">
      {files.length > 0 && (
        <ScrollArea className="max-h-32 mb-2">
          <div className="flex flex-wrap gap-2">
            {files.map((file, index) => (
              <div
                key={index}
                className="flex items-center gap-2 bg-secondary p-2 rounded-md"
              >
                <span className="text-sm truncate max-w-[200px]">{file.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4"
                  onClick={() => removeFile(index)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
      <div className="flex gap-2">
        <div className="flex items-center gap-1">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            className="hidden"
            multiple
            accept="image/*,application/pdf,.doc,.docx,.txt"
          />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || isUploading}
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant={currentFormat.bold ? "secondary" : "ghost"}
            onClick={() => toggleFormat('bold')}
            disabled={disabled}
          >
            <Bold className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant={currentFormat.italic ? "secondary" : "ghost"}
            onClick={() => toggleFormat('italic')}
            disabled={disabled}
          >
            <Italic className="h-4 w-4" />
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant={currentFormat.color ? "secondary" : "ghost"}
                disabled={disabled}
              >
                <Palette className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-2">
              <div className="flex gap-1">
                {COLORS.map((color) => (
                  <Button
                    key={color}
                    type="button"
                    size="icon"
                    variant="ghost"
                    className={cn(
                      "w-6 h-6 p-0",
                      currentFormat.color === color && "ring-2 ring-primary"
                    )}
                    style={{ backgroundColor: color }}
                    onClick={() => toggleFormat('color', color)}
                  />
                ))}
              </div>
            </PopoverContent>
          </Popover>
          {channelId && channelId !== -1 && (
            <SuggestionButton
              channelId={channelId}
              onSuggestion={handleSuggestion}
              disabled={disabled}
            />
          )}
        </div>
        <div className="flex-1 relative">
          <Textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder || "Type a message..."}
            className="min-h-[44px] max-h-[200px] resize-none pr-14"
            style={{
              fontWeight: currentFormat.bold ? 'bold' : 'normal',
              fontStyle: currentFormat.italic ? 'italic' : 'normal',
              color: currentFormat.color || 'inherit'
            }}
            disabled={disabled}
            rows={1}
          />
        </div>
        <Button type="submit" size="icon" disabled={(!message.trim() && files.length === 0) || isUploading || disabled}>
          <SendHorizontal className="h-4 w-4" />
        </Button>
      </div>
    </form>
  );
}