import type { Person } from "../types";

/**
 * Returns living persons (no deathDate) whose birth month matches the
 * month of `asOf` (defaults to today). Sorted by day of month ascending.
 */
export function birthdaysThisMonth(
  persons: Person[],
  asOf?: string,
): Person[] {
  const reference = asOf ? new Date(asOf) : new Date();
  const month = reference.getMonth() + 1;
  const items: Array<{ p: Person; day: number }> = [];
  for (const p of persons) {
    if (!p.birthDate) continue;
    if (p.deathDate) continue;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(p.birthDate);
    if (!m) continue;
    const bMonth = Number(m[2]);
    const bDay = Number(m[3]);
    if (bMonth !== month) continue;
    items.push({ p, day: bDay });
  }
  items.sort((a, b) => a.day - b.day);
  return items.map(({ p }) => p);
}
