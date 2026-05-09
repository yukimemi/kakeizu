import { useState } from "react";
import { useAuth } from "../auth/AuthContext";
import type { Tree } from "../types";

type Props = {
  onAddPerson: () => void;
  trees: Tree[];
  currentTreeId: string | null;
  onSelectTree: (id: string) => void;
  onCreateTree: () => void;
  onOpenSettings: () => void;
  onOpenImport: () => void;
  onOpenHistory: () => void;
  canImport: boolean;
  canAddPerson: boolean;
};

export function Toolbar({
  onAddPerson,
  trees,
  currentTreeId,
  onSelectTree,
  onCreateTree,
  onOpenSettings,
  onOpenImport,
  onOpenHistory,
  canImport,
  canAddPerson,
}: Props) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const current = trees.find((t) => t.id === currentTreeId) ?? null;

  return (
    <header className="z-10 flex h-14 flex-none items-center gap-3 border-b border-ink-line bg-paper/95 px-3 backdrop-blur-sm sm:px-5">
      {/* Brand mark */}
      <div className="flex items-center gap-2.5">
        <span className="seal h-7 w-7 rounded-sm text-xs font-semibold">家</span>
        <span className="hidden font-mincho text-xl font-semibold tracking-wider text-ink sm:inline">
          家系図
        </span>
      </div>

      <div className="h-6 w-px bg-ink-line" />

      {/* Tree selector */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex max-w-[160px] items-center gap-1.5 truncate rounded-md border border-ink-line bg-white/60 px-2.5 py-1.5 text-xs text-ink-soft transition hover:border-ink/50 hover:text-ink sm:max-w-[220px] sm:px-3 sm:text-sm"
          title={current?.name}
        >
          <span className="truncate font-mincho">{current?.name ?? "..."}</span>
          <span aria-hidden className="text-ink-faint">
            ▾
          </span>
        </button>
        {open && (
          <>
            <div
              className="fixed inset-0 z-30"
              onClick={() => setOpen(false)}
            />
            <ul
              className="absolute left-0 top-full z-40 mt-2 w-72 animate-fade-in rounded-lg border border-ink-line bg-paper p-1.5 shadow-paper-lg"
              role="menu"
            >
              {trees.map((t) => {
                const role = t.memberRoles?.[user?.uid ?? ""] ?? "editor";
                const roleLabel =
                  role === "owner"
                    ? "オーナー"
                    : role === "viewer"
                      ? "閲覧者"
                      : "編集者";
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelectTree(t.id);
                        setOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition ${
                        t.id === currentTreeId
                          ? "bg-shu-soft/40 text-shu-deep"
                          : "text-ink-soft hover:bg-washi-warm hover:text-ink"
                      }`}
                    >
                      <span className="flex items-center gap-2 truncate">
                        {t.id === currentTreeId && (
                          <span className="h-1.5 w-1.5 flex-none rounded-full bg-shu" />
                        )}
                        <span className="truncate font-mincho">{t.name}</span>
                      </span>
                      <span className="ml-2 flex-none text-[10px] tracking-wider2 text-ink-faint">
                        {roleLabel}
                      </span>
                    </button>
                  </li>
                );
              })}
              <li className="my-1.5 border-t border-ink-line" />
              <li>
                <button
                  type="button"
                  onClick={() => {
                    onCreateTree();
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-ink-soft transition hover:bg-washi-warm hover:text-ink"
                >
                  <span className="text-shu">＋</span>
                  新しい家系図を作成
                </button>
              </li>
              {current && canImport && (
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      onOpenImport();
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-ink-soft transition hover:bg-washi-warm hover:text-ink"
                  >
                    <span className="text-ink-mute">⇄</span>
                    他の家系図から人物をインポート
                  </button>
                </li>
              )}
              {current && (
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      onOpenHistory();
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-ink-soft transition hover:bg-washi-warm hover:text-ink"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-ink-mute"
                      aria-hidden
                    >
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    編集履歴
                  </button>
                </li>
              )}
              {current && (
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      onOpenSettings();
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-ink-soft transition hover:bg-washi-warm hover:text-ink"
                  >
                    <span className="text-ink-mute">⚙</span>
                    {current.name} の設定
                  </button>
                </li>
              )}
            </ul>
          </>
        )}
      </div>

      {/* Add person */}
      <button
        type="button"
        onClick={onAddPerson}
        disabled={!canAddPerson}
        className="btn-shu px-2.5 !py-1.5 text-xs sm:px-3.5 sm:!py-2 sm:text-sm"
        title="新しい人物を追加"
      >
        <span className="text-base leading-none sm:text-sm">＋</span>
        <span className="sm:hidden">人物</span>
        <span className="hidden sm:inline">新しい人物</span>
      </button>

      <div className="ml-auto flex items-center gap-2.5 sm:gap-3">
        {user?.photoURL && (
          <img
            src={user.photoURL}
            alt=""
            referrerPolicy="no-referrer"
            className="h-8 w-8 flex-none rounded-full ring-1 ring-ink-line"
          />
        )}
        <span className="hidden font-mincho text-sm text-ink-soft md:inline">
          {user?.displayName}
        </span>
        <button
          type="button"
          onClick={() => void logout()}
          className="btn-line !py-1.5 text-xs sm:text-sm"
          title="ログアウト"
          aria-label="ログアウト"
        >
          <svg
            className="h-4 w-4 sm:hidden"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          <span className="hidden sm:inline">ログアウト</span>
        </button>
      </div>
    </header>
  );
}
