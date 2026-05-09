// Age + lifespan helpers. Dates are ISO `YYYY-MM-DD` (Person.birthDate /
// Person.deathDate) so we work with plain string slicing rather than
// timezone-sensitive Date math where possible.

function parseISODate(s: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const da = Number(m[3]);
  if (mo < 1 || mo > 12 || da < 1 || da > 31) return null;
  return { y, m: mo, d: da };
}

function todayLocal(): { y: number; m: number; d: number } {
  const t = new Date();
  return { y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate() };
}

/**
 * Returns the age (満年齢) of a person born on `birthDate` as of `asOf`
 * (defaults to today). `null` if the birth date is missing or unparseable.
 */
export function computeAge(
  birthDate: string | undefined,
  asOf?: string,
): number | null {
  if (!birthDate) return null;
  const b = parseISODate(birthDate);
  if (!b) return null;
  const r = asOf ? parseISODate(asOf) : todayLocal();
  if (!r) return null;
  let age = r.y - b.y;
  if (r.m < b.m || (r.m === b.m && r.d < b.d)) age--;
  return age >= 0 ? age : null;
}

/**
 * Formats the life span string shown next to a person's name in the tree
 * node and history UI.
 *
 *  - alive:    `1950-04-10 (75歳)`
 *  - deceased: `1950-04-10 〜 2020-08-20 (享年70)`
 *  - unknown birth, known death: `没: 2020-08-20`
 *  - both unknown: empty string
 */
export function formatLifespan(
  birthDate: string | undefined,
  deathDate: string | undefined,
  asOf?: string,
): string {
  if (deathDate) {
    if (birthDate) {
      const age = computeAge(birthDate, deathDate);
      return age != null
        ? `${birthDate} 〜 ${deathDate} (享年${age})`
        : `${birthDate} 〜 ${deathDate}`;
    }
    return `没: ${deathDate}`;
  }
  if (birthDate) {
    const age = computeAge(birthDate, asOf);
    return age != null ? `${birthDate} (${age}歳)` : birthDate;
  }
  return "";
}
