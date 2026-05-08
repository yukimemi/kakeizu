/**
 * Verify that parent-edge bend points are staggered. Replicates the offset
 * logic from TreePage and prints the resulting bend-y per edge so we can see
 * whether two horizontals would render at the same y (overlap).
 *
 * Run: pnpm exec tsx scripts/debug-edges.ts
 */
import { execSync } from "node:child_process";
import { Position, getSmoothStepPath } from "@xyflow/react";
import { computeAutoLayout, NODE_WIDTH, NODE_HEIGHT } from "../src/layout/treeLayout";
import type { Person, Relationship } from "../src/types";

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
      documents?: Array<{ name: string; fields?: Record<string, FsValue> }>;
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
  const owner = persons[0]?.ownerId;
  const myPersons = persons.filter((p) => p.ownerId === owner);
  const myRels = relationships.filter((r) => r.ownerId === owner);

  const result = computeAutoLayout(myPersons, myRels);

  // Replicate TreePage's edge logic.
  const ids = new Set(myPersons.map((p) => p.id));

  // Couple lookup
  const inCouple = new Map<string, string>();
  const couples: Array<{ a: string; b: string; id: string }> = [];
  for (const r of myRels) {
    if (r.type !== "spouse") continue;
    if (!ids.has(r.from) || !ids.has(r.to)) continue;
    if (inCouple.has(r.from) || inCouple.has(r.to)) continue;
    const ax = result[r.from]?.x ?? 0;
    const bx = result[r.to]?.x ?? 0;
    const left = ax <= bx ? r.from : r.to;
    const right = left === r.from ? r.to : r.from;
    const id = `couple:${[r.from, r.to].sort().join("|")}`;
    couples.push({ a: left, b: right, id });
    inCouple.set(r.from, id);
    inCouple.set(r.to, id);
  }

  // Couple node positions
  const sourceX = new Map<string, number>();
  const sourceY = new Map<string, number>();
  for (const p of myPersons) {
    const r = result[p.id];
    if (!r) continue;
    sourceX.set(p.id, r.x + NODE_WIDTH / 2);
    sourceY.set(p.id, r.y + NODE_HEIGHT); // bottom of person node
  }
  for (const c of couples) {
    const a = result[c.a];
    const b = result[c.b];
    if (!a || !b) continue;
    sourceX.set(c.id, (a.x + b.x + NODE_WIDTH) / 2);
    // couple node is placed at parent.y + NODE_HEIGHT/2 - 4, height 8
    // bottom = parent.y + NODE_HEIGHT/2 + 4
    sourceY.set(c.id, a.y + NODE_HEIGHT / 2 + 4);
  }

  // childToParents
  const childToParents = new Map<string, Set<string>>();
  for (const r of myRels) {
    if (r.type !== "parent") continue;
    if (!ids.has(r.from) || !ids.has(r.to)) continue;
    if (!childToParents.has(r.to)) childToParents.set(r.to, new Set());
    childToParents.get(r.to)!.add(r.from);
  }

  // Build parentSourceIds
  const parentSourceIds = new Set<string>();
  for (const parentIds of childToParents.values()) {
    for (const pid of parentIds) {
      const cId = inCouple.get(pid);
      if (cId) {
        const couple = couples.find((c) => c.id === cId);
        const partner = couple?.a === pid ? couple?.b : couple?.a;
        if (partner && parentIds.has(partner)) {
          parentSourceIds.add(cId);
          continue;
        }
      }
      parentSourceIds.add(pid);
    }
  }

  // person rank bottom per parent unit
  const personRankBottomOf = new Map<string, number>();
  for (const id of parentSourceIds) {
    const couple = couples.find((c) => c.id === id);
    const personIds = couple ? [couple.a, couple.b] : [id];
    let maxBottom = 0;
    for (const pid of personIds) {
      const r = result[pid];
      if (r) maxBottom = Math.max(maxBottom, r.y + NODE_HEIGHT);
    }
    personRankBottomOf.set(id, maxBottom);
  }

  // Compute x-range per parent unit; greedy interval coloring within rank.
  const rangeOf = new Map<string, { lo: number; hi: number }>();
  for (const [childId, pids] of childToParents.entries()) {
    const childX = (result[childId]?.x ?? 0) + NODE_WIDTH / 2;
    for (const pid of pids) {
      const cId = inCouple.get(pid);
      let sourceId = pid;
      if (cId) {
        const couple = couples.find((c) => c.id === cId);
        const partner = couple?.a === pid ? couple?.b : couple?.a;
        if (partner && pids.has(partner)) sourceId = cId;
      }
      const sx = sourceX.get(sourceId) ?? 0;
      const lo = Math.min(sx, childX);
      const hi = Math.max(sx, childX);
      const cur = rangeOf.get(sourceId);
      if (!cur) rangeOf.set(sourceId, { lo, hi });
      else
        rangeOf.set(sourceId, {
          lo: Math.min(cur.lo, lo),
          hi: Math.max(cur.hi, hi),
        });
    }
  }

  const byRank = new Map<number, string[]>();
  for (const id of parentSourceIds) {
    const y = Math.round((personRankBottomOf.get(id) ?? 0) / 10) * 10;
    if (!byRank.has(y)) byRank.set(y, []);
    byRank.get(y)!.push(id);
  }
  const horizYOf = new Map<string, number>();
  const BASE_GAP = 18;
  const LEVEL_GAP = 25;
  for (const ids of byRank.values()) {
    ids.sort((a, b) => (rangeOf.get(a)?.lo ?? 0) - (rangeOf.get(b)?.lo ?? 0));
    const levels: Array<Array<{ lo: number; hi: number }>> = [];
    const rankBottom = personRankBottomOf.get(ids[0]) ?? 0;
    for (const id of ids) {
      const r = rangeOf.get(id);
      if (!r) {
        horizYOf.set(id, rankBottom + BASE_GAP);
        continue;
      }
      let level = 0;
      while (level < levels.length) {
        const ranges = levels[level];
        const overlap = ranges.some(
          (x) => Math.max(x.lo, r.lo) < Math.min(x.hi, r.hi),
        );
        if (!overlap) break;
        level++;
      }
      if (level >= levels.length) levels.push([]);
      levels[level].push(r);
      horizYOf.set(id, rankBottom + BASE_GAP + level * LEVEL_GAP);
    }
  }
  const offsetOf = horizYOf; // alias for downstream code
  const sorted = [...parentSourceIds].sort(
    (a, b) => (sourceX.get(a) ?? 0) - (sourceX.get(b) ?? 0),
  );

  // Pretty name lookup
  const nameOf = (id: string) => {
    const p = myPersons.find((q) => q.id === id);
    if (p) return `${p.lastName} ${p.firstName}`;
    const c = couples.find((c) => c.id === id);
    if (c) {
      const a = myPersons.find((q) => q.id === c.a);
      const b = myPersons.find((q) => q.id === c.b);
      return `${a?.lastName ?? "?"} ${a?.firstName ?? "?"} & ${b?.lastName ?? "?"} ${b?.firstName ?? "?"}`;
    }
    return id;
  };

  console.log("\n=== Parent unit horizY (sorted by x) ===");
  for (const id of sorted) {
    console.log(
      `x=${(sourceX.get(id) ?? 0).toFixed(0).padStart(5)}  horizY=${horizYOf.get(id)?.toString().padStart(4)}  rankBottom=${personRankBottomOf.get(id)?.toString().padStart(3)}  ${nameOf(id)}`,
    );
  }

  // Render each edge with getSmoothStepPath, extract horizontal-segment y
  // from the SVG d-string.
  console.log("\n=== Edge horizontal-segment y (from actual SVG path) ===");
  const edgesByBendY = new Map<number, string[]>();
  for (const [childId, pids] of childToParents.entries()) {
    const coupleSources = new Set<string>();
    const singletonSources: string[] = [];
    const covered = new Set<string>();
    for (const pid of pids) {
      if (covered.has(pid)) continue;
      const cId = inCouple.get(pid);
      if (cId) {
        const couple = couples.find((c) => c.id === cId);
        const partner = couple?.a === pid ? couple?.b : couple?.a;
        if (partner && pids.has(partner)) {
          coupleSources.add(cId);
          covered.add(pid);
          covered.add(partner);
          continue;
        }
      }
      singletonSources.push(pid);
    }
    for (const sid of [...coupleSources, ...singletonSources]) {
      const sy = sourceY.get(sid) ?? 0;
      const sx = sourceX.get(sid) ?? 0;
      const tx = (result[childId]?.x ?? 0) + NODE_WIDTH / 2;
      const ty = result[childId]?.y ?? 0; // top of person node
      const off = offsetOf.get(sid) ?? 20;
      const [path] = getSmoothStepPath({
        sourceX: sx,
        sourceY: sy,
        sourcePosition: Position.Bottom,
        targetX: tx,
        targetY: ty,
        targetPosition: Position.Top,
        offset: off,
        borderRadius: 6,
      });
      // debug: print path for one specific edge
      if (
        nameOf(sid).includes("岩永") ||
        (nameOf(sid).includes("今川 葉子") && nameOf(childId).includes("輝哉"))
      ) {
        console.log(`PATH for ${nameOf(sid)} → ${nameOf(childId)} (offset=${off}):`);
        console.log(`  source=(${sx}, ${sy}) target=(${tx}, ${ty})`);
        console.log(`  d=${path}`);
      }
      // Extract horizontal segment y. Path is a string like "M 100 100 L 100 130 L 200 130 L 200 250"
      // The horizontal y = the y where x changes while y stays the same.
      const matches = [...path.matchAll(/[ML]\s*(-?\d+\.?\d*)\s*[, ]\s*(-?\d+\.?\d*)/g)];
      const points = matches.map((m) => ({ x: parseFloat(m[1]), y: parseFloat(m[2]) }));
      let horizY: number | null = null;
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1];
        const b = points[i];
        if (Math.abs(a.y - b.y) < 1 && Math.abs(a.x - b.x) > 1) {
          horizY = (a.y + b.y) / 2;
          break;
        }
      }
      const bendY = horizY ?? sy + off;
      const xRange = `[${Math.min(sx, tx).toFixed(0)}, ${Math.max(sx, tx).toFixed(0)}]`;
      const line = `bendY=${bendY.toFixed(0).padStart(4)}  xRange=${xRange.padEnd(16)}  ${nameOf(sid)}  →  ${nameOf(childId)}`;
      const yKey = Math.round(bendY);
      if (!edgesByBendY.has(yKey)) edgesByBendY.set(yKey, []);
      edgesByBendY.get(yKey)!.push(line);
    }
  }

  // Print grouped by bend y
  for (const [y, lines] of [...edgesByBendY.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`\n--- bendY=${y} (${lines.length} edges) ---`);
    for (const l of lines) console.log(l);
  }

  // Detect overlapping x ranges at same bend y
  console.log("\n=== Potential visual overlap (same bendY + overlapping x range) ===");
  for (const [y, lines] of edgesByBendY.entries()) {
    if (lines.length < 2) continue;
    // Each line has xRange embedded; parse it
    const ranges = lines.map((l) => {
      const m = l.match(/\[(\d+), (\d+)\]/);
      return m ? { line: l, lo: Number(m[1]), hi: Number(m[2]) } : null;
    }).filter(Boolean) as Array<{ line: string; lo: number; hi: number }>;
    for (let i = 0; i < ranges.length; i++) {
      for (let j = i + 1; j < ranges.length; j++) {
        const a = ranges[i];
        const b = ranges[j];
        const overlap = Math.max(a.lo, b.lo) < Math.min(a.hi, b.hi);
        if (overlap) {
          console.log(`OVERLAP @ y=${y}:`);
          console.log(`  ${a.line}`);
          console.log(`  ${b.line}`);
        }
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
