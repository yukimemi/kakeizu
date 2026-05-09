import { describe, expect, it } from "vitest";
import { buildTimeline } from "./timeline";
import type { Person } from "../types";

const p = (
  id: string,
  lastName: string,
  firstName: string,
  birthDate?: string,
  deathDate?: string,
): Person => ({
  id,
  treeId: "t",
  lastName,
  firstName,
  ...(birthDate ? { birthDate } : {}),
  ...(deathDate ? { deathDate } : {}),
});

describe("buildTimeline", () => {
  it("returns birth events with person info", () => {
    const events = buildTimeline([p("a", "山田", "太郎", "2000-01-15")]);
    expect(events).toEqual([
      {
        date: "2000-01-15",
        kind: "birth",
        personId: "a",
        personName: "山田 太郎",
      },
    ]);
  });

  it("returns death events with 享年 when birthDate is also set", () => {
    const events = buildTimeline([
      p("a", "山田", "太郎", "1900-01-01", "1980-05-10"),
    ]);
    const death = events.find((e) => e.kind === "death");
    expect(death).toMatchObject({
      kind: "death",
      personName: "山田 太郎",
      age: 80,
    });
  });

  it("returns death events without age when birthDate is missing", () => {
    const events = buildTimeline([p("a", "山田", "太郎", undefined, "1980-05-10")]);
    const death = events.find((e) => e.kind === "death");
    expect(death).toMatchObject({ kind: "death" });
    expect(death?.age).toBeUndefined();
  });

  it("sorts events ascending by date", () => {
    const events = buildTimeline([
      p("a", "山田", "太郎", "1900-01-01", "1980-05-10"),
      p("b", "山田", "次郎", "1920-06-15"),
    ]);
    expect(events.map((e) => e.date)).toEqual([
      "1900-01-01",
      "1920-06-15",
      "1980-05-10",
    ]);
  });

  it("ignores persons with no dates at all", () => {
    expect(buildTimeline([p("a", "山田", "太郎")])).toEqual([]);
  });
});
