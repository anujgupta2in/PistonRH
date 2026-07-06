import { Redirect } from "wouter";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  return <>{children}</>;
}

export function RequireRole({
  role,
  children,
}: {
  role: "vessel_officer" | "technical_office";
  children: React.ReactNode;
}) {
  const { user } = useAuth();

  if (user?.role !== role) {
    return <Redirect to="/" />;
  }

  return <>{children}</>;
}
