import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Palette } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type ChannelThemeCustomizerProps = {
  channelId: number;
  currentTheme: {
    backgroundColor: string;
    messageBackgroundColor: string;
  };
};

export function ChannelThemeCustomizer({ channelId, currentTheme }: ChannelThemeCustomizerProps) {
  const [backgroundColor, setBackgroundColor] = useState(currentTheme.backgroundColor);
  const [messageBackgroundColor, setMessageBackgroundColor] = useState(currentTheme.messageBackgroundColor);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleSaveTheme = async () => {
    try {
      const response = await fetch(`/api/channels/${channelId}/theme`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          backgroundColor,
          messageBackgroundColor,
        }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      await queryClient.invalidateQueries({ queryKey: [`/api/channels/${channelId}`] });
      
      toast({
        title: "Theme Updated",
        description: "The channel theme has been updated successfully.",
      });
    } catch (error) {
      console.error("Failed to update theme:", error);
      toast({
        title: "Error",
        description: "Failed to update the channel theme. Please try again.",
        variant: "destructive",
      });
    }
  };

  const PREDEFINED_COLORS = [
    "#ffffff", // White
    "#f3f4f6", // Light Gray
    "#e5e7eb", // Gray
    "#dbeafe", // Light Blue
    "#f0fdf4", // Light Green
    "#fef2f2", // Light Red
    "#fdf4ff", // Light Purple
    "#fff7ed", // Light Orange
  ];

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon">
          <Palette className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Customize Channel Theme</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Channel Background</label>
            <div className="grid grid-cols-8 gap-2">
              {PREDEFINED_COLORS.map((color) => (
                <button
                  key={`bg-${color}`}
                  className={cn(
                    "w-6 h-6 rounded-full border",
                    backgroundColor === color && "ring-2 ring-primary"
                  )}
                  style={{ backgroundColor: color }}
                  onClick={() => setBackgroundColor(color)}
                />
              ))}
            </div>
            <input
              type="color"
              value={backgroundColor}
              onChange={(e) => setBackgroundColor(e.target.value)}
              className="mt-2"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Message Background</label>
            <div className="grid grid-cols-8 gap-2">
              {PREDEFINED_COLORS.map((color) => (
                <button
                  key={`msg-${color}`}
                  className={cn(
                    "w-6 h-6 rounded-full border",
                    messageBackgroundColor === color && "ring-2 ring-primary"
                  )}
                  style={{ backgroundColor: color }}
                  onClick={() => setMessageBackgroundColor(color)}
                />
              ))}
            </div>
            <input
              type="color"
              value={messageBackgroundColor}
              onChange={(e) => setMessageBackgroundColor(e.target.value)}
              className="mt-2"
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSaveTheme}>Save Theme</Button>
          </div>

          {/* Preview */}
          <Card>
            <CardContent className="pt-6">
              <div
                className="p-4 rounded-lg space-y-4"
                style={{ backgroundColor: backgroundColor }}
              >
                <div
                  className="p-3 rounded-lg max-w-[80%]"
                  style={{ backgroundColor: messageBackgroundColor }}
                >
                  <p className="text-sm">Preview message</p>
                </div>
                <div
                  className="p-3 rounded-lg max-w-[80%] ml-auto"
                  style={{ backgroundColor: messageBackgroundColor }}
                >
                  <p className="text-sm">Another preview message</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
