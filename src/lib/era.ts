// 和暦 (Japanese imperial era) helper.
//
// Each era's `start` is the first day on which the era was in effect.
// Year 1 of an era is rendered as 「元」 — e.g. 2019-05-01 is 令和元 (not 令和1).

type Era = {
  name: string;
  start: { y: number; m: number; d: number };
};

const ERAS: readonly Era[] = [
  { name: "令和", start: { y: 2019, m: 5, d: 1 } },
  { name: "平成", start: { y: 1989, m: 1, d: 8 } },
  { name: "昭和", start: { y: 1926, m: 12, d: 25 } },
  { name: "大正", start: { y: 1912, m: 7, d: 30 } },
  { name: "明治", start: { y: 1868, m: 9, d: 8 } },
];

const onOrAfter = (
  d: { y: number; m: number; d: number },
  s: { y: number; m: number; d: number },
): boolean => {
  if (d.y !== s.y) return d.y > s.y;
  if (d.m !== s.m) return d.m > s.m;
  return d.d >= s.d;
};

/**
 * Convert an ISO `YYYY-MM-DD` date into the imperial era it falls in,
 * along with the era year (1-indexed). `null` for unparseable dates or
 * dates before 明治.
 */
export function toJapaneseEra(
  dateStr: string,
): { name: string; year: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return null;
  const d = { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  for (const era of ERAS) {
    if (onOrAfter(d, era.start)) {
      return { name: era.name, year: d.y - era.start.y + 1 };
    }
  }
  return null;
}

/**
 * Stringify the era of an ISO date as `<name><year>` — e.g. `令和6`,
 * with year 1 rendered as 元 (e.g. `平成元`). `null` for pre-明治 /
 * unparseable inputs.
 */
export function formatEra(dateStr: string): string | null {
  const e = toJapaneseEra(dateStr);
  if (!e) return null;
  return `${e.name}${e.year === 1 ? "元" : e.year}`;
}
