import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../firebase";
import type { Relationship, RelationshipType } from "../types";
import {
  buildRelationshipCreateEvent,
  buildRelationshipDeleteEvent,
  filterActive,
  type Actor,
} from "./audit";
import { logEvent } from "./audit.io";

const COL = "relationships";

export function useRelationships(treeId: string | undefined) {
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!treeId) {
      setRelationships([]);
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
          ...(d.data() as Omit<Relationship, "id">),
        }));
        setRelationships(filterActive(docs));
        setLoading(false);
      },
      (err) => {
        console.error("[relationships] subscription error", err);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [treeId]);

  return { relationships, loading };
}

export async function createRelationship(
  treeId: string,
  type: RelationshipType,
  from: string,
  to: string,
  options?: { actor?: Actor; fromName?: string; toName?: string },
): Promise<string> {
  const ref = await addDoc(collection(db, COL), {
    treeId,
    type,
    from,
    to,
    createdAt: serverTimestamp(),
  });
  if (options?.actor) {
    const rel: Relationship = { id: ref.id, treeId, type, from, to };
    await logEvent(
      buildRelationshipCreateEvent({
        treeId,
        actor: options.actor,
        relationship: rel,
        fromName: options.fromName ?? "",
        toName: options.toName ?? "",
      }),
    );
  }
  return ref.id;
}

export async function softDeleteRelationship(
  relationship: Relationship,
  actor: Actor,
  fromName: string,
  toName: string,
): Promise<void> {
  await updateDoc(doc(db, COL, relationship.id), {
    deletedAt: serverTimestamp(),
    deletedBy: actor.uid,
  });
  await logEvent(
    buildRelationshipDeleteEvent({
      treeId: relationship.treeId,
      actor,
      relationship,
      fromName,
      toName,
    }),
  );
}

