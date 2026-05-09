import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteField,
  doc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../firebase";
import type { Person, Relationship } from "../types";
import {
  buildPersonCreateEvent,
  buildPersonDeleteEvent,
  buildPersonUpdateEvent,
  filterActive,
  type Actor,
  type RelatedRelationshipSnapshot,
} from "./audit";
import { logEvent } from "./audit.io";

const COL = "persons";

export function usePersons(treeId: string | undefined) {
  const [persons, setPersons] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!treeId) {
      setPersons([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(collection(db, COL), where("treeId", "==", treeId));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Person, "id">),
        }));
        // Hide soft-deleted persons; revert via the audit history dialog.
        setPersons(filterActive(docs));
        setLoading(false);
      },
      (err) => {
        console.error("[persons] subscription error", err);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [treeId]);

  return { persons, loading };
}

function clean<T extends Record<string, unknown>>(o: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v !== undefined && v !== "") out[k] = v;
  }
  return out as T;
}

export async function createPerson(
  treeId: string,
  data: Omit<Person, "id" | "treeId" | "createdAt" | "updatedAt">,
  options?: { actor?: Actor },
): Promise<string> {
  const ref = await addDoc(
    collection(db, COL),
    clean({
      ...data,
      treeId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );
  if (options?.actor) {
    const full: Person = { ...data, id: ref.id, treeId };
    await logEvent(
      buildPersonCreateEvent({ treeId, actor: options.actor, person: full }),
    );
  }
  return ref.id;
}

export async function updatePerson(
  id: string,
  data: Partial<Omit<Person, "id" | "treeId" | "createdAt">>,
  options?: { actor?: Actor; before?: Person },
): Promise<void> {
  const update: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    if (v === undefined || v === "") {
      update[k] = deleteField();
    } else {
      update[k] = v;
    }
  }
  update.updatedAt = serverTimestamp();
  await updateDoc(doc(db, COL, id), update);

  if (options?.actor && options?.before) {
    const after: Person = { ...options.before, ...data, id };
    await logEvent(
      buildPersonUpdateEvent({
        treeId: options.before.treeId,
        actor: options.actor,
        before: options.before,
        after,
      }),
    );
  }
}

/**
 * Soft-delete a person along with every relationship that touches them, in a
 * single batched write. The audit history records this as one event so a
 * single "元に戻す" click restores the person and all their connections.
 */
export async function softDeletePerson(
  person: Person,
  actor: Actor,
  relatedRelationships: Relationship[],
  nameOf: (id: string) => string,
): Promise<void> {
  const batch = writeBatch(db);
  for (const r of relatedRelationships) {
    batch.update(doc(db, "relationships", r.id), {
      deletedAt: serverTimestamp(),
      deletedBy: actor.uid,
    });
  }
  batch.update(doc(db, COL, person.id), {
    deletedAt: serverTimestamp(),
    deletedBy: actor.uid,
    updatedAt: serverTimestamp(),
  });
  await batch.commit();

  const related: RelatedRelationshipSnapshot[] = relatedRelationships.map(
    (r) => ({
      id: r.id,
      type: r.type,
      from: r.from,
      to: r.to,
      fromName: nameOf(r.from),
      toName: nameOf(r.to),
    }),
  );
  await logEvent(
    buildPersonDeleteEvent({
      treeId: person.treeId,
      actor,
      person,
      relatedRelationships: related,
    }),
  );
}
