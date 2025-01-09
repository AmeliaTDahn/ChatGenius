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

  // Show reset password page regardless of auth status
  return (
    <Switch>
      <Route path="/reset-password" component={ResetPasswordPage} />
      {/* If not logged in, show auth page */}
      {!user ? (
        <Route path="*" component={AuthPage} />
      ) : (
        // If logged in, show chat page
        <Route path="*" component={ChatPage} />
      )}
    </Switch>
  );
}

export default App;