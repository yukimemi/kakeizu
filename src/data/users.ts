import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import type { User } from "firebase/auth";

export type UserDoc = {
  email: string;
  displayName?: string;
  photoURL?: string;
  updatedAt?: number;
};

const COL = "users";

/**
 * Sync the signed-in user's identity to users/{uid}. Lets other parts of the
 * app (member lists, invite resolution) look up an email/displayName by uid.
 */
export async function syncUserDoc(u: User): Promise<void> {
  if (!u.email) return;
  await setDoc(
    doc(db, COL, u.uid),
    {
      email: u.email,
      displayName: u.displayName ?? null,
      photoURL: u.photoURL ?? null,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function fetchUserDoc(uid: string): Promise<UserDoc | null> {
  const snap = await getDoc(doc(db, COL, uid));
  if (!snap.exists()) return null;
  return snap.data() as UserDoc;
}
