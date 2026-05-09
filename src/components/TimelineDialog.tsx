import { Fragment } from "react";
import type { Person } from "../types";
import { buildTimeline } from "../lib/timeline";
import { formatEra } from "../lib/era";

type Props = {
  persons: Person[];
  onPick: (id: string) => void;
  onClose: () => void;
};

export function TimelineDialog({ persons, onPick, onClose }: Props) {
  const events = buildTimeline(persons);

  return (
    <div
      className="absolute inset-0 z-40 flex items-stretch justify-center bg-ink/30 backdrop-blur-sm animate-fade-in sm:items-start sm:p-4 sm:pt-16"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full animate-fade-in-up flex-col overflow-hidden border border-ink-line bg-paper sm:h-auto sm:max-h-full sm:max-w-2xl sm:rounded-xl sm:shadow-paper-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-ink-line bg-washi-warm/50 px-5 py-4">
          <span className="seal h-7 w-7 rounded-sm font-mincho text-xs">暦</span>
          <h2 className="flex-1 font-mincho text-lg font-semibold tracking-wider text-ink">
            年表
            <span className="ml-2 text-[11px] font-normal text-ink-faint">
              ({events.length} 件)
            </span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-ink-mute transition hover:bg-washi hover:text-ink"
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

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {events.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-mute">
              生年月日や没年月日が登録されていません
            </p>
          ) : (
            <ol className="relative ml-3 border-l border-ink-line/60 pl-5">
              {events.map((e, i) => {
                const year = e.date.slice(0, 4);
                const prevYear = i > 0 ? events[i - 1].date.slice(0, 4) : null;
                const showYear = year !== prevYear;
                const md = e.date.slice(5);
                const dot =
                  e.kind === "birth" ? "bg-emerald-500/70" : "bg-shu/80";
                const label = e.kind === "birth" ? "誕生" : "没";
                return (
                  <Fragment key={`${e.personId}-${e.kind}-${e.date}`}>
                    {showYear && (
                      <li className="-ml-5 mb-2 mt-5 first:mt-0">
                        <h3 className="flex items-baseline gap-2 font-mincho text-base font-semibold tracking-wider text-ink">
                          <span>{year}年</span>
                          {(() => {
                            const era = formatEra(e.date);
                            return era ? (
                              <span className="text-xs font-normal tracking-wider2 text-ink-mute">
                                {era}年
                              </span>
                            ) : null;
                          })()}
                        </h3>
                      </li>
                    )}
                    <li className="relative mb-3">
                      <span
                        className={`absolute -left-[27px] top-2 h-2.5 w-2.5 rounded-full ring-2 ring-paper ${dot}`}
                        aria-hidden
                      />
                      <button
                        type="button"
                        onClick={() => {
                          onPick(e.personId);
                          onClose();
                        }}
                        className="flex w-full items-baseline gap-3 rounded-md px-2 py-1.5 text-left transition hover:bg-washi-warm/60"
                      >
                        <span className="flex-none font-mono text-[11px] tracking-wider text-ink-mute">
                          {md}
                        </span>
                        <span
                          className={`flex-none rounded-sm px-1.5 py-0.5 text-[10px] tracking-wider2 ${
                            e.kind === "birth"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-shu-soft/40 text-shu-deep"
                          }`}
                        >
                          {label}
                        </span>
                        <span className="flex-1 truncate font-mincho text-sm text-ink">
                          {e.personName}
                        </span>
                        {e.kind === "death" && e.age != null && (
                          <span className="flex-none text-[11px] text-ink-mute">
                            享年 {e.age}
                          </span>
                        )}
                      </button>
                    </li>
                  </Fragment>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
