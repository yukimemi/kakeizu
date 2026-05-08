import { useState } from "react";
import { useAuth } from "./AuthContext";

export function LoginPage() {
  const { signIn } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    setBusy(true);
    setError(null);
    try {
      await signIn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
      {/* Decorative ink wash in the corners */}
      <svg
        className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 text-ink-line/40"
        viewBox="0 0 200 200"
        fill="currentColor"
        aria-hidden
      >
        <circle cx="100" cy="100" r="100" />
      </svg>
      <svg
        className="pointer-events-none absolute -bottom-40 -right-40 h-[480px] w-[480px] text-shu/[0.04]"
        viewBox="0 0 200 200"
        fill="currentColor"
        aria-hidden
      >
        <circle cx="100" cy="100" r="100" />
      </svg>

      <div className="relative z-10 mx-4 w-[440px] max-w-[calc(100vw-2rem)] animate-fade-in-up">
        {/* Vertical accent column on the left */}
        <div className="flex">
          <div className="flex w-12 flex-col items-center pt-8">
            <span className="seal h-10 w-10 rounded-sm text-base">家</span>
            <span className="mt-3 h-32 w-px bg-ink-line" />
          </div>

          <div className="flex-1 pl-2">
            <div className="mb-1 text-[11px] font-medium uppercase tracking-widest2 text-ink-mute">
              Kakeizu &nbsp;·&nbsp; 系譜
            </div>
            <h1 className="font-mincho text-5xl font-semibold leading-none text-ink">
              家
              <span className="mx-0.5 text-shu">·</span>
              系
              <span className="mx-0.5 text-shu">·</span>
              図
            </h1>
            <p className="mt-6 max-w-sm font-mincho text-sm leading-7 tracking-wider2 text-ink-soft">
              代々を辿り、いまを記す。
              <br />
              あなたの家族の樹を、ここから。
            </p>
          </div>
        </div>

        <div className="mt-10 rounded-lg border border-ink-line bg-paper p-6 shadow-paper-lg">
          <button
            type="button"
            disabled={busy}
            onClick={onClick}
            className="group flex w-full items-center justify-center gap-3 rounded-md bg-ink px-4 py-3.5 text-sm font-medium tracking-wider2 text-washi-warm shadow-ink-soft transition hover:bg-ink-soft disabled:opacity-50"
          >
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
              <path
                fill="#FFC107"
                d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
              />
              <path
                fill="#FF3D00"
                d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34.6 6.1 29.6 4 24 4c-7.7 0-14.4 4.4-17.7 10.7z"
              />
              <path
                fill="#4CAF50"
                d="M24 44c5.5 0 10.4-2.1 14-5.5l-6.5-5.5C29.6 34.7 27 36 24 36c-5.3 0-9.7-3.4-11.3-8l-6.5 5C9.4 39.5 16.1 44 24 44z"
              />
              <path
                fill="#1976D2"
                d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.6l6.5 5.5C42.1 35.4 44 30 44 24c0-1.3-.1-2.4-.4-3.5z"
              />
            </svg>
            Google でサインイン
            <span className="ml-1 text-shu-glow opacity-0 transition group-hover:opacity-100">
              →
            </span>
          </button>

          {error && (
            <p className="mt-4 rounded border-l-2 border-shu bg-shu-soft/30 px-3 py-2 text-xs text-shu-deep">
              {error}
            </p>
          )}

          <p className="mt-5 text-center text-[11px] tracking-wider2 text-ink-faint">
            Google アカウントで認証 ·  個人情報は招待制で共有
          </p>
        </div>
      </div>
    </div>
  );
}
