import { describe, expect, it } from "vitest";
import {
  buildPersonCreateEvent,
  buildPersonDeleteEvent,
  buildPersonUpdateEvent,
  buildRelationshipCreateEvent,
  buildRelationshipDeleteEvent,
  buildRevertEvent,
  collectRevertedIds,
  computeRevertPlan,
  diffPersonFields,
  filterActive,
  isActive,
  summarizeEvent,
} from "./audit";
import type { AuditEvent, Person, Relationship } from "../types";

const TREE = "t1";
const ACTOR = { uid: "u1", email: "u@example.com", name: "ユーザ" };

const person = (over: Partial<Person> = {}): Person => ({
  id: "p1",
  treeId: TREE,
  lastName: "山田",
  firstName: "太郎",
  ...over,
});

const rel = (over: Partial<Relationship> = {}): Relationship => ({
  id: "r1",
  treeId: TREE,
  type: "parent",
  from: "p1",
  to: "p2",
  ...over,
});

describe("isActive / filterActive", () => {
  it("treats records with no deletedAt as active", () => {
    expect(isActive(person())).toBe(true);
    expect(isActive(person({ deletedAt: undefined }))).toBe(true);
  });
  it("treats records with deletedAt set as inactive", () => {
    expect(isActive(person({ deletedAt: 123 }))).toBe(false);
  });
  it("filterActive drops soft-deleted records but keeps the rest", () => {
    const a = person({ id: "a" });
    const b = person({ id: "b", deletedAt: 100 });
    const c = person({ id: "c" });
    expect(filterActive([a, b, c]).map((p) => p.id)).toEqual(["a", "c"]);
  });
});

describe("diffPersonFields", () => {
  it("returns the field names that changed (scalars)", () => {
    const before = person({ address: "東京" });
    const after = person({ address: "大阪" });
    expect(diffPersonFields(before, after)).toEqual(["address"]);
  });
  it("treats undefined and empty string as equal", () => {
    const before = person({ memo: "" });
    const after = person({ memo: undefined });
    expect(diffPersonFields(before, after)).toEqual([]);
  });
  it("compares nested objects deeply (key-order independent)", () => {
    const before = person({
      photoTransform: { x: 0, y: 0, scale: 1 },
    });
    const after = person({
      photoTransform: { scale: 1, y: 0, x: 0 },
    });
    expect(diffPersonFields(before, after)).toEqual([]);
  });
  it("detects array changes (phones)", () => {
    const before = person({ phones: [{ value: "111" }] });
    const after = person({ phones: [{ value: "222" }] });
    expect(diffPersonFields(before, after)).toEqual(["phones"]);
  });
  it("ignores non-content fields (id, treeId, createdAt, updatedAt, deletedAt)", () => {
    const before = person({ createdAt: 1, updatedAt: 1 });
    const after = person({
      createdAt: 999,
      updatedAt: 999,
      deletedAt: 1000,
      deletedBy: "u",
    });
    expect(diffPersonFields(before, after)).toEqual([]);
  });
});

describe("buildPersonCreateEvent", () => {
  it("captures a person snapshot in `after` and produces a 追加 summary", () => {
    const e = buildPersonCreateEvent({
      treeId: TREE,
      actor: ACTOR,
      person: person({ lastName: "佐藤", firstName: "花子" }),
    });
    expect(e.type).toBe("create");
    expect(e.targetType).toBe("person");
    expect(e.targetId).toBe("p1");
    expect(e.actor).toBe("u1");
    expect(e.actorEmail).toBe("u@example.com");
    expect(e.actorName).toBe("ユーザ");
    expect(e.after).toMatchObject({ lastName: "佐藤", firstName: "花子" });
    expect((e.after as Record<string, unknown>).id).toBeUndefined();
    expect(e.before).toBeUndefined();
    expect(e.summary).toContain("佐藤");
    expect(e.summary).toContain("花子");
    expect(e.summary).toContain("追加");
  });
});

describe("buildPersonUpdateEvent", () => {
  it("captures before+after and lists changed Japanese field labels", () => {
    const before = person({ address: "東京" });
    const after = person({ address: "大阪", memo: "メモ" });
    const e = buildPersonUpdateEvent({
      treeId: TREE,
      actor: ACTOR,
      before,
      after,
    });
    expect(e.type).toBe("update");
    expect(e.targetType).toBe("person");
    expect(e.summary).toMatch(/編集|変更/);
    // Japanese labels appear in the summary
    expect(e.summary).toContain("住所");
    expect(e.summary).toContain("メモ");
  });
  it("falls back to a generic edited message if the diff is empty", () => {
    const p = person();
    const e = buildPersonUpdateEvent({
      treeId: TREE,
      actor: ACTOR,
      before: p,
      after: p,
    });
    expect(e.summary).toMatch(/編集|変更/);
  });
});

describe("buildPersonDeleteEvent", () => {
  it("captures the full person snapshot in `before` and a 削除 summary", () => {
    const e = buildPersonDeleteEvent({
      treeId: TREE,
      actor: ACTOR,
      person: person(),
    });
    expect(e.type).toBe("delete");
    expect(e.before).toMatchObject({ lastName: "山田", firstName: "太郎" });
    expect((e.before as Record<string, unknown>).id).toBeUndefined();
    expect(e.summary).toContain("山田");
    expect(e.summary).toContain("削除");
  });

  it("captures related-relationship snapshots so a single revert can restore both", () => {
    const e = buildPersonDeleteEvent({
      treeId: TREE,
      actor: ACTOR,
      person: person({ id: "child" }),
      relatedRelationships: [
        {
          id: "r1",
          type: "parent",
          from: "father",
          to: "child",
          fromName: "山田 父",
          toName: "山田 子",
        },
        {
          id: "r2",
          type: "parent",
          from: "mother",
          to: "child",
          fromName: "山田 母",
          toName: "山田 子",
        },
      ],
    });
    const before = e.before as Record<string, unknown>;
    expect(Array.isArray(before.relatedRelationships)).toBe(true);
    expect((before.relatedRelationships as unknown[]).length).toBe(2);
    expect(e.summary).toContain("関連");
  });
});

describe("buildRelationshipCreateEvent", () => {
  it("formats a parent relationship summary with names", () => {
    const e = buildRelationshipCreateEvent({
      treeId: TREE,
      actor: ACTOR,
      relationship: rel({ type: "parent" }),
      fromName: "山田 太郎",
      toName: "山田 一郎",
    });
    expect(e.type).toBe("create");
    expect(e.targetType).toBe("relationship");
    expect(e.summary).toContain("山田 太郎");
    expect(e.summary).toContain("山田 一郎");
    expect(e.summary).toMatch(/親子/);
  });
  it("formats a spouse relationship summary with names", () => {
    const e = buildRelationshipCreateEvent({
      treeId: TREE,
      actor: ACTOR,
      relationship: rel({ type: "spouse", from: "p1", to: "p2" }),
      fromName: "山田 太郎",
      toName: "山田 花子",
    });
    expect(e.summary).toMatch(/婚姻|配偶/);
    expect(e.summary).toContain("山田 太郎");
    expect(e.summary).toContain("山田 花子");
  });
});

describe("buildRelationshipDeleteEvent", () => {
  it("includes a 削除 summary and the relationship snapshot", () => {
    const e = buildRelationshipDeleteEvent({
      treeId: TREE,
      actor: ACTOR,
      relationship: rel({ type: "parent" }),
      fromName: "親",
      toName: "子",
    });
    expect(e.type).toBe("delete");
    expect(e.targetType).toBe("relationship");
    expect(e.before).toMatchObject({ type: "parent", from: "p1", to: "p2" });
    expect(e.summary).toContain("削除");
  });
});

describe("buildRevertEvent", () => {
  it("turns a delete event into a restore event", () => {
    const orig: AuditEvent = {
      id: "ev1",
      treeId: TREE,
      ts: 0,
      actor: "x",
      type: "delete",
      targetType: "person",
      targetId: "p1",
      before: { lastName: "山田", firstName: "太郎" },
      summary: "山田 太郎 を削除",
    };
    const e = buildRevertEvent({ treeId: TREE, actor: ACTOR, origEvent: orig });
    expect(e.type).toBe("restore");
    expect(e.revertOfId).toBe("ev1");
    expect(e.summary).toContain("復元");
    expect(e.summary).toContain("山田");
  });

  it("turns a create event into a delete event", () => {
    const orig: AuditEvent = {
      id: "ev2",
      treeId: TREE,
      ts: 0,
      actor: "x",
      type: "create",
      targetType: "person",
      targetId: "p1",
      after: { lastName: "佐藤", firstName: "花子" },
      summary: "佐藤 花子 を追加",
    };
    const e = buildRevertEvent({ treeId: TREE, actor: ACTOR, origEvent: orig });
    expect(e.type).toBe("delete");
    expect(e.revertOfId).toBe("ev2");
    expect(e.before).toMatchObject({ lastName: "佐藤", firstName: "花子" });
    expect(e.summary).toContain("削除");
  });

  it("turns an update event into an inverse update event", () => {
    const orig: AuditEvent = {
      id: "ev3",
      treeId: TREE,
      ts: 0,
      actor: "x",
      type: "update",
      targetType: "person",
      targetId: "p1",
      before: { lastName: "山田", firstName: "太郎", address: "東京" },
      after: { lastName: "山田", firstName: "太郎", address: "大阪" },
      summary: "山田 太郎 を編集 (住所)",
    };
    const e = buildRevertEvent({ treeId: TREE, actor: ACTOR, origEvent: orig });
    expect(e.type).toBe("update");
    expect(e.revertOfId).toBe("ev3");
    expect((e.before as Record<string, unknown>).address).toBe("大阪");
    expect((e.after as Record<string, unknown>).address).toBe("東京");
  });

  it("throws for restore events (cannot revert a revert)", () => {
    const orig: AuditEvent = {
      id: "ev4",
      treeId: TREE,
      ts: 0,
      actor: "x",
      type: "restore",
      targetType: "person",
      targetId: "p1",
      summary: "復元",
    };
    expect(() =>
      buildRevertEvent({ treeId: TREE, actor: ACTOR, origEvent: orig }),
    ).toThrow();
  });
});

describe("computeRevertPlan", () => {
  const baseEvent = (over: Partial<AuditEvent> = {}): AuditEvent => ({
    id: "ev",
    treeId: TREE,
    ts: 0,
    actor: "u",
    type: "delete",
    targetType: "person",
    targetId: "p1",
    summary: "",
    ...over,
  });

  it("returns restorePerson plan for a person delete event", () => {
    const plan = computeRevertPlan(baseEvent());
    expect(plan).toEqual({
      kind: "restorePerson",
      personId: "p1",
      relationshipIds: [],
    });
  });

  it("includes related relationship ids in the restorePerson plan", () => {
    const plan = computeRevertPlan(
      baseEvent({
        before: {
          lastName: "山田",
          firstName: "子",
          relatedRelationships: [
            { id: "r1", type: "parent", from: "p", to: "c" },
            { id: "r2", type: "parent", from: "m", to: "c" },
          ],
        },
      }),
    );
    expect(plan).toEqual({
      kind: "restorePerson",
      personId: "p1",
      relationshipIds: ["r1", "r2"],
    });
  });

  it("returns restoreRelationship plan for a relationship delete event", () => {
    const plan = computeRevertPlan(
      baseEvent({ targetType: "relationship", targetId: "r1" }),
    );
    expect(plan).toEqual({ kind: "restoreRelationship", relationshipId: "r1" });
  });

  it("returns softDeletePerson plan for a person create event", () => {
    const plan = computeRevertPlan(
      baseEvent({ type: "create", targetType: "person", targetId: "p1" }),
    );
    expect(plan).toEqual({ kind: "softDeletePerson", personId: "p1" });
  });

  it("returns softDeleteRelationship plan for a relationship create event", () => {
    const plan = computeRevertPlan(
      baseEvent({
        type: "create",
        targetType: "relationship",
        targetId: "r1",
      }),
    );
    expect(plan).toEqual({
      kind: "softDeleteRelationship",
      relationshipId: "r1",
    });
  });

  it("returns rollbackPersonUpdate with before-values for diffed fields", () => {
    const plan = computeRevertPlan(
      baseEvent({
        type: "update",
        targetType: "person",
        targetId: "p1",
        before: {
          lastName: "山田",
          firstName: "太郎",
          address: "東京",
        },
        after: {
          lastName: "山田",
          firstName: "太郎",
          address: "大阪",
          memo: "メモ",
        },
      }),
    );
    expect(plan).not.toBeNull();
    if (plan && plan.kind === "rollbackPersonUpdate") {
      expect(plan.personId).toBe("p1");
      // address was changed → before-value should be staged
      expect(plan.fields.address).toBe("東京");
      // memo was added in `after` → revert should clear it (undefined)
      expect("memo" in plan.fields).toBe(true);
      expect(plan.fields.memo).toBeUndefined();
      // lastName / firstName unchanged → not in plan
      expect("lastName" in plan.fields).toBe(false);
      expect("firstName" in plan.fields).toBe(false);
    } else {
      throw new Error("expected rollbackPersonUpdate plan");
    }
  });

  it("returns null for an update event with no diffed fields", () => {
    const plan = computeRevertPlan(
      baseEvent({
        type: "update",
        targetType: "person",
        before: { lastName: "A", firstName: "B" },
        after: { lastName: "A", firstName: "B" },
      }),
    );
    expect(plan).toBeNull();
  });

  it("returns null for restore events (those are themselves the result of a revert)", () => {
    expect(computeRevertPlan(baseEvent({ type: "restore" }))).toBeNull();
  });
});

describe("collectRevertedIds", () => {
  const ev = (id: string, revertOfId?: string): AuditEvent => ({
    id,
    treeId: TREE,
    ts: 0,
    actor: "u",
    type: "delete",
    targetType: "person",
    targetId: "p",
    summary: "",
    ...(revertOfId ? { revertOfId } : {}),
  });

  it("returns ids of events that another event has already reverted", () => {
    const events = [ev("a"), ev("b", "a"), ev("c")];
    expect(collectRevertedIds(events)).toEqual(new Set(["a"]));
  });

  it("returns an empty set when nothing has been reverted", () => {
    expect(collectRevertedIds([ev("a"), ev("b")])).toEqual(new Set());
  });

  it("ignores duplicate revertOfId entries", () => {
    const events = [ev("a"), ev("b", "a"), ev("c", "a")];
    expect(collectRevertedIds(events)).toEqual(new Set(["a"]));
  });
});

describe("summarizeEvent", () => {
  it("formats a person create event", () => {
    expect(
      summarizeEvent({
        type: "create",
        targetType: "person",
        after: { lastName: "山田", firstName: "太郎" },
      }),
    ).toContain("追加");
  });
  it("formats a relationship spouse create event", () => {
    const s = summarizeEvent({
      type: "create",
      targetType: "relationship",
      after: { type: "spouse", fromName: "A", toName: "B" },
    });
    expect(s).toContain("A");
    expect(s).toContain("B");
    expect(s).toMatch(/婚姻|配偶/);
  });
});
