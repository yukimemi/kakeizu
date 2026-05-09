import type { Person } from "../types";
import { birthdaysThisMonth } from "../lib/birthdays";
import { computeAge } from "../lib/age";

type Props = {
  persons: Person[];
  onPick: (id: string) => void;
  onClose: () => void;
};

export function BirthdaysDialog({ persons, onPick, onClose }: Props) {
  const list = birthdaysThisMonth(persons);
  const month = new Date().getMonth() + 1;
  const today = new Date();
  const todayMonth = today.getMonth() + 1;
  const todayDay = today.getDate();
  const todayKey = `${todayMonth}-${todayDay}`;

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
          <span className="seal h-7 w-7 rounded-sm font-mincho text-xs">祝</span>
          <h2 className="flex-1 font-mincho text-sm font-semibold tracking-wider text-ink">
            {month}月の誕生日
            <span className="ml-2 text-[11px] font-normal text-ink-faint">
              ({list.length} 人)
            </span>
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

        <div className="flex-1 overflow-y-auto px-3 py-3">
          {list.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-mute">
              今月誕生日の人はいません
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {list.map((p) => {
                const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(p.birthDate ?? "");
                const bMonth = m ? Number(m[1]) : 0;
                const bDay = m ? Number(m[2]) : 0;
                const isToday = `${bMonth}-${bDay}` === todayKey;
                const age = computeAge(p.birthDate);
                const upcomingAge = age != null ? age + 1 : null;
                // If birthday has already passed this month, person is now `age`;
                // if upcoming, they will turn `age + 1`.
                const turning =
                  age != null
                    ? bDay < todayDay && bMonth === todayMonth
                      ? `${age}歳`
                      : `${upcomingAge}歳になります`
                    : null;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onPick(p.id);
                        onClose();
                      }}
                      className={`flex w-full items-center gap-3 rounded-md border border-ink-line/60 px-3 py-2 text-left transition hover:border-shu/40 hover:bg-shu-soft/15 ${
                        isToday ? "bg-shu-soft/30" : "bg-paper"
                      }`}
                    >
                      <div className="flex w-12 flex-none flex-col items-center font-mincho">
                        <span className="text-[10px] tracking-widest2 text-ink-mute">
                          {bMonth}月
                        </span>
                        <span className="text-base font-semibold leading-none text-ink">
                          {bDay}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-mincho text-sm text-ink">
                          {p.lastName} {p.firstName}
                        </div>
                        {turning && (
                          <div className="text-[11px] text-ink-mute">
                            {isToday ? "今日が誕生日 — " : ""}
                            {turning}
                          </div>
                        )}
                      </div>
                      {isToday && (
                        <span className="flex-none rounded-sm bg-shu-soft/60 px-1.5 py-0.5 text-[10px] tracking-wider2 text-shu-deep">
                          本日
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
