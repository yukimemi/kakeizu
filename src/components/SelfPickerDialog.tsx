import { useMemo, useState } from "react";
import type { Person } from "../types";

type Props = {
  persons: Person[];
  currentSelfId: string | null;
  onPick: (id: string) => void;
  onClear: () => void;
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

export function SelfPickerDialog({
  persons,
  currentSelfId,
  onPick,
  onClear,
  onClose,
}: Props) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const trimmed = q.trim().toLowerCase();
    if (!trimmed) return persons.slice(0, 50);
    return persons.filter((p) => fields(p).some((f) => f.includes(trimmed)));
  }, [persons, q]);

  return (
    <div
      className="absolute inset-0 z-40 flex items-stretch justify-center bg-ink/30 backdrop-blur-sm animate-fade-in sm:items-start sm:p-4 sm:pt-20"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full animate-fade-in-up flex-col overflow-hidden border border-ink-line bg-paper sm:h-auto sm:max-h-full sm:max-w-md sm:rounded-xl sm:shadow-paper-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-ink-line bg-washi-warm/50 px-4 py-3">
          <span className="seal h-7 w-7 rounded-sm font-mincho text-xs">己</span>
          <h2 className="flex-1 font-mincho text-sm font-semibold tracking-wider text-ink">
            あなたを選ぶ
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-md text-ink-mute transition hover:bg-washi hover:text-ink"
            aria-label="閉じる"
          >
            <svg
              width="16"
              height="16"
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

        <p className="border-b border-ink-line/60 bg-washi-warm/30 px-4 py-2 text-[11px] leading-5 text-ink-mute">
          自分にあたる人物を選ぶと、各人物詳細に「あなたから見て：父」「いとこ」などの関係が表示されます。
        </p>

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
              const isCurrent = p.id === currentSelfId;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick(p.id);
                      onClose();
                    }}
                    className={`flex w-full items-center justify-between gap-2 rounded-sm px-3 py-2 text-left text-sm transition hover:bg-washi-warm ${
                      isCurrent ? "bg-shu-soft/30" : ""
                    }`}
                  >
                    <span className="truncate font-mincho text-ink">
                      {p.lastName} {p.firstName}
                    </span>
                    <span className="flex flex-none items-center gap-2">
                      {kana && (
                        <span className="truncate text-[10px] text-ink-mute">
                          {kana}
                        </span>
                      )}
                      {isCurrent && (
                        <span className="rounded-sm bg-shu-soft/60 px-1.5 py-0.5 text-[10px] tracking-wider2 text-shu-deep">
                          現在
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>

        {currentSelfId && (
          <div className="border-t border-ink-line bg-washi-warm/40 px-4 py-3">
            <button
              type="button"
              onClick={() => {
                onClear();
                onClose();
              }}
              className="inline-flex min-h-[36px] items-center rounded-md border border-ink-line bg-white/60 px-3 text-xs tracking-wider2 text-ink-mute transition hover:border-shu/40 hover:bg-shu-soft/15 hover:text-shu-deep"
            >
              「自分」の設定を解除
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
