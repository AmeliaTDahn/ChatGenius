import { Switch, Route } from "wouter";
import { useUser } from "@/hooks/use-user";
import { Loader2 } from "lucide-react";
import AuthPage from "./pages/AuthPage";
import ChatPage from "./pages/ChatPage";
import ProfileSetupPage from "./pages/ProfileSetupPage";

function App() {
  const { user, isLoading } = useUser();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  // Check if user needs to complete profile setup
  if (!user.profile?.isProfileComplete) {
    return <ProfileSetupPage />;
  }

  return (
    <Switch>
      <Route path="/" component={ChatPage} />
      <Route component={ChatPage} />
    </Switch>
  );
}

export default App;