import type { Person } from "../types";
import { computeAge } from "./age";

export type TimelineEvent = {
  date: string; // YYYY-MM-DD
  kind: "birth" | "death";
  personId: string;
  personName: string;
  // 享年 for death events when birthDate is also known.
  age?: number;
};

const fullName = (p: Person): string => `${p.lastName} ${p.firstName}`.trim();

/**
 * Flatten the persons list into a chronological event stream — one entry
 * per known birthDate or deathDate, sorted ascending.
 */
export function buildTimeline(persons: Person[]): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  for (const p of persons) {
    const name = fullName(p);
    if (p.birthDate) {
      events.push({
        date: p.birthDate,
        kind: "birth",
        personId: p.id,
        personName: name,
      });
    }
    if (p.deathDate) {
      const age = computeAge(p.birthDate, p.deathDate);
      events.push({
        date: p.deathDate,
        kind: "death",
        personId: p.id,
        personName: name,
        ...(age != null ? { age } : {}),
      });
    }
  }
  events.sort((a, b) => a.date.localeCompare(b.date));
  return events;
}
