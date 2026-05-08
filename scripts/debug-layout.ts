/**
 * Layout debugger.
 *
 * Fetches the live persons + relationships from Firestore using the active
 * gcloud user's access token, runs computeAutoLayout, and prints alignment
 * analysis so we can tell if Walker is producing the expected positions
 * without needing the browser DevTools.
 *
 * Run with: pnpm exec tsx scripts/debug-layout.ts
 */
import { execSync } from "node:child_process";
import { computeAutoLayout, NODE_WIDTH, NODE_HEIGHT } from "../src/layout/treeLayout";
import type { Person, Relationship } from "../src/types";

const PROJECT_ID = "kakeizu-71ce1";

function token(): string {
  return execSync("gcloud auth print-access-token", { encoding: "utf8" }).trim();
}

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

async function listAll<T>(collection: string, t: string): Promise<T[]> {
  const out: T[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(
      `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collection}`,
    );
    url.searchParams.set("pageSize", "300");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${t}`,
        "X-Goog-User-Project": PROJECT_ID,
      },
    });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    const json = (await res.json()) as {
      documents?: Array<{
        name: string;
        fields?: Record<string, FsValue>;
      }>;
      nextPageToken?: string;
    };
    for (const d of json.documents ?? []) {
      const id = d.name.split("/").pop()!;
      const data: Record<string, unknown> = { id };
      for (const [k, v] of Object.entries(d.fields ?? {})) {
        data[k] = unwrap(v);
      }
      out.push(data as T);
    }
    pageToken = json.nextPageToken;
  } while (pageToken);
  return out;
}

async function main() {
  const t = token();
  const persons = await listAll<Person>("persons", t);
  const relationships = await listAll<Relationship>("relationships", t);
  console.log(`Loaded ${persons.length} persons, ${relationships.length} relationships`);

  // Filter: only the active owner's data (just take the first ownerId we see).
  const owner = persons[0]?.ownerId;
  const myPersons = persons.filter((p) => p.ownerId === owner);
  const myRels = relationships.filter((r) => r.ownerId === owner);
  console.log(`Filtered to owner ${owner}: ${myPersons.length} persons, ${myRels.length} rels`);

  const result = computeAutoLayout(myPersons, myRels);

  // Index persons by name for friendly lookup.
  const byName = new Map<string, Person>();
  for (const p of myPersons) {
    byName.set(`${p.lastName} ${p.firstName}`, p);
  }

  const center = (id: string) => {
    const r = result[id];
    return r ? r.x + NODE_WIDTH / 2 : null;
  };

  const coupleCenter = (id1: string, id2: string) => {
    const a = result[id1];
    const b = result[id2];
    if (!a || !b) return null;
    return (Math.min(a.x, b.x) + Math.max(a.x, b.x) + NODE_WIDTH) / 2;
  };

  const find = (lastName: string, firstName: string) =>
    myPersons.find((p) => p.lastName === lastName && p.firstName === firstName);

  // Print all couples and their children alignment.
  const spouses = new Map<string, string>();
  for (const r of myRels) {
    if (r.type !== "spouse") continue;
    spouses.set(r.from, r.to);
    spouses.set(r.to, r.from);
  }

  const childrenOfPair = new Map<string, string[]>();
  const parentsOf = new Map<string, Set<string>>();
  for (const r of myRels) {
    if (r.type !== "parent") continue;
    if (!parentsOf.has(r.to)) parentsOf.set(r.to, new Set());
    parentsOf.get(r.to)!.add(r.from);
  }

  // Group children by parent-couple, check the BLOCK center alignment.
  // (Multiple children spread under a couple — only the block midpoint should
  // align; individual children intentionally fan out.)
  const childrenByCouple = new Map<string, string[]>();
  for (const [childId, ps] of parentsOf.entries()) {
    if (ps.size !== 2) continue;
    const [p1, p2] = [...ps];
    if (spouses.get(p1) !== p2) continue;
    const key = [p1, p2].sort().join("|");
    if (!childrenByCouple.has(key)) childrenByCouple.set(key, []);
    childrenByCouple.get(key)!.push(childId);
  }

  console.log("\n=== Alignment check: each parent-couple's children block ===");
  for (const [key, kids] of childrenByCouple.entries()) {
    const [p1, p2] = key.split("|");
    const cc = coupleCenter(p1, p2);
    if (cc == null) continue;
    const xs = kids
      .map((id) => result[id])
      .filter(Boolean)
      .map((r) => r.x + NODE_WIDTH / 2);
    if (xs.length === 0) continue;
    const blockCenter = (Math.min(...xs) + Math.max(...xs)) / 2;
    const offset = blockCenter - cc;
    const flag = Math.abs(offset) > 5 ? " ⚠️ MISALIGNED" : " ✓";
    const par1 = myPersons.find((p) => p.id === p1)!;
    const par2 = myPersons.find((p) => p.id === p2)!;
    const kidNames = kids
      .map((id) => myPersons.find((p) => p.id === id)!)
      .map((c) => `${c.lastName} ${c.firstName}`)
      .join(", ");
    console.log(
      `${par1.lastName} ${par1.firstName} & ${par2.lastName} ${par2.firstName}  →  [${kidNames}]  block-center=${blockCenter.toFixed(0)}  couple-center=${cc.toFixed(0)}  offset=${offset.toFixed(1)}${flag}`,
    );
  }

  // Print rank summary
  console.log("\n=== Rank summary (by y) ===");
  const byY = new Map<number, Array<{ name: string; x: number }>>();
  for (const p of myPersons) {
    const r = result[p.id];
    if (!r) continue;
    const yKey = Math.round(r.y / NODE_HEIGHT) * NODE_HEIGHT;
    if (!byY.has(yKey)) byY.set(yKey, []);
    byY.get(yKey)!.push({ name: `${p.lastName} ${p.firstName}`, x: r.x });
  }
  for (const [y, list] of [...byY.entries()].sort((a, b) => a[0] - b[0])) {
    list.sort((a, b) => a.x - b.x);
    console.log(`y=${y}:`);
    for (const item of list) {
      console.log(`  x=${item.x.toFixed(0).padStart(6)}  ${item.name}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
