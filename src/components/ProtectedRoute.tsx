import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

interface ProtectedRouteProps {
  children: React.ReactNode;
  adminOnly?: boolean;
}

const ProtectedRoute = ({ children, adminOnly = false }: ProtectedRouteProps) => {
  const { user, isAdmin, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen gradient-hero flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (adminOnly && !isAdmin) {
    return (
      <div className="min-h-screen gradient-hero flex items-center justify-center px-4" dir="rtl">
        <div className="gradient-card border border-border rounded-2xl p-8 text-center max-w-md">
          <h2 className="font-display text-2xl text-destructive mb-4">אין הרשאה</h2>
          <p className="text-muted-foreground">רק מנהלים יכולים לגשת לדף זה.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
