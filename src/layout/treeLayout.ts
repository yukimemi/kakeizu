import dagre from "@dagrejs/dagre";
import type { Person, Relationship } from "../types";

export const NODE_WIDTH = 220;
export const NODE_HEIGHT = 130;

export type LayoutResult = Record<string, { x: number; y: number }>;

/**
 * Compute auto layout positions for persons.
 * - Parent → child edges drive vertical hierarchy.
 * - Spouse edges add a soft horizontal coupling so partners tend to be adjacent.
 * - Siblings (children of same parent) are then re-sorted by birth date.
 */
export function computeAutoLayout(
  persons: Person[],
  relationships: Relationship[],
): LayoutResult {
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: "TB",
    nodesep: 60,
    ranksep: 110,
    edgesep: 40,
    marginx: 40,
    marginy: 40,
  });
  g.setDefaultEdgeLabel(() => ({}));

  const personIds = new Set(persons.map((p) => p.id));
  // Drop relationships pointing to deleted persons so dagre doesn't crash.
  relationships = relationships.filter(
    (r) => personIds.has(r.from) && personIds.has(r.to),
  );

  for (const p of persons) {
    g.setNode(p.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }

  // Children grouped by parent for sibling sort.
  const childrenByParent = new Map<string, string[]>();
  // Children grouped by *set* of parents for sibling-block sort across couples.
  // Key: sorted-pair of parent ids (or single parent id), value: list of child ids.
  const childrenByParentSet = new Map<string, string[]>();
  const parentsOf = new Map<string, Set<string>>();

  for (const r of relationships) {
    if (r.type !== "parent") continue;
    if (!childrenByParent.has(r.from)) childrenByParent.set(r.from, []);
    childrenByParent.get(r.from)!.push(r.to);
    if (!parentsOf.has(r.to)) parentsOf.set(r.to, new Set());
    parentsOf.get(r.to)!.add(r.from);
  }

  for (const [childId, parents] of parentsOf.entries()) {
    const key = [...parents].sort().join("|");
    if (!childrenByParentSet.has(key)) childrenByParentSet.set(key, []);
    childrenByParentSet.get(key)!.push(childId);
  }

  const personById = new Map(persons.map((p) => [p.id, p]));
  const birthKey = (id: string) =>
    personById.get(id)?.birthDate ?? "9999-12-31";

  // Add parent edges in birth-date order so dagre prefers that order on each rank.
  for (const [parentId, children] of childrenByParent.entries()) {
    children.sort((a, b) => birthKey(a).localeCompare(birthKey(b)));
    for (const childId of children) {
      g.setEdge(parentId, childId, { weight: 2, minlen: 1 });
    }
  }

  // Spouse edges intentionally skipped: dagre's network-simplex algorithm
  // chokes on minlen=0 edges. We draw spouse edges in React Flow directly.

  dagre.layout(g);

  const result: LayoutResult = {};
  for (const id of g.nodes()) {
    const n = g.node(id);
    if (!n) continue;
    result[id] = { x: n.x - NODE_WIDTH / 2, y: n.y - NODE_HEIGHT / 2 };
  }

  // Post-process: for each sibling group, force x-order to match birth-date order
  // while preserving the bounding x range produced by dagre.
  for (const siblings of childrenByParentSet.values()) {
    if (siblings.length < 2) continue;
    const sorted = [...siblings].sort((a, b) =>
      birthKey(a).localeCompare(birthKey(b)),
    );
    const xs = siblings
      .map((id) => result[id]?.x)
      .filter((x): x is number => typeof x === "number")
      .sort((a, b) => a - b);
    if (xs.length !== sorted.length) continue;
    sorted.forEach((id, i) => {
      if (result[id]) result[id].x = xs[i];
    });
  }

  // ── Family-tree post-process ────────────────────────────────────────────
  // Goals:
  //   1. spouses always adjacent (couple = atomic unit on its rank)
  //   2. married-in spouses join their partner's generation
  //   3. parents centered above their children to avoid edge crossings
  //   4. siblings of the same parent set stay together
  const SPOUSE_GAP = 30;
  const SIBLING_GAP = 60;
  const FAMILY_GAP = 120; // gap between unrelated families on a rank
  const RANK_TOL = NODE_HEIGHT / 2;

  const spouseMap = new Map<string, Set<string>>();
  for (const r of relationships) {
    if (r.type !== "spouse") continue;
    if (!spouseMap.has(r.from)) spouseMap.set(r.from, new Set());
    if (!spouseMap.has(r.to)) spouseMap.set(r.to, new Set());
    spouseMap.get(r.from)!.add(r.to);
    spouseMap.get(r.to)!.add(r.from);
  }

  type Bucket = { y: number; ids: string[] };
  const buckets: Bucket[] = [];
  const idToBucket = new Map<string, Bucket>();
  const sortedByY = Object.entries(result).sort((a, b) => a[1].y - b[1].y);
  for (const [id, pos] of sortedByY) {
    const last = buckets[buckets.length - 1];
    if (last && Math.abs(last.y - pos.y) <= RANK_TOL) {
      last.ids.push(id);
      idToBucket.set(id, last);
    } else {
      const b = { y: pos.y, ids: [id] };
      buckets.push(b);
      idToBucket.set(id, b);
    }
  }

  const hasParents = (id: string) =>
    relationships.some((r) => r.type === "parent" && r.to === id);

  // Move married-in (parentless) spouses to their partner's rank.
  for (const [a, ss] of spouseMap.entries()) {
    for (const b of ss) {
      const ba = idToBucket.get(a);
      const bb = idToBucket.get(b);
      if (!ba || !bb || ba === bb) continue;
      const moveB = !hasParents(b) && hasParents(a);
      const moveA = !hasParents(a) && hasParents(b) && !moveB;
      if (moveB) {
        bb.ids = bb.ids.filter((x) => x !== b);
        ba.ids.push(b);
        idToBucket.set(b, ba);
      } else if (moveA) {
        ba.ids = ba.ids.filter((x) => x !== a);
        bb.ids.push(a);
        idToBucket.set(a, bb);
      }
    }
  }

  // Build units (couple = two ids, single = one).
  type Unit = {
    ids: string[];
    w: number;
    bucket: Bucket;
    x: number;
  };
  const allUnits: Unit[] = [];
  const unitsByBucket = new Map<Bucket, Unit[]>();
  const unitOf = new Map<string, Unit>();

  for (const b of buckets) {
    const placed = new Set<string>();
    const units: Unit[] = [];
    const ordered = [...b.ids].sort(
      (a, c) => (result[a]?.x ?? 0) - (result[c]?.x ?? 0),
    );
    for (const id of ordered) {
      if (placed.has(id)) continue;
      const partner = [...(spouseMap.get(id) ?? [])].find(
        (s) => idToBucket.get(s) === b && !placed.has(s),
      );
      let unit: Unit;
      if (partner) {
        const pair = [id, partner].sort((p, q) =>
          birthKey(p).localeCompare(birthKey(q)),
        );
        unit = {
          ids: pair,
          w: NODE_WIDTH * 2 + SPOUSE_GAP,
          bucket: b,
          x: Math.min(result[id]?.x ?? 0, result[partner]?.x ?? 0),
        };
        placed.add(id);
        placed.add(partner);
      } else {
        unit = {
          ids: [id],
          w: NODE_WIDTH,
          bucket: b,
          x: result[id]?.x ?? 0,
        };
        placed.add(id);
      }
      units.push(unit);
      allUnits.push(unit);
      for (const m of unit.ids) unitOf.set(m, unit);
    }
    unitsByBucket.set(b, units);
  }

  // Map: parent unit → child units
  const childUnits = new Map<Unit, Set<Unit>>();
  for (const r of relationships) {
    if (r.type !== "parent") continue;
    const pu = unitOf.get(r.from);
    const cu = unitOf.get(r.to);
    if (!pu || !cu || pu === cu) continue;
    if (!childUnits.has(pu)) childUnits.set(pu, new Set());
    childUnits.get(pu)!.add(cu);
  }

  // Map: child unit → primary parent unit. A child can have multiple parent
  // units (typical case: married-in spouse brings their own parents).
  // Primary = parent unit with more children — that block becomes the main
  // sibling group; secondary parents are anchored above the same child via
  // the orphan-block logic.
  const parentUnitOf = new Map<Unit, Unit>();
  const candidates = new Map<Unit, Unit[]>();
  for (const [pu, kids] of childUnits.entries()) {
    for (const cu of kids) {
      if (!candidates.has(cu)) candidates.set(cu, []);
      candidates.get(cu)!.push(pu);
    }
  }
  for (const [cu, parents] of candidates.entries()) {
    parents.sort(
      (a, b) =>
        (childUnits.get(b)?.size ?? 0) - (childUnits.get(a)?.size ?? 0),
    );
    parentUnitOf.set(cu, parents[0]);
  }

  // ── Walker-style subtree layout ──────────────────────────────────────────
  // Each subtree's required width = max(unit.w, sum of children-subtrees + gaps).
  // Position units top-down; each unit centered above its subtree, children
  // packed below using their own subtree widths. This guarantees children are
  // always centered under their parent — no "shifted to fit" artifact.

  const primaryChildrenOf = (u: Unit): Unit[] => {
    const cs = childUnits.get(u);
    if (!cs) return [];
    return [...cs].filter((c) => parentUnitOf.get(c) === u);
  };

  const subtreeWidth = new Map<Unit, number>();
  const sortedKidsOf = new Map<Unit, Unit[]>();
  const sideOfKid = (kid: Unit, parent: Unit): number => {
    // Couples whose member's external family-of-origin sits on the left/right
    // get pulled to that side of the sibling block. Falls back to neutral.
    for (const id of kid.ids) {
      const ps = parentsOf.get(id);
      if (!ps) continue;
      for (const pId of ps) {
        const pu = unitOf.get(pId);
        if (pu && pu !== parent) {
          // Use any known x for the external parent; falls back to id-stable
          // sign so result is deterministic before positions are computed.
          if (typeof pu.x === "number" && typeof parent.x === "number") {
            if (pu.x < parent.x) return -1;
            if (pu.x > parent.x) return 1;
          }
        }
      }
    }
    return 0;
  };

  const computeSubtreeWidth = (u: Unit): number => {
    if (subtreeWidth.has(u)) return subtreeWidth.get(u)!;
    const kids = primaryChildrenOf(u);
    kids.sort((a, c) => {
      const sa = sideOfKid(a, u);
      const sc = sideOfKid(c, u);
      if (sa !== sc) return sa - sc;
      const ba = a.ids.map(birthKey).sort()[0];
      const bc = c.ids.map(birthKey).sort()[0];
      return ba.localeCompare(bc);
    });
    sortedKidsOf.set(u, kids);
    if (kids.length === 0) {
      subtreeWidth.set(u, u.w);
      return u.w;
    }
    const childTotal =
      kids.reduce((s, c) => s + computeSubtreeWidth(c), 0) +
      SIBLING_GAP * (kids.length - 1);
    const w = Math.max(u.w, childTotal);
    subtreeWidth.set(u, w);
    return w;
  };

  for (const u of allUnits) computeSubtreeWidth(u);

  const positionSubtree = (u: Unit, leftEdge: number) => {
    const sw = subtreeWidth.get(u)!;
    u.x = leftEdge + (sw - u.w) / 2;
    const kids = sortedKidsOf.get(u) ?? [];
    if (kids.length === 0) return;
    const childTotal =
      kids.reduce((s, c) => s + subtreeWidth.get(c)!, 0) +
      SIBLING_GAP * (kids.length - 1);
    let childCursor = leftEdge + (sw - childTotal) / 2;
    for (const k of kids) {
      positionSubtree(k, childCursor);
      childCursor += subtreeWidth.get(k)! + SIBLING_GAP;
    }
  };

  // Roots = orphans that own at least one primary-child subtree.
  // Satellites = orphans whose only links are to children claimed by another
  // primary parent (e.g. in-laws of a married-in spouse).
  const orphans = allUnits.filter((u) => !parentUnitOf.has(u));
  const isSatellite = (u: Unit): boolean => {
    const cs = childUnits.get(u);
    if (!cs || cs.size === 0) return false;
    return [...cs].every((c) => parentUnitOf.get(c) !== u);
  };
  const roots = orphans.filter((u) => !isSatellite(u));
  const satellites = orphans.filter((u) => isSatellite(u));

  let rootCursor = 0;
  for (const root of roots) {
    positionSubtree(root, rootCursor);
    rootCursor += subtreeWidth.get(root)! + FAMILY_GAP;
  }

  // Position satellites above (the leftmost-x of) their secondary child.
  for (const sat of satellites) {
    const cs = childUnits.get(sat);
    if (!cs || cs.size === 0) {
      sat.x = rootCursor;
      rootCursor += sat.w + FAMILY_GAP;
      continue;
    }
    const child = [...cs].sort(
      (a, b) => (a.x ?? 0) - (b.x ?? 0),
    )[0];
    sat.x = (child.x ?? 0) + child.w / 2 - sat.w / 2;
  }

  // Resolve overlaps in the TOP rank only, where roots and satellites
  // (positioned independently) can collide. Lower ranks were laid out by
  // Walker with proper SIBLING_GAP between siblings of the same parent —
  // running an indiscriminate FAMILY_GAP pass there would mis-space them.
  const topBucket = [...buckets].sort((a, b) => a.y - b.y)[0];
  if (topBucket) {
    const us = unitsByBucket.get(topBucket) ?? [];
    us.sort((a, c) => a.x - c.x);
    let prevRight = -Infinity;
    for (const u of us) {
      const minX = prevRight + FAMILY_GAP;
      if (u.x < minX) u.x = minX;
      prevRight = u.x + u.w;
    }
  }

  // For each couple unit, order members so that each is closer to their own
  // family-of-origin. Member with external parent on the left ends up on the
  // left of the couple, etc. This minimizes parent-line crossings when the
  // partner comes from a different family.
  for (const u of allUnits) {
    if (u.ids.length !== 2) continue;
    const myPrimary = parentUnitOf.get(u);
    const externalX = (memberId: string): number => {
      const ps = parentsOf.get(memberId);
      if (!ps || ps.size === 0) return myPrimary?.x ?? u.x;
      for (const pId of ps) {
        const pu = unitOf.get(pId);
        if (pu && pu !== myPrimary) return pu.x + pu.w / 2;
      }
      return myPrimary ? myPrimary.x + myPrimary.w / 2 : u.x;
    };
    u.ids.sort((a, c) => externalX(a) - externalX(c));
  }

  // Normalize: shift everything so leftmost unit starts at marginx (40).
  let minX = Infinity;
  for (const u of allUnits) minX = Math.min(minX, u.x);
  const shift = 40 - minX;
  for (const u of allUnits) u.x += shift;

  // Apply unit positions to result.
  for (const u of allUnits) {
    let x = u.x;
    for (const id of u.ids) {
      result[id] = { x, y: u.bucket.y };
      x += NODE_WIDTH + SPOUSE_GAP;
    }
  }

  return result;
}
