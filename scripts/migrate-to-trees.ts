/**
 * Migration: ownerId → treeId.
 *
 * For each unique ownerId in persons + relationships, creates a tree document
 * with that user as owner, then patches every person/relationship doc with
 * the new treeId field.
 *
 * Idempotent: skips docs that already have treeId.
 *
 * Run: pnpm exec tsx scripts/migrate-to-trees.ts
 */
import { execSync } from "node:child_process";

const PROJECT_ID = "kakeizu-71ce1";
const token = () =>
  execSync("gcloud auth print-access-token", { encoding: "utf8" }).trim();

type FsValue = {
  stringValue?: string;
  integerValue?: string;
  doubleValue?: number;
  booleanValue?: boolean;
  timestampValue?: string;
  mapValue?: { fields?: Record<string, FsValue> };
  arrayValue?: { values?: FsValue[] };
  nullValue?: null;
};
function unwrap(v: FsValue): unknown {
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.integerValue !== undefined) return Number(v.integerValue);
  if (v.doubleValue !== undefined) return v.doubleValue;
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.timestampValue !== undefined) return v.timestampValue;
  if (v.nullValue !== undefined) return null;
  if (v.mapValue) {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v.mapValue.fields ?? {})) {
      out[k] = unwrap(val);
    }
    return out;
  }
  if (v.arrayValue) return (v.arrayValue.values ?? []).map(unwrap);
  return undefined;
}
function wrap(v: unknown): FsValue {
  if (v === null) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "number")
    return Number.isInteger(v)
      ? { integerValue: String(v) }
      : { doubleValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (Array.isArray(v))
    return { arrayValue: { values: v.map(wrap) } };
  if (typeof v === "object") {
    const fields: Record<string, FsValue> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      fields[k] = wrap(val);
    }
    return { mapValue: { fields } };
  }
  throw new Error(`Cannot wrap ${typeof v}`);
}

async function fsRequest(
  method: string,
  path: string,
  body: unknown,
  t: string,
): Promise<unknown> {
  const url = `https://firestore.googleapis.com/v1/${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${t}`,
      "X-Goog-User-Project": PROJECT_ID,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function listAll<T extends Record<string, unknown>>(
  collection: string,
  t: string,
): Promise<Array<T & { id: string; _name: string }>> {
  const out: Array<T & { id: string; _name: string }> = [];
  let pageToken: string | undefined;
  do {
    const u = new URL(
      `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collection}`,
    );
    u.searchParams.set("pageSize", "300");
    if (pageToken) u.searchParams.set("pageToken", pageToken);
    const res = await fetch(u, {
      headers: {
        Authorization: `Bearer ${t}`,
        "X-Goog-User-Project": PROJECT_ID,
      },
    });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    const json = (await res.json()) as {
      documents?: Array<{ name: string; fields?: Record<string, FsValue> }>;
      nextPageToken?: string;
    };
    for (const d of json.documents ?? []) {
      const id = d.name.split("/").pop()!;
      const data: Record<string, unknown> = { id, _name: d.name };
      for (const [k, v] of Object.entries(d.fields ?? {})) {
        data[k] = unwrap(v);
      }
      out.push(data as T & { id: string; _name: string });
    }
    pageToken = json.nextPageToken;
  } while (pageToken);
  return out;
}

async function patchDoc(
  docName: string,
  fields: Record<string, unknown>,
  updateMask: string[],
  t: string,
) {
  const url = new URL(`https://firestore.googleapis.com/v1/${docName}`);
  for (const f of updateMask) url.searchParams.append("updateMask.fieldPaths", f);
  const body = {
    fields: Object.fromEntries(
      Object.entries(fields).map(([k, v]) => [k, wrap(v)]),
    ),
  };
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${t}`,
      "X-Goog-User-Project": PROJECT_ID,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok)
    throw new Error(`PATCH ${docName}: ${res.status} ${await res.text()}`);
}

async function createTreeDoc(
  ownerId: string,
  name: string,
  t: string,
): Promise<string> {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/trees`;
  const now = new Date().toISOString();
  const body = {
    fields: {
      name: wrap(name),
      ownerId: wrap(ownerId),
      memberIds: wrap([ownerId]),
      memberRoles: wrap({ [ownerId]: "owner" }),
      createdAt: { timestampValue: now },
      updatedAt: { timestampValue: now },
    },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${t}`,
      "X-Goog-User-Project": PROJECT_ID,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok)
    throw new Error(`POST trees: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { name: string };
  return json.name.split("/").pop()!;
}

async function main() {
  const t = token();
  type DocLike = { id: string; _name: string; ownerId?: string; treeId?: string };

  const persons = await listAll<DocLike>("persons", t);
  const rels = await listAll<DocLike>("relationships", t);
  console.log(`Loaded ${persons.length} persons, ${rels.length} relationships`);

  const personsToMigrate = persons.filter((p) => !p.treeId && p.ownerId);
  const relsToMigrate = rels.filter((r) => !r.treeId && r.ownerId);
  console.log(
    `Need migration: ${personsToMigrate.length} persons, ${relsToMigrate.length} relationships`,
  );

  // Group by ownerId — one tree per unique owner.
  const owners = new Set<string>();
  for (const p of personsToMigrate) if (p.ownerId) owners.add(p.ownerId);
  for (const r of relsToMigrate) if (r.ownerId) owners.add(r.ownerId);

  // Find existing trees so we don't double-create (idempotent re-runs)
  const existingTrees = await listAll<{
    id: string;
    _name: string;
    ownerId?: string;
  }>("trees", t);
  const treeByOwner = new Map<string, string>();
  for (const tr of existingTrees) {
    if (tr.ownerId) treeByOwner.set(tr.ownerId, tr.id);
  }

  // Create missing trees
  for (const owner of owners) {
    if (treeByOwner.has(owner)) {
      console.log(`Owner ${owner}: tree already exists (${treeByOwner.get(owner)})`);
      continue;
    }
    const treeId = await createTreeDoc(owner, "わたしの家系図", t);
    treeByOwner.set(owner, treeId);
    console.log(`Created tree ${treeId} for owner ${owner}`);
  }

  // Patch persons
  let patched = 0;
  for (const p of personsToMigrate) {
    const tid = treeByOwner.get(p.ownerId!);
    if (!tid) continue;
    await patchDoc(p._name, { treeId: tid }, ["treeId"], t);
    patched++;
  }
  console.log(`Patched ${patched} persons with treeId`);

  patched = 0;
  for (const r of relsToMigrate) {
    const tid = treeByOwner.get(r.ownerId!);
    if (!tid) continue;
    await patchDoc(r._name, { treeId: tid }, ["treeId"], t);
    patched++;
  }
  console.log(`Patched ${patched} relationships with treeId`);

  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
