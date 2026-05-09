import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  deleteField,
} from "firebase/firestore";
import { db } from "../firebase";
import type { Person, Relationship } from "../types";

function clean<T extends Record<string, unknown>>(o: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v !== undefined && v !== "") out[k] = v;
  }
  return out as T;
}

export async function fetchTreePersons(treeId: string): Promise<Person[]> {
  const snap = await getDocs(
    query(collection(db, "persons"), where("treeId", "==", treeId)),
  );
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Person, "id">) }));
}

const SYNCABLE_FIELDS = [
  "lastName",
  "firstName",
  "lastNameKana",
  "firstNameKana",
  "birthDate",
  "deathDate",
  "gender",
  "photoUrl",
  "photoTransform",
  "postalCode",
  "address",
  "phones",
  "emails",
  "socials",
  "memo",
  // Legacy fields are still synced so older imported persons keep their data
  // until the source updates to the new shape.
  "phone",
  "email",
  "sns",
] as const;

const norm = (v: unknown) => (v == null || v === "" ? undefined : v);

// Deep equality that's order-independent for plain object keys. Firestore
// returns map fields with keys re-ordered (often alphabetically), which
// breaks naive JSON.stringify comparisons.
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  return ka.every((k) =>
    deepEqual(
      (a as Record<string, unknown>)[k],
      (b as Record<string, unknown>)[k],
    ),
  );
}

/**
 * Compare a source person against an already-imported dest person.
 * Returns the list of field names that differ (after normalizing
 * undefined / empty-string and using key-order-independent deep equality).
 */
export function diffPersons(source: Person, dest: Person): string[] {
  const diffs: string[] = [];
  for (const f of SYNCABLE_FIELDS) {
    const sv = norm((source as unknown as Record<string, unknown>)[f]);
    const dv = norm((dest as unknown as Record<string, unknown>)[f]);
    if (typeof sv === "object" || typeof dv === "object") {
      if (!deepEqual(sv, dv)) diffs.push(f);
    } else if (sv !== dv) {
      diffs.push(f);
    }
  }
  return diffs;
}

export type ImportAction =
  | { kind: "create"; sourceId: string }
  | { kind: "resync"; sourceId: string; destId: string };

export type ImportResult = {
  idMap: Record<string, string>; // sourceId → destId (created or existing)
  created: number;
  resynced: number;
  copiedRelationships: number;
};

/**
 * Apply a batch of import actions. Creates new persons or updates existing
 * imported-from copies; optionally also creates relationships among the
 * newly-created persons.
 */
export async function applyImportActions(opts: {
  sourceTreeId: string;
  destTreeId: string;
  actions: ImportAction[];
  includeRelationships: boolean;
}): Promise<ImportResult> {
  const { sourceTreeId, destTreeId, actions, includeRelationships } = opts;
  const idMap: Record<string, string> = {};

  const [personSnap, relSnap] = await Promise.all([
    getDocs(
      query(collection(db, "persons"), where("treeId", "==", sourceTreeId)),
    ),
    getDocs(
      query(
        collection(db, "relationships"),
        where("treeId", "==", sourceTreeId),
      ),
    ),
  ]);
  const sourcePersons = new Map<string, Person>();
  for (const d of personSnap.docs) {
    sourcePersons.set(d.id, {
      id: d.id,
      ...(d.data() as Omit<Person, "id">),
    });
  }

  const newCreatedIds = new Set<string>(); // source ids that were newly created here
  let created = 0;
  let resynced = 0;
  for (const a of actions) {
    const sp = sourcePersons.get(a.sourceId);
    if (!sp) continue;
    const {
      id: _id,
      treeId: _tid,
      createdAt: _ca,
      updatedAt: _ua,
      ...rest
    } = sp;
    void _id;
    void _tid;
    void _ca;
    void _ua;
    if (a.kind === "create") {
      const ref = await addDoc(
        collection(db, "persons"),
        clean({
          ...rest,
          treeId: destTreeId,
          importedFromId: sp.id,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        } as Record<string, unknown>),
      );
      idMap[sp.id] = ref.id;
      newCreatedIds.add(sp.id);
      created++;
    } else {
      // resync: update only the syncable fields. Use deleteField for
      // values that are now undefined/empty so cleared fields are mirrored.
      const update: Record<string, unknown> = {
        updatedAt: serverTimestamp(),
        importedFromId: sp.id,
      };
      for (const f of SYNCABLE_FIELDS) {
        const v = (sp as unknown as Record<string, unknown>)[f];
        if (v === undefined || v === "" || v === null) {
          update[f] = deleteField();
        } else {
          update[f] = v;
        }
      }
      await updateDoc(doc(db, "persons", a.destId), update);
      idMap[sp.id] = a.destId;
      resynced++;
    }
  }

  let copiedRelationships = 0;
  if (includeRelationships && newCreatedIds.size > 0) {
    const sourceRels = relSnap.docs.map(
      (d) =>
        ({ id: d.id, ...(d.data() as Omit<Relationship, "id">) }) as Relationship,
    );
    // Existing dest relationships to avoid duplicates.
    const existingDestRelsSnap = await getDocs(
      query(
        collection(db, "relationships"),
        where("treeId", "==", destTreeId),
      ),
    );
    const existing = new Set(
      existingDestRelsSnap.docs.map((d) => {
        const r = d.data() as Pick<Relationship, "type" | "from" | "to">;
        return `${r.type}|${r.from}|${r.to}`;
      }),
    );

    for (const r of sourceRels) {
      const newFrom = idMap[r.from];
      const newTo = idMap[r.to];
      if (!newFrom || !newTo) continue;
      // Only emit a relationship if at least one endpoint was newly created,
      // and the same relationship doesn't already exist on the dest tree.
      if (!newCreatedIds.has(r.from) && !newCreatedIds.has(r.to)) continue;
      const key = `${r.type}|${newFrom}|${newTo}`;
      if (existing.has(key)) continue;
      // Spouse is undirected — also check the reverse.
      if (
        r.type === "spouse" &&
        existing.has(`spouse|${newTo}|${newFrom}`)
      ) {
        continue;
      }
      await addDoc(collection(db, "relationships"), {
        treeId: destTreeId,
        type: r.type,
        from: newFrom,
        to: newTo,
        createdAt: serverTimestamp(),
      });
      existing.add(key);
      copiedRelationships++;
    }
  }

  return { idMap, created, resynced, copiedRelationships };
}
