import { useEffect, useMemo, useRef, useState } from "react";
import type { Person } from "../types";

type Props = {
  candidates: Person[];
  placeholder: string;
  onPick: (id: string) => void;
  emptyHint?: string;
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

export function PersonPicker({
  candidates,
  placeholder,
  onPick,
  emptyHint,
}: Props) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [open]);

  const filtered = useMemo(() => {
    const trimmed = q.trim().toLowerCase();
    if (!trimmed) return candidates;
    return candidates.filter((p) =>
      fields(p).some((f) => f.includes(trimmed)),
    );
  }, [candidates, q]);

  return (
    <div ref={ref} className="relative">
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="input w-full"
      />
      {open && (
        <ul
          className="absolute left-0 right-0 z-30 mt-1 max-h-60 overflow-y-auto rounded-md border border-ink-line bg-paper p-1 shadow-paper-lg"
          role="listbox"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-xs italic text-ink-faint">
              {emptyHint ?? "一致する人がいません"}
            </li>
          ) : (
            filtered.slice(0, 50).map((p) => {
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
                      setQ("");
                      setOpen(false);
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
      )}
    </div>
  );
}
