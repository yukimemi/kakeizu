import { describe, expect, it } from "vitest";
import { diffPersons } from "./import";
import type { Person } from "../types";

const base = (overrides: Partial<Person> = {}): Person => ({
  id: "p",
  treeId: "t",
  lastName: "山田",
  firstName: "太郎",
  ...overrides,
});

describe("diffPersons", () => {
  it("returns empty array for identical persons", () => {
    const a = base();
    const b = base();
    expect(diffPersons(a, b)).toEqual([]);
  });

  it("detects scalar field changes", () => {
    const a = base({ birthDate: "2000-01-01" });
    const b = base({ birthDate: "2000-12-31" });
    expect(diffPersons(a, b)).toEqual(["birthDate"]);
  });

  it("detects multiple field changes", () => {
    const a = base({ address: "AAA", phone: "000-0000-0000" });
    const b = base({ address: "BBB", phone: "111-1111-1111" });
    expect(diffPersons(a, b).sort()).toEqual(["address", "phone"]);
  });

  it("treats undefined and empty string as equal", () => {
    const a = base({ memo: "" });
    const b = base({ memo: undefined });
    expect(diffPersons(a, b)).toEqual([]);
  });

  it("compares photoTransform deeply (key order independent)", () => {
    const a = base({ photoTransform: { x: 0, y: 0, scale: 1 } });
    // Same values, different key order — Firestore returns map fields with
    // alphabetized keys; this MUST NOT be treated as a diff.
    const b = base({
      photoTransform: { scale: 1, x: 0, y: 0 } as Person["photoTransform"],
    });
    expect(diffPersons(a, b)).toEqual([]);
  });

  it("detects photoTransform value changes", () => {
    const a = base({ photoTransform: { x: 0, y: 0, scale: 1 } });
    const b = base({ photoTransform: { x: 10, y: 0, scale: 1 } });
    expect(diffPersons(a, b)).toEqual(["photoTransform"]);
  });

  it("ignores non-syncable fields (id, treeId, position, importedFromId)", () => {
    const a = base({
      id: "src",
      treeId: "src-tree",
      position: { x: 0, y: 0 },
      importedFromId: undefined,
    });
    const b = base({
      id: "dst",
      treeId: "dst-tree",
      position: { x: 999, y: 999 },
      importedFromId: "src",
    });
    expect(diffPersons(a, b)).toEqual([]);
  });

  it("considers photoUrl change a diff", () => {
    const a = base({ photoUrl: "https://example.com/a.jpg" });
    const b = base({ photoUrl: "https://example.com/b.jpg" });
    expect(diffPersons(a, b)).toEqual(["photoUrl"]);
  });
});
