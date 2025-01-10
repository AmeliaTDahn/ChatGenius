import { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light";

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
};

type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  updateTheme: (config: {
    primary: string;
    appearance: "light" | "dark" | "system";
    variant: "professional" | "tint" | "vibrant";
    radius: number;
  }) => Promise<void>;
};

const initialState: ThemeProviderState = {
  theme: "dark",
  setTheme: () => null,
  updateTheme: async () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

export function ThemeProvider({
  children,
  defaultTheme = "light",
  storageKey = "vite-ui-theme",
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(storageKey) as Theme) || defaultTheme
  );

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
    localStorage.setItem(storageKey, theme);
  }, [theme, storageKey]);

  const updateTheme = async (config: {
    primary: string;
    appearance: "light" | "dark" | "system";
    variant: "professional" | "tint" | "vibrant";
    radius: number;
  }) => {
    try {
      await fetch("/api/theme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      // Update the theme mode if appearance changes
      if (config.appearance === "light" || config.appearance === "dark") {
        setTheme(config.appearance);
      }

      // Force reload to apply new theme
      window.location.reload();
    } catch (error) {
      console.error("Failed to update theme:", error);
      throw error;
    }
  };

  const value = {
    theme,
    setTheme: (theme: Theme) => setTheme(theme),
    updateTheme,
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);

  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider");

  return context;
};