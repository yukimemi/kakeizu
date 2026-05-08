import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  getDocs,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../firebase";
import type { Relationship, RelationshipType } from "../types";

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
        setRelationships(docs);
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
) {
  const ref = await addDoc(collection(db, COL), {
    treeId,
    type,
    from,
    to,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function deleteRelationship(id: string) {
  await deleteDoc(doc(db, COL, id));
}

export async function deleteRelationshipsFor(treeId: string, personId: string) {
  const q1 = query(
    collection(db, COL),
    where("treeId", "==", treeId),
    where("from", "==", personId),
  );
  const q2 = query(
    collection(db, COL),
    where("treeId", "==", treeId),
    where("to", "==", personId),
  );
  const [a, b] = await Promise.all([getDocs(q1), getDocs(q2)]);
  await Promise.all(
    [...a.docs, ...b.docs].map((d) => deleteDoc(doc(db, COL, d.id))),
  );
}
