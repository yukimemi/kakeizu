import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { useIsAdmin } from "../data/access";

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { isAdmin, loading } = useIsAdmin(user?.email);
  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-pulse rounded-full bg-shu/30" />
          <div className="font-mincho text-xs tracking-widest2 text-ink-mute">
            権限を確認中
          </div>
        </div>
      </div>
    );
  }
  if (!isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}
