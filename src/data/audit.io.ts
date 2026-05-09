import {
  addDoc,
  collection,
  deleteField,
  doc,
  getDoc,
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
  buildRestoreEvent,
  computeRevertPlan,
  type Actor,
} from "./audit";

const EVENTS_COL = "auditEvents";

// Internal: write an audit event document. Stamps `ts` server-side.
async function writeEvent(input: AuditEventInput): Promise<string> {
  const payload: Record<string, unknown> = { ...input, ts: serverTimestamp() };
  const ref = await addDoc(collection(db, EVENTS_COL), payload);
  return ref.id;
}

export async function logEvent(input: AuditEventInput): Promise<string> {
  return writeEvent(input);
}

// Subscribe to all audit events for a tree. Sort happens client-side so we
// don't need a composite index. Caps at `limit` newest entries.
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

/**
 * Revert a previously-recorded event by applying the reverse action and
 * writing a new "restore" audit entry that links back to the original.
 *
 * Phase 1: only delete events can be reverted (computeRevertPlan returns null
 * for create / update / restore).
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
      // The doc was hard-deleted somehow; recreate from the audit snapshot.
      const before = { ...(event.before ?? {}) };
      // relatedRelationships is metadata, not a Person field — strip it before
      // restoring the person doc.
      delete (before as Record<string, unknown>).relatedRelationships;
      batch.set(ref, {
        ...before,
        treeId: event.treeId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.update(ref, {
        deletedAt: deleteField() as unknown as FieldValue,
        deletedBy: deleteField() as unknown as FieldValue,
        updatedAt: serverTimestamp(),
      });
    }
    // Restore relationships that were soft-deleted alongside the person.
    for (const relId of plan.relationshipIds) {
      const relRef = doc(db, "relationships", relId);
      batch.update(relRef, {
        deletedAt: deleteField() as unknown as FieldValue,
        deletedBy: deleteField() as unknown as FieldValue,
      });
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
      await updateDoc(ref, {
        deletedAt: deleteField() as unknown as FieldValue,
        deletedBy: deleteField() as unknown as FieldValue,
      });
    }
  }

  await writeEvent(buildRestoreEvent({ treeId: event.treeId, actor, origEvent: event }));
}

