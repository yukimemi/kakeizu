import {
  doc,
  collection,
  query,
  where,
  getDoc,
  getDocs,
  setDoc,
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
const GRANTS_DOC = doc(db, "config", "accessGrants");

type Grant = { email: string; treeId: string };

/**
 * Record that `treeId` grants `email` write access. Adds the email to the
 * global allowlist and tracks the grant in config/accessGrants so we can
 * revoke it later when the tree drops the user (cancel invite / remove
 * member / delete tree).
 */
export async function addAccessGrant(
  email: string,
  treeId: string,
): Promise<void> {
  const lower = email.trim().toLowerCase();
  if (!lower || !lower.includes("@")) return;
  // Ensure both docs exist with arrayUnion-friendly fields.
  await setDoc(
    GRANTS_DOC,
    { grants: arrayUnion({ email: lower, treeId }) as unknown as Grant[] },
    { merge: true },
  );
  await setDoc(
    ALLOWLIST_DOC,
    { allowedEmails: arrayUnion(lower), updatedAt: serverTimestamp() },
    { merge: true },
  );
}

async function isAdminEmail(email: string): Promise<boolean> {
  try {
    const snap = await getDoc(ALLOWLIST_DOC);
    const admins = (snap.data()?.adminEmails ?? []) as string[];
    return admins.map((a) => a.toLowerCase()).includes(email.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Remove a single (email, treeId) grant. After removal, if the email has
 * no remaining grants on any tree, drop the email from the allowlist
 * entirely so they can no longer write — UNLESS the email is on the
 * adminEmails list (always-trusted, can't be locked out).
 */
export async function removeAccessGrant(
  email: string,
  treeId: string,
): Promise<void> {
  const lower = email.trim().toLowerCase();
  if (!lower) return;
  await updateDoc(GRANTS_DOC, {
    grants: arrayRemove({ email: lower, treeId }),
  }).catch(async (e) => {
    if ((e as { code?: string }).code === "not-found") return;
    throw e;
  });
  if (await isAdminEmail(lower)) return; // never lock out admins
  const snap = await getDoc(GRANTS_DOC);
  const grants = (snap.data()?.grants ?? []) as Grant[];
  const stillGranted = grants.some((g) => g.email === lower);
  if (!stillGranted) {
    await updateDoc(ALLOWLIST_DOC, {
      allowedEmails: arrayRemove(lower),
      updatedAt: serverTimestamp(),
    });
  }
}

/**
 * Remove all grants tied to a deleted tree, then revoke any emails that
 * are no longer granted by anything.
 */
export async function revokeAllGrantsForTree(treeId: string): Promise<void> {
  const snap = await getDoc(GRANTS_DOC);
  const grants = (snap.data()?.grants ?? []) as Grant[];
  const toRemove = grants.filter((g) => g.treeId === treeId);
  if (toRemove.length === 0) return;
  // Remove them from the grants array (one updateDoc each, simple and
  // race-tolerant via arrayRemove of exact-match map values).
  for (const g of toRemove) {
    await updateDoc(GRANTS_DOC, { grants: arrayRemove(g) });
  }
  // Recompute remaining grants and revoke any emails left orphaned.
  const after = await getDoc(GRANTS_DOC);
  const remaining = (after.data()?.grants ?? []) as Grant[];
  const stillGrantedEmails = new Set(remaining.map((g) => g.email));
  const orphaned = [...new Set(toRemove.map((g) => g.email))].filter(
    (email) => !stillGrantedEmails.has(email),
  );
  for (const email of orphaned) {
    if (await isAdminEmail(email)) continue; // protect admins
    await updateDoc(ALLOWLIST_DOC, {
      allowedEmails: arrayRemove(email),
      updatedAt: serverTimestamp(),
    });
  }
}

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
  await addAccessGrant(lower, treeId);
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
  await removeAccessGrant(lower, treeId);
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
