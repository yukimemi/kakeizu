import { useMemo, useState } from "react";
import type { Person } from "../types";

type Props = {
  persons: Person[];
  onPick: (id: string) => void;
  onClose: () => void;
};

const fields = (p: Person): string[] =>
  [
    p.lastName,
    p.firstName,
    `${p.lastName}${p.firstName}`,
    `${p.lastName} ${p.firstName}`,
    p.lastNameKana,
    p.firstNameKana,
  ]
    .filter((s): s is string => !!s)
    .map((s) => s.toLowerCase());

export function SearchDialog({ persons, onPick, onClose }: Props) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const trimmed = q.trim().toLowerCase();
    if (!trimmed) return persons.slice(0, 50);
    return persons.filter((p) => fields(p).some((f) => f.includes(trimmed)));
  }, [persons, q]);

  return (
    <div
      className="absolute inset-0 z-40 flex items-start justify-center bg-ink/30 p-4 pt-20 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-full max-w-md animate-fade-in-up flex-col overflow-hidden rounded-xl border border-ink-line bg-paper shadow-paper-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-ink-line bg-washi-warm/50 px-4 py-3">
          <span className="seal h-7 w-7 rounded-sm font-mincho text-xs">索</span>
          <h2 className="flex-1 font-mincho text-sm font-semibold tracking-wider text-ink">
            人物を検索
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-ink-mute transition hover:bg-washi hover:text-ink"
            aria-label="閉じる"
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
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="border-b border-ink-line/60 px-3 py-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="姓名・ふりがなで検索"
            className="input w-full"
            autoFocus
          />
        </div>

        <ul className="flex-1 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <li className="px-3 py-6 text-center text-xs italic text-ink-faint">
              一致する人がいません
            </li>
          ) : (
            filtered.map((p) => {
              const kana =
                p.lastNameKana || p.firstNameKana
                  ? `${p.lastNameKana ?? ""} ${p.firstNameKana ?? ""}`.trim()
                  : null;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick(p.id);
                      onClose();
                    }}
                    className="flex w-full items-center justify-between gap-2 rounded-sm px-3 py-2 text-left text-sm transition hover:bg-washi-warm"
                  >
                    <span className="truncate font-mincho text-ink">
                      {p.lastName} {p.firstName}
                    </span>
                    {kana && (
                      <span className="flex-none truncate text-[10px] text-ink-mute">
                        {kana}
                      </span>
                    )}
                  </button>
                </li>
              );
            })
          )}
        </ul>

        <p className="border-t border-ink-line/60 bg-washi-warm/30 px-4 py-2 text-[11px] leading-5 text-ink-mute">
          選ぶと該当の人物にフォーカスして詳細パネルが開きます。
        </p>
      </div>
    </div>
  );
}
