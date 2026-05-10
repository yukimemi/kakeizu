// localStorage-backed display preferences scoped to the signed-in uid.
// Kept separate from per-tree state (selfPerson) because these are pure
// viewing preferences that should apply across all trees the user opens.

const showAgeKey = (uid: string): string => `kakeizu.showAge.${uid}`;

export function getShowAge(uid: string): boolean {
  try {
    return localStorage.getItem(showAgeKey(uid)) === "1";
  } catch {
    return false;
  }
}

export function setShowAge(uid: string, value: boolean): void {
  try {
    if (value) localStorage.setItem(showAgeKey(uid), "1");
    else localStorage.removeItem(showAgeKey(uid));
  } catch {
    // ignore — localStorage may be disabled
  }
}
