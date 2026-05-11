import { describe, expect, it } from "vitest";
import { computeAge, formatLifespan } from "./age";

describe("computeAge", () => {
  it("returns the age as of the asOf date when birthday already passed", () => {
    expect(computeAge("2000-01-01", "2025-06-15")).toBe(25);
  });
  it("returns one less when birthday hasn't happened yet this year", () => {
    expect(computeAge("2000-12-31", "2025-06-15")).toBe(24);
  });
  it("counts today as +1 — the birthday-day flip from age N to age N+1 happens on the birthday itself, not the day after", () => {
    // Regression: BirthdaysDialog used to display `${age + 1}歳になります`
    // on the actual birthday day because it gated the "current age" branch on
    // `bDay < todayDay` (strict). computeAge already does the right thing here;
    // this pins that contract so the dialog can rely on it.
    expect(computeAge("1994-05-11", "2026-05-11")).toBe(32);
  });
  it("returns 0 for someone born in the same year as asOf, before that date", () => {
    expect(computeAge("2025-01-15", "2025-06-15")).toBe(0);
  });
  it("returns null when birthDate is missing", () => {
    expect(computeAge(undefined, "2025-06-15")).toBeNull();
  });
  it("returns null for an unparseable date", () => {
    expect(computeAge("不明", "2025-06-15")).toBeNull();
  });
  it("uses today when asOf is omitted", () => {
    const today = new Date();
    const tenYearsAgo = `${today.getFullYear() - 10}-01-01`;
    const age = computeAge(tenYearsAgo);
    // could be 9 or 10 depending on whether Jan 1 has passed; assert in range
    expect(age === 9 || age === 10).toBe(true);
  });
});

describe("formatLifespan", () => {
  it("formats living person with just birth date", () => {
    expect(formatLifespan("2000-01-01", undefined, "2025-06-15")).toBe(
      "2000-01-01 (25歳)",
    );
  });
  it("formats deceased person with both dates and 享年", () => {
    expect(formatLifespan("1950-04-10", "2020-08-20")).toBe(
      "1950-04-10 〜 2020-08-20 (享年70)",
    );
  });
  it("formats deceased person with only death date", () => {
    expect(formatLifespan(undefined, "2020-08-20")).toBe("没: 2020-08-20");
  });
  it("returns empty when neither date is present", () => {
    expect(formatLifespan(undefined, undefined)).toBe("");
  });
});
