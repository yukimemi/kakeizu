import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useIsAdmin } from "../data/access";
import type { Tree } from "../types";
import { birthdaysThisMonth } from "../lib/birthdays";
import type { Person } from "../types";

type Props = {
  onAddPerson: () => void;
  trees: Tree[];
  currentTreeId: string | null;
  onSelectTree: (id: string) => void;
  onCreateTree: () => void;
  onOpenSettings: () => void;
  onOpenImport: () => void;
  onOpenHistory: () => void;
  onOpenSearch: () => void;
  onOpenBirthdays: () => void;
  onOpenTimeline: () => void;
  onExportPng: () => void;
  onExportPdf: () => void;
  onOpenSelfPicker: () => void;
  showAge: boolean;
  onToggleShowAge: () => void;
  persons: Person[];
  canImport: boolean;
  canAddPerson: boolean;
  canSearch: boolean;
  canExport: boolean;
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
  onOpenSearch,
  onOpenBirthdays,
  onOpenTimeline,
  onExportPng,
  onExportPdf,
  onOpenSelfPicker,
  showAge,
  onToggleShowAge,
  persons,
  canImport,
  canAddPerson,
  canSearch,
  canExport,
}: Props) {
  const birthdayCount = birthdaysThisMonth(persons).length;
  const { user, logout } = useAuth();
  const { isAdmin } = useIsAdmin(user?.email);
  const [open, setOpen] = useState(false);
  const current = trees.find((t) => t.id === currentTreeId) ?? null;
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

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
      <div className="relative" ref={dropdownRef}>
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
                      onOpenTimeline();
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
                      <line x1="3" y1="6" x2="21" y2="6" />
                      <line x1="3" y1="12" x2="21" y2="12" />
                      <line x1="3" y1="18" x2="21" y2="18" />
                    </svg>
                    年表
                  </button>
                </li>
              )}
              {current && (
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      onOpenSelfPicker();
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
                      <circle cx="12" cy="8" r="4" />
                      <path d="M4 21c1-4 4-7 8-7s7 3 8 7" />
                    </svg>
                    自分を設定
                  </button>
                </li>
              )}
              {current && (
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      onToggleShowAge();
                      setOpen(false);
                    }}
                    role="menuitemcheckbox"
                    aria-checked={showAge}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-ink-soft transition hover:bg-washi-warm hover:text-ink"
                  >
                    <span
                      aria-hidden
                      className={`flex h-3.5 w-3.5 flex-none items-center justify-center rounded-sm border ${
                        showAge
                          ? "border-shu bg-shu text-paper"
                          : "border-ink-line bg-paper text-transparent"
                      }`}
                    >
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </span>
                    年齢を表示
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
              {current && canExport && (
                <li className="my-1.5 border-t border-ink-line" />
              )}
              {current && canExport && (
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      onExportPng();
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
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                    画像で書き出し (.png)
                  </button>
                </li>
              )}
              {current && canExport && (
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      onExportPdf();
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
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                    PDF で書き出し (.pdf)
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
        )}
      </div>

      {/* Search */}
      <button
        type="button"
        onClick={onOpenSearch}
        disabled={!canSearch}
        title="人物を検索"
        aria-label="人物を検索"
        className="flex h-8 w-8 items-center justify-center rounded-md border border-ink-line bg-white/60 text-ink-soft transition hover:border-ink/50 hover:text-ink disabled:opacity-40"
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
          aria-hidden
        >
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </button>

      {/* Birthdays this month */}
      {birthdayCount > 0 && (
        <button
          type="button"
          onClick={onOpenBirthdays}
          title={`今月の誕生日 (${birthdayCount} 人)`}
          aria-label={`今月の誕生日 ${birthdayCount} 人`}
          className="relative flex h-8 items-center gap-1 rounded-md border border-shu/30 bg-shu-soft/30 px-2 font-mincho text-xs tracking-wider2 text-shu-deep transition hover:border-shu/50 hover:bg-shu-soft/50"
        >
          <span className="text-sm font-semibold leading-none sm:hidden">
            誕
          </span>
          <span className="hidden sm:inline">
            {new Date().getMonth() + 1}月の誕生日
          </span>
          <span className="rounded-sm bg-shu px-1 py-0.5 text-[10px] font-semibold text-paper">
            {birthdayCount}
          </span>
        </button>
      )}

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
        {isAdmin && (
          <Link
            to="/admin"
            className="btn-line !py-1.5 text-xs sm:text-sm"
            title="管理画面"
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
              <path d="M12 1l3.09 6.26L22 8.27l-5 4.87 1.18 6.88L12 16.77l-6.18 3.25L7 13.14 2 8.27l6.91-1.01L12 1z" />
            </svg>
            <span className="hidden sm:inline">管理</span>
          </Link>
        )}
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
