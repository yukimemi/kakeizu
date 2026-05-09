import { describe, expect, it } from "vitest";
import { findKinship } from "./kinship";
import type { Person, Relationship } from "../types";

const p = (
  id: string,
  gender?: "male" | "female",
  birthDate?: string,
): Person => ({
  id,
  treeId: "t",
  lastName: "山田",
  firstName: id,
  ...(gender ? { gender } : {}),
  ...(birthDate ? { birthDate } : {}),
});

const par = (from: string, to: string): Relationship => ({
  id: `${from}-${to}-p`,
  treeId: "t",
  type: "parent",
  from,
  to,
});
const sp = (a: string, b: string): Relationship => ({
  id: `${a}-${b}-s`,
  treeId: "t",
  type: "spouse",
  from: a,
  to: b,
});

describe("findKinship", () => {
  it("returns 自分 for the same person", () => {
    expect(findKinship("me", "me", [p("me")], [])).toBe("自分");
  });

  it("ancestors: 父 / 母 / 祖父 / 祖母 / 曾祖父", () => {
    const persons = [
      p("me"),
      p("father", "male"),
      p("mother", "female"),
      p("gpa", "male"),
      p("gma", "female"),
      p("ggpa", "male"),
    ];
    const rels = [
      par("father", "me"),
      par("mother", "me"),
      par("gpa", "father"),
      par("gma", "father"),
      par("ggpa", "gpa"),
    ];
    expect(findKinship("me", "father", persons, rels)).toBe("父");
    expect(findKinship("me", "mother", persons, rels)).toBe("母");
    expect(findKinship("me", "gpa", persons, rels)).toBe("祖父");
    expect(findKinship("me", "gma", persons, rels)).toBe("祖母");
    expect(findKinship("me", "ggpa", persons, rels)).toBe("曾祖父");
  });

  it("descendants: 息子 / 娘 / 孫 / 曾孫", () => {
    const persons = [
      p("me"),
      p("son", "male"),
      p("daughter", "female"),
      p("grandson", "male"),
      p("greatgrandson", "male"),
    ];
    const rels = [
      par("me", "son"),
      par("me", "daughter"),
      par("son", "grandson"),
      par("grandson", "greatgrandson"),
    ];
    expect(findKinship("me", "son", persons, rels)).toBe("息子");
    expect(findKinship("me", "daughter", persons, rels)).toBe("娘");
    expect(findKinship("me", "grandson", persons, rels)).toBe("孫");
    expect(findKinship("me", "greatgrandson", persons, rels)).toBe("曾孫");
  });

  it("siblings: 兄 / 弟 / 姉 / 妹 by gender + birth-date order", () => {
    const persons = [
      p("dad"),
      p("me", "male", "2000-06-15"),
      p("brotherOlder", "male", "1995-01-01"),
      p("brotherYounger", "male", "2005-01-01"),
      p("sisterOlder", "female", "1990-01-01"),
      p("sisterYounger", "female", "2010-01-01"),
    ];
    const rels = [
      par("dad", "me"),
      par("dad", "brotherOlder"),
      par("dad", "brotherYounger"),
      par("dad", "sisterOlder"),
      par("dad", "sisterYounger"),
    ];
    expect(findKinship("me", "brotherOlder", persons, rels)).toBe("兄");
    expect(findKinship("me", "brotherYounger", persons, rels)).toBe("弟");
    expect(findKinship("me", "sisterOlder", persons, rels)).toBe("姉");
    expect(findKinship("me", "sisterYounger", persons, rels)).toBe("妹");
  });

  it("falls back to きょうだい when birthDate or gender are unknown", () => {
    const persons = [p("dad"), p("me"), p("sib")];
    const rels = [par("dad", "me"), par("dad", "sib")];
    expect(findKinship("me", "sib", persons, rels)).toBe("きょうだい");
  });

  it("spouse → 配偶者", () => {
    const persons = [p("me"), p("partner", "female")];
    expect(findKinship("me", "partner", persons, [sp("me", "partner")])).toBe(
      "配偶者",
    );
  });

  it("spouse's parent → 義父 / 義母", () => {
    const persons = [
      p("me"),
      p("partner", "female"),
      p("father_in_law", "male"),
      p("mother_in_law", "female"),
    ];
    const rels = [
      sp("me", "partner"),
      par("father_in_law", "partner"),
      par("mother_in_law", "partner"),
    ];
    expect(findKinship("me", "father_in_law", persons, rels)).toBe("義父");
    expect(findKinship("me", "mother_in_law", persons, rels)).toBe("義母");
  });

  it("uncle / aunt: parent's sibling → おじ / おば", () => {
    const persons = [
      p("gpa"),
      p("father", "male"),
      p("uncle", "male"),
      p("aunt", "female"),
      p("me"),
    ];
    const rels = [
      par("gpa", "father"),
      par("gpa", "uncle"),
      par("gpa", "aunt"),
      par("father", "me"),
    ];
    expect(findKinship("me", "uncle", persons, rels)).toBe("おじ");
    expect(findKinship("me", "aunt", persons, rels)).toBe("おば");
  });

  it("niece / nephew: sibling's child → 甥 / 姪", () => {
    const persons = [
      p("dad"),
      p("me"),
      p("sib"),
      p("nephew", "male"),
      p("niece", "female"),
    ];
    const rels = [
      par("dad", "me"),
      par("dad", "sib"),
      par("sib", "nephew"),
      par("sib", "niece"),
    ];
    expect(findKinship("me", "nephew", persons, rels)).toBe("甥");
    expect(findKinship("me", "niece", persons, rels)).toBe("姪");
  });

  it("cousin: parent's sibling's child → いとこ", () => {
    const persons = [
      p("gpa"),
      p("father"),
      p("uncle"),
      p("me"),
      p("cousin", "male"),
    ];
    const rels = [
      par("gpa", "father"),
      par("gpa", "uncle"),
      par("father", "me"),
      par("uncle", "cousin"),
    ];
    expect(findKinship("me", "cousin", persons, rels)).toBe("いとこ");
  });

  it("returns null for unrelated persons", () => {
    expect(
      findKinship(
        "me",
        "stranger",
        [p("me"), p("stranger")],
        [],
      ),
    ).toBeNull();
  });

  it("falls back to 親戚 for in-laws beyond the named cases", () => {
    // self → spouse → spouse's parent → spouse's parent's parent
    const persons = [
      p("me"),
      p("partner"),
      p("partnerParent"),
      p("partnerGparent"),
    ];
    const rels = [
      sp("me", "partner"),
      par("partnerParent", "partner"),
      par("partnerGparent", "partnerParent"),
    ];
    expect(findKinship("me", "partnerGparent", persons, rels)).toBe("親戚");
  });
});
