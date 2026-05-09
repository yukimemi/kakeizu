import { describe, expect, it } from "vitest";
import {
  computeAutoLayout,
  NODE_HEIGHT,
  NODE_WIDTH,
} from "./treeLayout";
import type { Person, Relationship } from "../types";

const TID = "t";

function p(
  id: string,
  lastName: string,
  firstName: string,
  birthDate?: string,
): Person {
  return { id, treeId: TID, lastName, firstName, birthDate };
}

function parent(from: string, to: string, id = `${from}-${to}-p`): Relationship {
  return { id, treeId: TID, type: "parent", from, to };
}
function spouse(a: string, b: string, id = `${a}-${b}-s`): Relationship {
  return { id, treeId: TID, type: "spouse", from: a, to: b };
}

const center = (pos: { x: number; y: number }) => pos.x + NODE_WIDTH / 2;
const middleY = (pos: { x: number; y: number }) => pos.y + NODE_HEIGHT / 2;

describe("computeAutoLayout", () => {
  it("returns a position for every person", () => {
    const persons = [p("a", "山田", "太郎", "2000-01-01"), p("b", "山田", "花子", "2000-02-02")];
    const result = computeAutoLayout(persons, [spouse("a", "b")]);
    expect(Object.keys(result).sort()).toEqual(["a", "b"]);
  });

  it("places spouses on the same y rank", () => {
    const persons = [p("a", "山田", "太郎"), p("b", "山田", "花子")];
    const result = computeAutoLayout(persons, [spouse("a", "b")]);
    expect(result.a.y).toBe(result.b.y);
  });

  it("centers a single child directly under its parent couple", () => {
    const persons = [
      p("a", "山田", "太郎"),
      p("b", "山田", "花子"),
      p("c", "山田", "一郎", "2000-01-01"),
    ];
    const rels = [
      spouse("a", "b"),
      parent("a", "c"),
      parent("b", "c"),
    ];
    const r = computeAutoLayout(persons, rels);
    const coupleCenter = (Math.min(r.a.x, r.b.x) + Math.max(r.a.x, r.b.x) + NODE_WIDTH) / 2;
    expect(center(r.c)).toBe(coupleCenter);
    expect(r.c.y).toBeGreaterThan(r.a.y);
  });

  it("orders siblings by birth date (oldest left)", () => {
    const persons = [
      p("a", "山田", "太郎"),
      p("b", "山田", "花子"),
      p("y", "山田", "次郎", "2002-01-01"),
      p("x", "山田", "一郎", "2000-01-01"),
      p("z", "山田", "三郎", "2004-01-01"),
    ];
    const rels = [
      spouse("a", "b"),
      parent("a", "x"),
      parent("b", "x"),
      parent("a", "y"),
      parent("b", "y"),
      parent("a", "z"),
      parent("b", "z"),
    ];
    const r = computeAutoLayout(persons, rels);
    expect(r.x.x).toBeLessThan(r.y.x);
    expect(r.y.x).toBeLessThan(r.z.x);
  });

  it("centers the children block under the parent couple even with multiple kids", () => {
    const persons = [
      p("a", "山田", "太郎"),
      p("b", "山田", "花子"),
      p("c1", "山田", "長男", "2000-01-01"),
      p("c2", "山田", "次男", "2002-01-01"),
      p("c3", "山田", "三男", "2004-01-01"),
    ];
    const rels = [
      spouse("a", "b"),
      parent("a", "c1"),
      parent("b", "c1"),
      parent("a", "c2"),
      parent("b", "c2"),
      parent("a", "c3"),
      parent("b", "c3"),
    ];
    const r = computeAutoLayout(persons, rels);
    const coupleCenter = (Math.min(r.a.x, r.b.x) + Math.max(r.a.x, r.b.x) + NODE_WIDTH) / 2;
    const xs = ["c1", "c2", "c3"].map((id) => center(r[id]));
    const blockCenter = (Math.min(...xs) + Math.max(...xs)) / 2;
    expect(blockCenter).toBeCloseTo(coupleCenter, 5);
  });

  it("places both parent couples on the same top rank above the married couple", () => {
    // Family A has child A2. Family B has child B2. A2 marries B2.
    const persons = [
      p("a1", "佐藤", "父"),
      p("a2", "佐藤", "母"),
      p("b1", "鈴木", "父"),
      p("b2", "鈴木", "母"),
      p("ac", "佐藤", "息子", "2000-01-01"),
      p("bc", "鈴木", "娘", "2000-02-02"),
    ];
    const rels = [
      spouse("a1", "a2"),
      spouse("b1", "b2"),
      spouse("ac", "bc"),
      parent("a1", "ac"),
      parent("a2", "ac"),
      parent("b1", "bc"),
      parent("b2", "bc"),
    ];
    const r = computeAutoLayout(persons, rels);
    expect(r.a1.y).toBe(r.b1.y);
    expect(r.a2.y).toBe(r.b2.y);
    expect(r.ac.y).toBeGreaterThan(r.a1.y);
    expect(r.bc.y).toBeGreaterThan(r.b1.y);
    const aCenter = (Math.min(r.a1.x, r.a2.x) + Math.max(r.a1.x, r.a2.x) + NODE_WIDTH) / 2;
    const bCenter = (Math.min(r.b1.x, r.b2.x) + Math.max(r.b1.x, r.b2.x) + NODE_WIDTH) / 2;
    expect(Math.abs(bCenter - aCenter)).toBeGreaterThan(NODE_WIDTH);
  });

  it("ignores relationships pointing to non-existent persons", () => {
    const persons = [p("a", "山田", "太郎")];
    const rels = [parent("a", "ghost"), spouse("a", "ghost-2")];
    const r = computeAutoLayout(persons, rels);
    expect(Object.keys(r)).toEqual(["a"]);
    expect(r.a).toBeDefined();
  });

  it("returns an empty object for empty input", () => {
    expect(computeAutoLayout([], [])).toEqual({});
  });

  it("places a married-in spouse on their partner's generation", () => {
    const persons = [
      p("dad", "田中", "父"),
      p("mom", "田中", "母"),
      p("taro", "田中", "息子"),
      p("hanako", "田中", "嫁"),
    ];
    const rels = [
      spouse("dad", "mom"),
      parent("dad", "taro"),
      parent("mom", "taro"),
      spouse("taro", "hanako"),
    ];
    const r = computeAutoLayout(persons, rels);
    expect(r.taro.y).toBe(r.hanako.y);
    expect(middleY(r.dad)).toBeLessThan(middleY(r.taro));
  });
});
