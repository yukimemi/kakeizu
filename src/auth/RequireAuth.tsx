import type { ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { LoginPage } from "./LoginPage";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-pulse rounded-full bg-shu/30" />
          <div className="font-mincho text-xs tracking-widest2 text-ink-mute">
            読み込み中
          </div>
        </div>
      </div>
    );
  }
  if (!user) return <LoginPage />;
  return <>{children}</>;
}
