import { Switch, Route } from "wouter";
import { useUser } from "@/hooks/use-user";
import { Loader2 } from "lucide-react";
import AuthPage from "./pages/AuthPage";
import ChatPage from "./pages/ChatPage";
import SuggestedFriends from "./pages/suggested-friends";

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
      {/* Protected routes */}
      {user ? (
        <Switch>
          <Route path="/" component={ChatPage} />
          <Route path="/suggested-friends" component={SuggestedFriends} />
        </Switch>
      ) : (
        <AuthPage />
      )}
    </Switch>
  );
}

export default App;