import { Switch, Route } from "wouter";
import { useUser } from "@/hooks/use-user";
import { Loader2 } from "lucide-react";
import AuthPage from "./pages/AuthPage";
import ChatPage from "./pages/ChatPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";

function App() {
  const { user, isLoading } = useUser();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Switch>
      {/* Public routes - accessible whether logged in or not */}
      <Route path="/reset-password" component={ResetPasswordPage} />

      {/* Protected routes - redirect to auth if not logged in */}
      <Route path="/">
        {user ? <ChatPage /> : <AuthPage />}
      </Route>

      {/* Catch all other routes */}
      <Route path="*">
        {user ? <ChatPage /> : <AuthPage />}
      </Route>
    </Switch>
  );
}

export default App;