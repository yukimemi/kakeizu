import type { Person, Relationship } from "../types";

// Movement along the family graph during BFS:
//   "p" = step up to a parent
//   "c" = step down to a child
//   "s" = step sideways to a spouse
type Move = "p" | "c" | "s";

type Adjacency = Record<string, Array<{ to: string; kind: Move }>>;

function buildAdjacency(rels: Relationship[]): Adjacency {
  const adj: Adjacency = {};
  const push = (from: string, to: string, kind: Move) => {
    if (!adj[from]) adj[from] = [];
    adj[from].push({ to, kind });
  };
  for (const r of rels) {
    if (r.type === "parent") {
      // r.from is the parent of r.to
      push(r.from, r.to, "c");
      push(r.to, r.from, "p");
    } else if (r.type === "spouse") {
      push(r.from, r.to, "s");
      push(r.to, r.from, "s");
    }
  }
  return adj;
}

function shortestPath(
  fromId: string,
  toId: string,
  adj: Adjacency,
): Move[] | null {
  if (fromId === toId) return [];
  const visited = new Set<string>([fromId]);
  const queue: { id: string; path: Move[] }[] = [{ id: fromId, path: [] }];
  while (queue.length > 0) {
    const { id, path } = queue.shift()!;
    for (const next of adj[id] ?? []) {
      if (visited.has(next.to)) continue;
      const newPath = [...path, next.kind];
      if (next.to === toId) return newPath;
      visited.add(next.to);
      queue.push({ id: next.to, path: newPath });
    }
  }
  return null;
}

const ANCESTOR_M = ["父", "祖父", "曾祖父", "高祖父"];
const ANCESTOR_F = ["母", "祖母", "曾祖母", "高祖母"];
const DESCENDANT = ["子", "孫", "曾孫", "玄孫"];

function ancestorLabel(steps: number, gender?: Person["gender"]): string {
  const arr = gender === "female" ? ANCESTOR_F : ANCESTOR_M;
  return arr[Math.min(steps - 1, arr.length - 1)] ?? "祖先";
}

function descendantLabel(steps: number, gender?: Person["gender"]): string {
  if (steps === 1) {
    if (gender === "female") return "娘";
    if (gender === "male") return "息子";
    return "子";
  }
  return DESCENDANT[Math.min(steps - 1, DESCENDANT.length - 1)] ?? "子孫";
}

function siblingLabel(self: Person, sibling: Person): string {
  const olderThanSelf =
    self.birthDate && sibling.birthDate
      ? sibling.birthDate < self.birthDate
      : null;
  if (olderThanSelf == null) {
    if (sibling.gender === "male") return "兄弟";
    if (sibling.gender === "female") return "姉妹";
    return "きょうだい";
  }
  if (sibling.gender === "male") return olderThanSelf ? "兄" : "弟";
  if (sibling.gender === "female") return olderThanSelf ? "姉" : "妹";
  return olderThanSelf ? "年上のきょうだい" : "年下のきょうだい";
}

function pathToLabel(
  path: Move[],
  self: Person,
  target: Person,
): string {
  if (path.length === 0) return "自分";

  const allAncestor = path.every((m) => m === "p");
  const allDescendant = path.every((m) => m === "c");

  if (allAncestor) return ancestorLabel(path.length, target.gender);
  if (allDescendant) return descendantLabel(path.length, target.gender);

  // single spouse step
  if (path.length === 1 && path[0] === "s") return "配偶者";

  // sibling: 1 up + 1 down (shared parent)
  if (path.length === 2 && path[0] === "p" && path[1] === "c") {
    return siblingLabel(self, target);
  }

  // uncle / aunt: 2 up + 1 down (parent's sibling)
  if (path.length === 3 && path[0] === "p" && path[1] === "p" && path[2] === "c") {
    if (target.gender === "female") return "おば";
    if (target.gender === "male") return "おじ";
    return "おじ・おば";
  }

  // niece / nephew: 1 up + 2 down (sibling's child)
  if (path.length === 3 && path[0] === "p" && path[1] === "c" && path[2] === "c") {
    if (target.gender === "female") return "姪";
    if (target.gender === "male") return "甥";
    return "甥・姪";
  }

  // cousin: 2 up + 2 down (grandparent's grandchild via different child)
  if (
    path.length === 4 &&
    path[0] === "p" &&
    path[1] === "p" &&
    path[2] === "c" &&
    path[3] === "c"
  ) {
    return "いとこ";
  }

  // spouse's parent → 義父 / 義母
  if (path.length === 2 && path[0] === "s" && path[1] === "p") {
    if (target.gender === "female") return "義母";
    if (target.gender === "male") return "義父";
    return "義理の親";
  }

  // child's spouse → 婿 / 嫁
  if (path.length === 2 && path[0] === "c" && path[1] === "s") {
    if (target.gender === "female") return "嫁";
    if (target.gender === "male") return "婿";
    return "子の配偶者";
  }

  // sibling's spouse / spouse's sibling → 義兄弟・義姉妹
  if (
    (path.length === 3 && path[0] === "p" && path[1] === "c" && path[2] === "s") ||
    (path.length === 3 && path[0] === "s" && path[1] === "p" && path[2] === "c")
  ) {
    if (target.gender === "female") return "義姉妹";
    if (target.gender === "male") return "義兄弟";
    return "義きょうだい";
  }

  // Anything else that crosses a spouse edge — generic in-law fall-back.
  if (path.includes("s")) return "親戚";

  // Anything else blood-related but unnamed (e.g. great-uncle, second cousin)
  return "親族";
}

/**
 * Compute the Japanese kinship label `target` carries when viewed from
 * `self`'s perspective, using the family graph encoded in `relationships`.
 * Returns `null` if no path exists between the two.
 */
export function findKinship(
  selfId: string,
  targetId: string,
  persons: Person[],
  relationships: Relationship[],
): string | null {
  const self = persons.find((p) => p.id === selfId);
  const target = persons.find((p) => p.id === targetId);
  if (!self || !target) return null;
  const adj = buildAdjacency(relationships);
  const path = shortestPath(selfId, targetId, adj);
  if (path === null) return null;
  return pathToLabel(path, self, target);
}
