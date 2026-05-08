import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  type User,
} from "firebase/auth";
import { auth, googleProvider } from "../firebase";
import { syncUserDoc } from "../data/users";
import { claimEmailInvites } from "../data/invites";

type AuthCtx = {
  user: User | null;
  loading: boolean;
  signIn: () => Promise<void>;
  logout: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log("[auth] AuthProvider mounted");
    // Pick up the result if we're coming back from a redirect-based sign-in.
    // No-op when there's no pending redirect.
    getRedirectResult(auth)
      .then((res) => {
        if (res) {
          console.log(
            "[auth] redirect result OK",
            res.user.email,
            res.user.uid,
          );
        } else {
          console.log("[auth] no pending redirect");
        }
      })
      .catch((e) => {
        console.error("[auth] redirect result error", e);
      });
    return onAuthStateChanged(auth, (u) => {
      console.log("[auth] state change", u ? `signed in: ${u.email}` : "signed out");
      setUser(u);
      setLoading(false);
      // Side effects on sign-in: keep users/{uid} fresh, and consume any
      // pending email-based invites so the user appears in the trees they
      // were invited to.
      if (u) {
        void syncUserDoc(u)
          .then(() => console.log("[users] sync ok"))
          .catch((e) => console.warn("[users] sync failed", e));
        void claimEmailInvites(u)
          .then((n) => console.log(`[invites] claim ok (${n} claimed)`))
          .catch((e) => console.warn("[invites] claim failed", e));
      }
    });
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({
      user,
      loading,
      signIn: async () => {
        console.log("[auth] signIn() start");
        // Try popup first — it's a smoother UX on desktop. If the browser or
        // the page's COOP blocks popups, fall back to redirect (more robust,
        // works everywhere including mobile).
        try {
          const res = await signInWithPopup(auth, googleProvider);
          console.log("[auth] popup sign-in success:", res.user.email);
        } catch (e) {
          const code = (e as { code?: string }).code ?? "";
          console.warn("[auth] popup sign-in failed:", code, e);
          if (
            code === "auth/popup-blocked" ||
            code === "auth/popup-closed-by-user" ||
            code === "auth/cancelled-popup-request" ||
            code === "auth/web-storage-unsupported"
          ) {
            console.log("[auth] falling back to redirect");
            await signInWithRedirect(auth, googleProvider);
            return;
          }
          throw e;
        }
      },
      logout: async () => {
        await signOut(auth);
      },
    }),
    [user, loading],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
