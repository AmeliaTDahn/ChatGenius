import { useState } from "react";
import { useTheme } from "@/lib/theme-provider";
import { Button } from "./button";
import { Card, CardContent } from "./card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./dialog";
import { cn } from "@/lib/utils";

const COLOR_PALETTES = {
  default: {
    name: "Default",
    primary: "hsl(222.2 47.4% 11.2%)",
    background: "hsl(0 0% 100%)",
    foreground: "hsl(222.2 84% 4.9%)",
  },
  midnight: {
    name: "Midnight Blue",
    primary: "hsl(217 91% 60%)",
    background: "hsl(224 71% 4%)",
    foreground: "hsl(213 31% 91%)",
  },
  forest: {
    name: "Forest",
    primary: "hsl(142 71% 45%)",
    background: "hsl(144 10% 95%)",
    foreground: "hsl(142 72% 12%)",
  },
  sunset: {
    name: "Sunset",
    primary: "hsl(20 90% 50%)",
    background: "hsl(20 14% 96%)",
    foreground: "hsl(24 100% 5%)",
  },
  lavender: {
    name: "Lavender",
    primary: "hsl(262 83% 58%)",
    background: "hsl(260 10% 96%)",
    foreground: "hsl(262 83% 12%)",
  },
};

export function ThemeCustomizer() {
  const { theme, setTheme } = useTheme();
  const [selectedPalette, setSelectedPalette] = useState<string>("default");

  const handleSelectPalette = async (paletteKey: string) => {
    setSelectedPalette(paletteKey);
    const palette = COLOR_PALETTES[paletteKey as keyof typeof COLOR_PALETTES];
    
    // Update theme
    await fetch("/api/theme", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        primary: palette.primary,
        appearance: theme === "dark" ? "dark" : "light",
        variant: "professional",
        radius: 0.5,
      }),
    });

    // Force reload to apply new theme
    window.location.reload();
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">Customize Theme</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Choose Theme</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          {Object.entries(COLOR_PALETTES).map(([key, palette]) => (
            <Card
              key={key}
              className={cn(
                "relative cursor-pointer transition-all hover:scale-105",
                selectedPalette === key && "ring-2 ring-primary"
              )}
              onClick={() => handleSelectPalette(key)}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="flex gap-2">
                    <div
                      className="h-8 w-8 rounded-full"
                      style={{ backgroundColor: palette.primary }}
                    />
                    <div
                      className="h-8 w-8 rounded-full"
                      style={{ backgroundColor: palette.background }}
                    />
                    <div
                      className="h-8 w-8 rounded-full"
                      style={{ backgroundColor: palette.foreground }}
                    />
                  </div>
                  <span className="font-medium">{palette.name}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
