import { describe, expect, it } from "vitest";
import { formatEra, toJapaneseEra } from "./era";

describe("toJapaneseEra", () => {
  it("returns 令和 for dates on or after 2019-05-01", () => {
    expect(toJapaneseEra("2019-05-01")).toEqual({ name: "令和", year: 1 });
    expect(toJapaneseEra("2024-01-01")).toEqual({ name: "令和", year: 6 });
  });
  it("returns 平成 for the 1989-01-08 to 2019-04-30 window", () => {
    expect(toJapaneseEra("1989-01-08")).toEqual({ name: "平成", year: 1 });
    expect(toJapaneseEra("2019-04-30")).toEqual({ name: "平成", year: 31 });
    expect(toJapaneseEra("2000-12-31")).toEqual({ name: "平成", year: 12 });
  });
  it("returns 昭和 for dates before 1989-01-08", () => {
    expect(toJapaneseEra("1989-01-07")).toEqual({ name: "昭和", year: 64 });
    expect(toJapaneseEra("1926-12-25")).toEqual({ name: "昭和", year: 1 });
    expect(toJapaneseEra("1965-06-15")).toEqual({ name: "昭和", year: 40 });
  });
  it("returns 大正 for the 1912 - 1926 window", () => {
    expect(toJapaneseEra("1912-07-30")).toEqual({ name: "大正", year: 1 });
    expect(toJapaneseEra("1926-12-24")).toEqual({ name: "大正", year: 15 });
  });
  it("returns 明治 for the 1868 - 1912 window", () => {
    expect(toJapaneseEra("1868-09-08")).toEqual({ name: "明治", year: 1 });
    expect(toJapaneseEra("1912-07-29")).toEqual({ name: "明治", year: 45 });
  });
  it("returns null for dates before 明治", () => {
    expect(toJapaneseEra("1850-01-01")).toBeNull();
    expect(toJapaneseEra("1868-09-07")).toBeNull();
  });
  it("returns null for unparseable dates", () => {
    expect(toJapaneseEra("不明")).toBeNull();
    expect(toJapaneseEra("")).toBeNull();
  });
});

describe("formatEra", () => {
  it("uses 元 instead of 1 for the first year of an era", () => {
    expect(formatEra("2019-05-01")).toBe("令和元");
    expect(formatEra("1989-01-08")).toBe("平成元");
  });
  it("formats subsequent years numerically", () => {
    expect(formatEra("2024-01-01")).toBe("令和6");
    expect(formatEra("1985-06-15")).toBe("昭和60");
  });
  it("returns null for pre-Meiji dates", () => {
    expect(formatEra("1850-01-01")).toBeNull();
  });
});
