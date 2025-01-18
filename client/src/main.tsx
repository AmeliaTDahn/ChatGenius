import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/lib/theme-provider";
import App from './App';
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="dark" storageKey="chat-theme">
      <QueryClientProvider client={queryClient}>
        <App />
        <Toaster position="top" />
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);