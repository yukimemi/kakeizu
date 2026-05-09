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
  "deathDate",
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
  deathDate: "没年月日",
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

/**
 * Produce the audit event that should be written when reverting `origEvent`.
 *
 *  - delete  → restore (with the deleted snapshot as `after`)
 *  - create  → delete  (with the created snapshot as `before`)
 *  - update  → update  (with `before`/`after` swapped)
 *
 * Always tagged with `revertOfId` so the history UI can pair them up.
 */
export function buildRevertEvent(args: {
  treeId: string;
  actor: Actor;
  origEvent: AuditEvent;
}): AuditEventInput {
  const { origEvent } = args;
  if (origEvent.type === "restore") {
    throw new Error("この操作は元に戻せません");
  }
  if (origEvent.type === "delete") {
    const after = origEvent.before;
    return {
      ...baseEvent(
        args.treeId,
        args.actor,
        "restore",
        origEvent.targetType,
        origEvent.targetId,
      ),
      ...(after ? { after } : {}),
      summary: summarizeEvent({
        type: "restore",
        targetType: origEvent.targetType,
        after,
      }),
      revertOfId: origEvent.id,
    };
  }
  if (origEvent.type === "create") {
    const before = origEvent.after;
    return {
      ...baseEvent(
        args.treeId,
        args.actor,
        "delete",
        origEvent.targetType,
        origEvent.targetId,
      ),
      ...(before ? { before } : {}),
      summary: summarizeEvent({
        type: "delete",
        targetType: origEvent.targetType,
        before,
      }),
      revertOfId: origEvent.id,
    };
  }
  // update → flipped update
  const before = origEvent.after;
  const after = origEvent.before;
  return {
    ...baseEvent(
      args.treeId,
      args.actor,
      "update",
      origEvent.targetType,
      origEvent.targetId,
    ),
    ...(before ? { before } : {}),
    ...(after ? { after } : {}),
    summary: summarizeEvent({
      type: "update",
      targetType: origEvent.targetType,
      before,
      after,
    }),
    revertOfId: origEvent.id,
  };
}

// Returns ids of events that another event has already reverted. Used by
// the history UI to grey out the "元に戻す" button on events that have
// already been undone — so a single create/delete can't be reverted twice.
export function collectRevertedIds(events: AuditEvent[]): Set<string> {
  const out = new Set<string>();
  for (const e of events) {
    if (e.revertOfId) out.add(e.revertOfId);
  }
  return out;
}

// ---------- revert planning ----------

export function computeRevertPlan(e: AuditEvent): RevertPlan | null {
  if (e.type === "delete") {
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
  }
  if (e.type === "create") {
    if (e.targetType === "person") {
      return { kind: "softDeletePerson", personId: e.targetId };
    }
    if (e.targetType === "relationship") {
      return { kind: "softDeleteRelationship", relationshipId: e.targetId };
    }
  }
  if (e.type === "update" && e.targetType === "person" && e.before && e.after) {
    const fields: Record<string, unknown> = {};
    for (const f of PERSON_FIELDS) {
      const bv = e.before[f];
      const av = e.after[f];
      const equal =
        typeof bv === "object" || typeof av === "object"
          ? deepEqual(norm(bv), norm(av))
          : norm(bv) === norm(av);
      if (!equal) {
        // Stage the before value. `undefined` here means "the field was
        // added in this update; clear it on revert".
        fields[f] = bv;
      }
    }
    if (Object.keys(fields).length === 0) return null;
    return { kind: "rollbackPersonUpdate", personId: e.targetId, fields };
  }
  return null;
}
