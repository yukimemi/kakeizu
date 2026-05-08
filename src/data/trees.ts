import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  deleteField,
  getDocs,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../firebase";
import type { Tree, TreeRole } from "../types";

const COL = "trees";

export function useTrees(uid: string | undefined) {
  const [trees, setTrees] = useState<Tree[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) return;
    setLoading(true);
    const q = query(
      collection(db, COL),
      where("memberIds", "array-contains", uid),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        // Skip snapshots with pending local writes — they reflect the
        // optimistic local cache, not what's actually on the server. Acting
        // on those would race ahead of dependent subscriptions that go to
        // the server (e.g. persons under a freshly-created tree).
        if (snap.metadata.hasPendingWrites) return;
        const docs = snap.docs.map(
          (d) => ({ id: d.id, ...(d.data() as Omit<Tree, "id">) }) as Tree,
        );
        setTrees(docs);
        setLoading(false);
      },
      (err) => {
        console.error("[trees] subscription error", err);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [uid]);

  return { trees, loading };
}

export async function createTree(
  uid: string,
  name: string,
  creator?: { email?: string | null; displayName?: string | null },
): Promise<string> {
  const memberInfoEntry =
    creator && (creator.email || creator.displayName)
      ? {
          [uid]: {
            email: creator.email ?? "",
            displayName: creator.displayName ?? "",
          },
        }
      : undefined;
  const data: Record<string, unknown> = {
    name,
    ownerId: uid,
    memberIds: [uid],
    memberRoles: { [uid]: "owner" satisfies TreeRole },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (memberInfoEntry) data.memberInfo = memberInfoEntry;
  const ref = await addDoc(collection(db, COL), data);
  return ref.id;
}

export async function addTreeMember(
  treeId: string,
  memberUid: string,
  role: TreeRole = "editor",
) {
  await updateDoc(doc(db, COL, treeId), {
    memberIds: arrayUnion(memberUid),
    [`memberRoles.${memberUid}`]: role,
    updatedAt: serverTimestamp(),
  });
}

export async function removeTreeMember(treeId: string, memberUid: string) {
  await updateDoc(doc(db, COL, treeId), {
    memberIds: arrayRemove(memberUid),
    [`memberRoles.${memberUid}`]: deleteField(),
    updatedAt: serverTimestamp(),
  });
}

export async function setTreeMemberRole(
  treeId: string,
  memberUid: string,
  role: TreeRole,
) {
  await updateDoc(doc(db, COL, treeId), {
    [`memberRoles.${memberUid}`]: role,
    updatedAt: serverTimestamp(),
  });
}

export async function updateTreeName(treeId: string, name: string) {
  await updateDoc(doc(db, COL, treeId), {
    name,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteTree(treeId: string) {
  // Cascade delete persons + relationships first
  const personsQ = query(
    collection(db, "persons"),
    where("treeId", "==", treeId),
  );
  const relsQ = query(
    collection(db, "relationships"),
    where("treeId", "==", treeId),
  );
  const [personsSnap, relsSnap] = await Promise.all([
    getDocs(personsQ),
    getDocs(relsQ),
  ]);
  await Promise.all([
    ...personsSnap.docs.map((d) => deleteDoc(d.ref)),
    ...relsSnap.docs.map((d) => deleteDoc(d.ref)),
  ]);
  await deleteDoc(doc(db, COL, treeId));
}
