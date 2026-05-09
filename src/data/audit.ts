import type {
  AuditEvent,
  AuditEventInput,
  Person,
  Relationship,
  RelationshipType,
  RevertPlan,
} from "../types";

export type Actor = { uid: string; email?: string; name?: string };

// ---------- soft-delete helpers ----------

export function isActive<T extends { deletedAt?: number }>(
  record: T | null | undefined,
): record is T {
  return !!record && record.deletedAt == null;
}

export function filterActive<T extends { deletedAt?: number }>(
  records: T[],
): T[] {
  return records.filter((r) => r.deletedAt == null);
}

// ---------- snapshot helpers ----------

// Person fields included in audit snapshots and considered for diff. Skips
// id / treeId / position / timestamps / soft-delete bookkeeping.
const PERSON_FIELDS = [
  "lastName",
  "firstName",
  "lastNameKana",
  "firstNameKana",
  "birthDate",
  "gender",
  "photoUrl",
  "photoTransform",
  "postalCode",
  "address",
  "phones",
  "emails",
  "socials",
  "memo",
  "phone",
  "email",
  "sns",
] as const;

const FIELD_LABEL_JA: Record<string, string> = {
  lastName: "姓",
  firstName: "名",
  lastNameKana: "姓ふりがな",
  firstNameKana: "名ふりがな",
  birthDate: "生年月日",
  gender: "性別",
  photoUrl: "写真",
  photoTransform: "写真の表示",
  postalCode: "郵便番号",
  address: "住所",
  phones: "電話番号",
  emails: "メール",
  socials: "SNS",
  memo: "メモ",
  phone: "電話番号",
  email: "メール",
  sns: "SNS",
};

const norm = (v: unknown) => (v == null || v === "" ? undefined : v);

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  return ka.every((k) =>
    deepEqual(
      (a as Record<string, unknown>)[k],
      (b as Record<string, unknown>)[k],
    ),
  );
}

export function diffPersonFields(before: Person, after: Person): string[] {
  const diffs: string[] = [];
  for (const f of PERSON_FIELDS) {
    const bv = norm((before as unknown as Record<string, unknown>)[f]);
    const av = norm((after as unknown as Record<string, unknown>)[f]);
    if (typeof bv === "object" || typeof av === "object") {
      if (!deepEqual(bv, av)) diffs.push(f);
    } else if (bv !== av) {
      diffs.push(f);
    }
  }
  return diffs;
}

function personSnapshot(p: Person): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of PERSON_FIELDS) {
    const v = (p as unknown as Record<string, unknown>)[f];
    if (v !== undefined && v !== "") out[f] = v;
  }
  return out;
}

function relationshipSnapshot(
  r: Relationship,
  fromName: string,
  toName: string,
): Record<string, unknown> {
  return {
    type: r.type,
    from: r.from,
    to: r.to,
    fromName,
    toName,
  };
}

// Snapshot used inside person-delete events to describe each relationship
// that was deleted alongside the person.
export type RelatedRelationshipSnapshot = {
  id: string;
  type: RelationshipType;
  from: string;
  to: string;
  fromName: string;
  toName: string;
};

const personDisplayName = (snap: Record<string, unknown> | undefined): string => {
  if (!snap) return "";
  const last = (snap.lastName as string | undefined) ?? "";
  const first = (snap.firstName as string | undefined) ?? "";
  return `${last} ${first}`.trim();
};

// ---------- summary formatter ----------

type SummaryInput = {
  type: AuditEvent["type"];
  targetType: AuditEvent["targetType"];
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
};

const relationshipKindLabel = (t: RelationshipType): string =>
  t === "spouse" ? "婚姻関係" : "親子関係";

export function summarizeEvent(input: SummaryInput): string {
  const { type, targetType, before, after } = input;
  if (targetType === "person") {
    const name =
      personDisplayName(after) || personDisplayName(before) || "(名前なし)";
    if (type === "create") return `${name} を追加`;
    if (type === "delete") {
      const related = (before?.relatedRelationships as unknown[] | undefined) ?? [];
      if (related.length > 0) {
        return `${name} を削除 (関連 ${related.length} 件含む)`;
      }
      return `${name} を削除`;
    }
    if (type === "restore") return `${name} を復元`;
    if (type === "update") {
      if (before && after) {
        const changed: string[] = [];
        for (const f of PERSON_FIELDS) {
          const bv = norm(before[f]);
          const av = norm(after[f]);
          const equal =
            typeof bv === "object" || typeof av === "object"
              ? deepEqual(bv, av)
              : bv === av;
          if (!equal) changed.push(FIELD_LABEL_JA[f] ?? f);
        }
        if (changed.length === 0) return `${name} を編集`;
        if (changed.length <= 3) return `${name} を編集 (${changed.join("、")})`;
        return `${name} を編集 (${changed.slice(0, 3).join("、")} ほか ${
          changed.length - 3
        } 件)`;
      }
      return `${name} を編集`;
    }
  }

  if (targetType === "relationship") {
    const snap = before ?? after ?? {};
    const fromName = (snap.fromName as string | undefined) ?? "";
    const toName = (snap.toName as string | undefined) ?? "";
    const rt = (snap.type as RelationshipType | undefined) ?? "parent";
    const label = relationshipKindLabel(rt);
    const arrow = rt === "spouse" ? "⇔" : "→";
    const pair = `${fromName} ${arrow} ${toName}`;
    if (type === "create") return `${pair} の${label}を追加`;
    if (type === "delete") return `${pair} の${label}を削除`;
    if (type === "restore") return `${pair} の${label}を復元`;
    if (type === "update") return `${pair} の${label}を編集`;
  }

  return `${targetType} ${type}`;
}

// ---------- event builders ----------

const baseEvent = (
  treeId: string,
  actor: Actor,
  type: AuditEvent["type"],
  targetType: AuditEvent["targetType"],
  targetId: string,
): Pick<
  AuditEventInput,
  "treeId" | "actor" | "actorEmail" | "actorName" | "type" | "targetType" | "targetId"
> => ({
  treeId,
  actor: actor.uid,
  ...(actor.email ? { actorEmail: actor.email } : {}),
  ...(actor.name ? { actorName: actor.name } : {}),
  type,
  targetType,
  targetId,
});

export function buildPersonCreateEvent(args: {
  treeId: string;
  actor: Actor;
  person: Person;
}): AuditEventInput {
  const after = personSnapshot(args.person);
  const summary = summarizeEvent({
    type: "create",
    targetType: "person",
    after,
  });
  return {
    ...baseEvent(args.treeId, args.actor, "create", "person", args.person.id),
    after,
    summary,
  };
}

export function buildPersonUpdateEvent(args: {
  treeId: string;
  actor: Actor;
  before: Person;
  after: Person;
}): AuditEventInput {
  const before = personSnapshot(args.before);
  const after = personSnapshot(args.after);
  const summary = summarizeEvent({
    type: "update",
    targetType: "person",
    before,
    after,
  });
  return {
    ...baseEvent(args.treeId, args.actor, "update", "person", args.after.id),
    before,
    after,
    summary,
  };
}

export function buildPersonDeleteEvent(args: {
  treeId: string;
  actor: Actor;
  person: Person;
  relatedRelationships?: RelatedRelationshipSnapshot[];
}): AuditEventInput {
  const before = personSnapshot(args.person);
  if (args.relatedRelationships && args.relatedRelationships.length > 0) {
    before.relatedRelationships = args.relatedRelationships;
  }
  const summary = summarizeEvent({
    type: "delete",
    targetType: "person",
    before,
  });
  return {
    ...baseEvent(args.treeId, args.actor, "delete", "person", args.person.id),
    before,
    summary,
  };
}

export function buildRelationshipCreateEvent(args: {
  treeId: string;
  actor: Actor;
  relationship: Relationship;
  fromName: string;
  toName: string;
}): AuditEventInput {
  const after = relationshipSnapshot(
    args.relationship,
    args.fromName,
    args.toName,
  );
  const summary = summarizeEvent({
    type: "create",
    targetType: "relationship",
    after,
  });
  return {
    ...baseEvent(
      args.treeId,
      args.actor,
      "create",
      "relationship",
      args.relationship.id,
    ),
    after,
    summary,
  };
}

export function buildRelationshipDeleteEvent(args: {
  treeId: string;
  actor: Actor;
  relationship: Relationship;
  fromName: string;
  toName: string;
}): AuditEventInput {
  const before = relationshipSnapshot(
    args.relationship,
    args.fromName,
    args.toName,
  );
  const summary = summarizeEvent({
    type: "delete",
    targetType: "relationship",
    before,
  });
  return {
    ...baseEvent(
      args.treeId,
      args.actor,
      "delete",
      "relationship",
      args.relationship.id,
    ),
    before,
    summary,
  };
}

export function buildRestoreEvent(args: {
  treeId: string;
  actor: Actor;
  origEvent: AuditEvent;
}): AuditEventInput {
  const { origEvent } = args;
  // Restore re-uses the original `before` snapshot (the state to restore to)
  // as `after` so the history list shows the same identity for the restored
  // record.
  const after = origEvent.before;
  const summary = summarizeEvent({
    type: "restore",
    targetType: origEvent.targetType,
    after,
  });
  return {
    ...baseEvent(
      args.treeId,
      args.actor,
      "restore",
      origEvent.targetType,
      origEvent.targetId,
    ),
    ...(after ? { after } : {}),
    summary,
    revertOfId: origEvent.id,
  };
}

// ---------- revert planning ----------

export function computeRevertPlan(e: AuditEvent): RevertPlan | null {
  if (e.type !== "delete") return null;
  if (e.targetType === "person") {
    const related = (e.before?.relatedRelationships as
      | RelatedRelationshipSnapshot[]
      | undefined) ?? [];
    return {
      kind: "restorePerson",
      personId: e.targetId,
      relationshipIds: related.map((r) => r.id),
    };
  }
  if (e.targetType === "relationship") {
    return { kind: "restoreRelationship", relationshipId: e.targetId };
  }
  return null;
}
