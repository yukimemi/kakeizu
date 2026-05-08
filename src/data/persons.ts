import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../firebase";
import type { Person } from "../types";

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
        setPersons(docs);
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
) {
  const ref = await addDoc(
    collection(db, COL),
    clean({
      ...data,
      treeId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );
  return ref.id;
}

export async function updatePerson(
  id: string,
  data: Partial<Omit<Person, "id" | "treeId" | "createdAt">>,
) {
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
}

export async function deletePerson(id: string) {
  await deleteDoc(doc(db, COL, id));
}
