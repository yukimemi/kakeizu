import { describe, expect, it } from "vitest";
import { birthdaysThisMonth } from "./birthdays";
import type { Person } from "../types";

const p = (
  id: string,
  birthDate?: string,
  deathDate?: string,
): Person => ({
  id,
  treeId: "t",
  lastName: "山田",
  firstName: id,
  ...(birthDate ? { birthDate } : {}),
  ...(deathDate ? { deathDate } : {}),
});

describe("birthdaysThisMonth", () => {
  it("returns persons whose birth month matches the asOf month", () => {
    const persons = [
      p("a", "2000-05-15"),
      p("b", "1980-06-10"),
      p("c", "2010-05-30"),
    ];
    expect(birthdaysThisMonth(persons, "2025-05-10").map((x) => x.id)).toEqual([
      "a",
      "c",
    ]);
  });

  it("excludes deceased persons", () => {
    const persons = [p("a", "2000-05-15", "2020-01-01"), p("b", "1980-05-10")];
    expect(birthdaysThisMonth(persons, "2025-05-01").map((x) => x.id)).toEqual([
      "b",
    ]);
  });

  it("orders by day of month, ascending", () => {
    const persons = [
      p("a", "2000-05-30"),
      p("b", "1980-05-05"),
      p("c", "1990-05-15"),
    ];
    expect(birthdaysThisMonth(persons, "2025-05-01").map((x) => x.id)).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  it("returns empty when nobody was born this month", () => {
    expect(birthdaysThisMonth([p("a", "2000-01-15")], "2025-05-01")).toEqual(
      [],
    );
  });

  it("ignores persons without a birth date", () => {
    const persons = [p("a"), p("b", "2000-05-15")];
    expect(birthdaysThisMonth(persons, "2025-05-01").map((x) => x.id)).toEqual([
      "b",
    ]);
  });
});
