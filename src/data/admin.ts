import { collection, onSnapshot, doc, getDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../firebase";
import type { Tree } from "../types";
import type { UserDoc } from "./users";

export type UserRecord = UserDoc & { uid: string };

/**
 * Admin-only: subscribe to all users in the `users/` collection. Any
 * signed-in user can technically read `users/{uid}` per the current rules,
 * but the UI gates this hook behind RequireAdmin so it never mounts for
 * non-admins.
 */
export function useAllUsers() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "users"),
      (snap) => {
        const list = snap.docs.map((d) => ({
          uid: d.id,
          ...(d.data() as UserDoc),
        }));
        setUsers(list);
        setLoading(false);
      },
      (err) => {
        console.error("[admin] users subscription error", err);
        setLoading(false);
      },
    );
    return () => unsub();
  }, []);

  return { users, loading };
}

/**
 * Admin-only: subscribe to all trees. Requires `firestore.rules` to allow
 * admin reads on `trees/*`. Gated by RequireAdmin client-side.
 */
export function useAllTrees() {
  const [trees, setTrees] = useState<Tree[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "trees"),
      (snap) => {
        const list = snap.docs.map(
          (d) => ({ id: d.id, ...(d.data() as Omit<Tree, "id">) }) as Tree,
        );
        setTrees(list);
        setLoading(false);
      },
      (err) => {
        console.error("[admin] trees subscription error", err);
        setLoading(false);
      },
    );
    return () => unsub();
  }, []);

  return { trees, loading };
}

/**
 * Fetch a single tree by id. Used by the admin tree-viewer page so it can
 * resolve `:treeId` without needing the full list to land first.
 */
export async function fetchTree(treeId: string): Promise<Tree | null> {
  const snap = await getDoc(doc(db, "trees", treeId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<Tree, "id">) } as Tree;
}
