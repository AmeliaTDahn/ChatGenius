import { useState, useRef, useEffect } from "react";
import { SendHorizontal, Paperclip, X, Bold, Italic, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type MessageInputProps = {
  onSendMessage: (content: string, files?: File[]) => void;
};

type TextRange = {
  start: number;
  end: number;
  type: 'bold' | 'italic' | 'color';
  value?: string;
};

export function MessageInput({ onSendMessage }: MessageInputProps) {
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [formats, setFormats] = useState<TextRange[]>([]);
  const [currentFormat, setCurrentFormat] = useState<{
    bold: boolean;
    italic: boolean;
    color: string | null;
  }>({
    bold: false,
    italic: false,
    color: null
  });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "inherit";
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        200
      )}px`;
    }
  }, [message]);

  const applyFormat = (type: 'bold' | 'italic' | 'color', value?: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    if (start === end && type !== 'color') {
      setCurrentFormat(prev => ({
        ...prev,
        [type]: !prev[type]
      }));
      return;
    }

    // Add new format
    setFormats(prev => [
      ...prev,
      { start, end, type, value }
    ]);

    // Update current format state
    if (type === 'color') {
      setCurrentFormat(prev => ({ ...prev, color: value || null }));
    } else {
      setCurrentFormat(prev => ({ ...prev, [type]: !prev[type] }));
    }

    // Force textarea to update
    textarea.focus();
  };

  const getFormattedText = () => {
    let formattedMessage = message;
    // Apply formats in reverse order to maintain correct indices
    [...formats].reverse().forEach(format => {
      const before = formattedMessage.slice(0, format.start);
      const formatted = formattedMessage.slice(format.start, format.end);
      const after = formattedMessage.slice(format.end);

      switch (format.type) {
        case 'bold':
          formattedMessage = `${before}**${formatted}**${after}`;
          break;
        case 'italic':
          formattedMessage = `${before}*${formatted}*${after}`;
          break;
        case 'color':
          formattedMessage = `${before}[color=${format.value}]${formatted}[/color]${after}`;
          break;
      }
    });
    return formattedMessage;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() || files.length > 0) {
      const formattedMessage = getFormattedText();
      onSendMessage(formattedMessage, files);
      setMessage("");
      setFiles([]);
      setFormats([]);
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
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
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
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant={currentFormat.bold ? "secondary" : "ghost"}
            onClick={() => applyFormat('bold')}
          >
            <Bold className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant={currentFormat.italic ? "secondary" : "ghost"}
            onClick={() => applyFormat('italic')}
          >
            <Italic className="h-4 w-4" />
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant={currentFormat.color ? "secondary" : "ghost"}
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
                    onClick={() => applyFormat('color', color)}
                  />
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex-1 relative">
          <Textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className="min-h-[44px] max-h-[200px] resize-none pr-14"
            style={{
              fontWeight: currentFormat.bold ? 'bold' : 'normal',
              fontStyle: currentFormat.italic ? 'italic' : 'normal',
              color: currentFormat.color || 'inherit'
            }}
            rows={1}
          />
        </div>
        <Button type="submit" size="icon" disabled={!message.trim() && files.length === 0}>
          <SendHorizontal className="h-4 w-4" />
        </Button>
      </div>
    </form>
  );
}