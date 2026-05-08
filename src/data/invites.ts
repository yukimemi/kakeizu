import {
  doc,
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  arrayUnion,
  arrayRemove,
  deleteField,
  serverTimestamp,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "../firebase";
import type { TreeRole } from "../types";

const ALLOWLIST_DOC = doc(db, "config", "access");

/**
 * Owner-side: invite by email. Records the invite on the tree and adds the
 * email to the global allowlist so the invitee can write once they claim.
 */
export async function inviteByEmail(
  treeId: string,
  email: string,
  role: TreeRole = "editor",
): Promise<void> {
  const lower = email.trim().toLowerCase();
  if (!lower || !lower.includes("@")) throw new Error("invalid email");
  await updateDoc(doc(db, "trees", treeId), {
    invitedEmails: arrayUnion(lower),
    [`pendingRoles.${lower}`]: role,
    updatedAt: serverTimestamp(),
  });
  // Add to allowlist so they can write when they claim.
  await updateDoc(ALLOWLIST_DOC, {
    allowedEmails: arrayUnion(lower),
    updatedAt: serverTimestamp(),
  });
}

export async function cancelEmailInvite(
  treeId: string,
  email: string,
): Promise<void> {
  const lower = email.trim().toLowerCase();
  await updateDoc(doc(db, "trees", treeId), {
    invitedEmails: arrayRemove(lower),
    [`pendingRoles.${lower}`]: deleteField(),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Invitee-side: on sign-in, pick up any tree where invitedEmails contains
 * my email and turn that into actual membership.
 */
export async function claimEmailInvites(u: User): Promise<number> {
  const email = u.email?.toLowerCase();
  if (!email) return 0;
  const q = query(
    collection(db, "trees"),
    where("invitedEmails", "array-contains", email),
  );
  const snap = await getDocs(q);
  let claimed = 0;
  for (const d of snap.docs) {
    const data = d.data() as {
      pendingRoles?: Record<string, TreeRole>;
      memberRoles?: Record<string, TreeRole>;
    };
    const role = data.pendingRoles?.[email] ?? "editor";
    if (data.memberRoles?.[u.uid]) {
      // Already a member somehow; just clear the pending entry.
      await updateDoc(d.ref, {
        invitedEmails: arrayRemove(email),
        [`pendingRoles.${email}`]: deleteField(),
        updatedAt: serverTimestamp(),
      });
      continue;
    }
    await updateDoc(d.ref, {
      memberIds: arrayUnion(u.uid),
      [`memberRoles.${u.uid}`]: role,
      [`memberInfo.${u.uid}`]: {
        email,
        displayName: u.displayName ?? "",
      },
      invitedEmails: arrayRemove(email),
      [`pendingRoles.${email}`]: deleteField(),
      updatedAt: serverTimestamp(),
    });
    claimed++;
  }
  return claimed;
}

/**
 * Owner-side: ensure the global allowlist contains the given email. Used
 * when sharing the share-code-style invite path or backfilling.
 */
export async function ensureEmailAllowed(email: string): Promise<void> {
  const lower = email.trim().toLowerCase();
  if (!lower || !lower.includes("@")) return;
  await updateDoc(ALLOWLIST_DOC, {
    allowedEmails: arrayUnion(lower),
    updatedAt: serverTimestamp(),
  });
}
