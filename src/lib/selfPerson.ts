// localStorage-backed mapping of "who am I" within each tree, scoped to the
// signed-in uid so multiple family members on the same browser get their
// own answer.

const key = (uid: string, treeId: string): string =>
  `kakeizu.self.${uid}.${treeId}`;

export function getSelfPersonId(
  uid: string,
  treeId: string,
): string | null {
  try {
    return localStorage.getItem(key(uid, treeId));
  } catch {
    return null;
  }
}

export function setSelfPersonId(
  uid: string,
  treeId: string,
  personId: string | null,
): void {
  try {
    if (personId === null) localStorage.removeItem(key(uid, treeId));
    else localStorage.setItem(key(uid, treeId), personId);
  } catch {
    // ignore — localStorage may be disabled
  }
}
