import {
  addDoc,
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type FieldValue,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../firebase";
import type { AuditEvent, AuditEventInput } from "../types";
import {
  buildRevertEvent,
  computeRevertPlan,
  type Actor,
} from "./audit";

const EVENTS_COL = "auditEvents";

async function writeEvent(input: AuditEventInput): Promise<string> {
  const payload: Record<string, unknown> = { ...input, ts: serverTimestamp() };
  const ref = await addDoc(collection(db, EVENTS_COL), payload);
  return ref.id;
}

export async function logEvent(input: AuditEventInput): Promise<string> {
  return writeEvent(input);
}

export function useAuditEvents(treeId: string | undefined, limitN = 300) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!treeId) {
      setEvents([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(collection(db, EVENTS_COL), where("treeId", "==", treeId));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const docs: AuditEvent[] = snap.docs.map((d) => {
          const data = d.data() as Omit<AuditEvent, "id" | "ts"> & {
            ts?: { toMillis: () => number } | number;
          };
          const tsRaw = data.ts;
          const ts =
            typeof tsRaw === "number"
              ? tsRaw
              : tsRaw && typeof tsRaw === "object" && "toMillis" in tsRaw
                ? tsRaw.toMillis()
                : 0;
          return { ...(data as Omit<AuditEvent, "id">), id: d.id, ts };
        });
        docs.sort((a, b) => b.ts - a.ts);
        setEvents(docs.slice(0, limitN));
        setLoading(false);
      },
      (err) => {
        console.error("[audit] subscription error", err);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [treeId, limitN]);

  return { events, loading };
}

const cleared = (): { deletedAt: FieldValue; deletedBy: FieldValue } => ({
  deletedAt: deleteField() as unknown as FieldValue,
  deletedBy: deleteField() as unknown as FieldValue,
});

/**
 * Apply the inverse of a previously-recorded event and write a new audit
 * entry that links back to the original via `revertOfId`.
 */
export async function revertEvent(
  event: AuditEvent,
  actor: Actor,
): Promise<void> {
  const plan = computeRevertPlan(event);
  if (!plan) {
    throw new Error("この操作は元に戻せません");
  }

  if (plan.kind === "restorePerson") {
    const ref = doc(db, "persons", plan.personId);
    const snap = await getDoc(ref);
    const batch = writeBatch(db);
    if (!snap.exists()) {
      // Doc was hard-deleted somehow; recreate from the audit snapshot.
      const before = { ...(event.before ?? {}) };
      delete (before as Record<string, unknown>).relatedRelationships;
      batch.set(ref, {
        ...before,
        treeId: event.treeId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.update(ref, { ...cleared(), updatedAt: serverTimestamp() });
    }
    for (const relId of plan.relationshipIds) {
      batch.update(doc(db, "relationships", relId), cleared());
    }
    await batch.commit();
  } else if (plan.kind === "restoreRelationship") {
    const ref = doc(db, "relationships", plan.relationshipId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      const before = event.before ?? {};
      await setDoc(ref, {
        ...before,
        treeId: event.treeId,
        createdAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, cleared());
    }
  } else if (plan.kind === "softDeletePerson") {
    // Reverting a "create person" event = soft-delete the person now, plus
    // every active relationship that touches them, in a single batch.
    const personRef = doc(db, "persons", plan.personId);
    const psnap = await getDoc(personRef);
    if (!psnap.exists()) throw new Error("人物が見つかりません");

    const [a, b] = await Promise.all([
      getDocs(
        query(
          collection(db, "relationships"),
          where("treeId", "==", event.treeId),
          where("from", "==", plan.personId),
        ),
      ),
      getDocs(
        query(
          collection(db, "relationships"),
          where("treeId", "==", event.treeId),
          where("to", "==", plan.personId),
        ),
      ),
    ]);
    const seen = new Set<string>();
    const relIds: string[] = [];
    for (const d of [...a.docs, ...b.docs]) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      const data = d.data() as { deletedAt?: unknown };
      if (data.deletedAt != null) continue;
      relIds.push(d.id);
    }

    const batch = writeBatch(db);
    for (const id of relIds) {
      batch.update(doc(db, "relationships", id), {
        deletedAt: serverTimestamp(),
        deletedBy: actor.uid,
      });
    }
    batch.update(personRef, {
      deletedAt: serverTimestamp(),
      deletedBy: actor.uid,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } else if (plan.kind === "softDeleteRelationship") {
    await updateDoc(doc(db, "relationships", plan.relationshipId), {
      deletedAt: serverTimestamp(),
      deletedBy: actor.uid,
    });
  } else if (plan.kind === "rollbackPersonUpdate") {
    const update: Record<string, unknown> = { updatedAt: serverTimestamp() };
    for (const [k, v] of Object.entries(plan.fields)) {
      if (v === undefined) {
        update[k] = deleteField();
      } else {
        update[k] = v;
      }
    }
    await updateDoc(doc(db, "persons", plan.personId), update);
  }

  await writeEvent(buildRevertEvent({ treeId: event.treeId, actor, origEvent: event }));
}
