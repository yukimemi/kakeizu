import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  applyNodeChanges,
  type Node,
  type Edge,
  type NodeChange,
  type NodeMouseHandler,
} from "@xyflow/react";
import { useAuth } from "../auth/AuthContext";
import { useTrees, createTree, backfillSelfMemberInfo } from "../data/trees";
import { usePersons, createPerson } from "../data/persons";
import { useRelationships } from "../data/relationships";
import {
  computeAutoLayout,
  NODE_WIDTH,
  NODE_HEIGHT,
} from "../layout/treeLayout";
import { PersonNode } from "../components/PersonNode";
import { CoupleNode } from "../components/CoupleNode";
import { ParentEdge } from "../components/ParentEdge";
import { SpouseEdge } from "../components/SpouseEdge";
import { Toolbar } from "../components/Toolbar";
import { PersonDetailPanel } from "../components/PersonDetailPanel";
import { TreeSettingsDialog } from "../components/TreeSettingsDialog";
import { TreeImportDialog } from "../components/TreeImportDialog";
import { AuditHistoryDialog } from "../components/AuditHistoryDialog";
import { SearchDialog } from "../components/SearchDialog";
import { BirthdaysDialog } from "../components/BirthdaysDialog";
import { TimelineDialog } from "../components/TimelineDialog";
import { SelfPickerDialog } from "../components/SelfPickerDialog";
import { exportTreeAsPdf, exportTreeAsPng } from "../lib/export";
import { findKinship } from "../lib/kinship";
import { getSelfPersonId, setSelfPersonId } from "../lib/selfPerson";
import { getShowAge, setShowAge } from "../lib/displayPrefs";
import type { Actor } from "../data/audit";

const nodeTypes = { person: PersonNode, couple: CoupleNode };
const edgeTypes = { parent: ParentEdge, spouse: SpouseEdge };

export function TreePage() {
  return (
    <ReactFlowProvider>
      <TreePageInner />
    </ReactFlowProvider>
  );
}

const lastTreeKey = (uid: string) => `kakeizu.lastTreeId.${uid}`;

function TreePageInner() {
  const { user } = useAuth();
  const uid = user!.uid;
  const { trees, loading: treesLoading } = useTrees(uid);
  const [currentTreeId, setCurrentTreeIdRaw] = useState<string | null>(null);
  const setCurrentTreeId = (id: string | null) => {
    setCurrentTreeIdRaw(id);
    try {
      if (id) localStorage.setItem(lastTreeKey(uid), id);
      else localStorage.removeItem(lastTreeKey(uid));
    } catch {
      // ignore — localStorage may be disabled
    }
  };
  const [showSettings, setShowSettings] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showBirthdays, setShowBirthdays] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [showSelfPicker, setShowSelfPicker] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const flowWrapperRef = useRef<HTMLDivElement>(null);

  const [selfPersonId, setSelfPersonIdState] = useState<string | null>(null);
  // Lazy init from localStorage so we don't add a setState-in-effect call.
  // uid is stable for the auth session, so re-reading on uid change is unneeded.
  const [showAge, setShowAgeState] = useState<boolean>(() => getShowAge(uid));

  const toggleShowAge = useCallback(() => {
    setShowAgeState((cur) => {
      const next = !cur;
      setShowAge(uid, next);
      return next;
    });
  }, [uid]);

  const actor: Actor = {
    uid,
    ...(user?.email ? { email: user.email } : {}),
    ...(user?.displayName ? { name: user.displayName } : {}),
  };

  const [autoCreateError, setAutoCreateError] = useState<string | null>(null);
  const autoCreateAttempted = useRef(false);
  // Auto-create a default tree if user has none, and auto-select first tree.
  useEffect(() => {
    if (treesLoading) return;
    if (trees.length > 0) {
      // Reset the auto-create guard so that if the user later deletes their
      // last tree, a new default is recreated rather than leaving them stuck.
      autoCreateAttempted.current = false;
      if (!currentTreeId || !trees.some((t) => t.id === currentTreeId)) {
        // Pick order: localStorage memory > own oldest > trees[0]
        let pick: string | null = null;
        try {
          const stored = localStorage.getItem(lastTreeKey(uid));
          if (stored && trees.some((t) => t.id === stored)) pick = stored;
        } catch {
          // ignore
        }
        if (!pick) {
          // toMillis safely; fall back to 0 for missing/local-only writes
          const ts = (v: unknown): number => {
            if (
              v &&
              typeof v === "object" &&
              "toMillis" in (v as object) &&
              typeof (v as { toMillis: () => number }).toMillis === "function"
            ) {
              return (v as { toMillis: () => number }).toMillis();
            }
            return 0;
          };
          const owned = trees
            .filter((t) => t.memberRoles?.[uid] === "owner")
            .sort((a, b) => ts(a.createdAt) - ts(b.createdAt));
          if (owned.length > 0) pick = owned[0].id;
          else pick = trees[0].id;
        }
        setCurrentTreeId(pick);
      }
      return;
    }
    // trees.length === 0
    if (autoCreateAttempted.current) return;
    autoCreateAttempted.current = true;
    setCurrentTreeId(null);
    createTree(uid, "わたしの家系図", {
      email: user!.email,
      displayName: user!.displayName,
    }).catch((e) => {
      console.error("[trees] auto-create failed", e);
      setAutoCreateError(e instanceof Error ? e.message : String(e));
      autoCreateAttempted.current = false;
    });
  }, [trees, treesLoading, currentTreeId, uid]);

  const treeId = currentTreeId ?? undefined;
  const { persons } = usePersons(treeId);
  const { relationships } = useRelationships(treeId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const rf = useReactFlow();
  const didFitRef = useRef(false);

  // Reset fit when switching trees so the next non-empty load re-centers.
  useEffect(() => {
    didFitRef.current = false;
    setSelectedId(null);
  }, [currentTreeId]);

  const currentTree = trees.find((t) => t.id === currentTreeId) ?? null;
  const myRole = currentTree?.memberRoles?.[uid];
  const canEdit = myRole === "owner" || myRole === "editor";

  // Backfill our own memberInfo entry so older trees (created before the
  // email-invite feature) display the email/displayName instead of a uid.
  useEffect(() => {
    if (!currentTree || !user?.email) return;
    const cur = currentTree.memberInfo?.[uid];
    const wantedEmail = user.email;
    const wantedName = user.displayName ?? "";
    if (cur?.email === wantedEmail && cur?.displayName === wantedName) return;
    void backfillSelfMemberInfo(
      currentTree.id,
      uid,
      wantedEmail,
      wantedName,
    ).catch((e) =>
      console.warn("[trees] memberInfo backfill failed", e),
    );
  }, [currentTree, uid, user]);

  useEffect(() => {
    if (didFitRef.current) return;
    if (persons.length === 0) return;
    const t = setTimeout(() => {
      rf.fitView({ padding: 0.25, duration: 300 });
      didFitRef.current = true;
    }, 50);
    return () => clearTimeout(t);
  }, [persons.length, rf]);

  const autoPositions = useMemo(
    () => computeAutoLayout(persons, relationships),
    [persons, relationships],
  );

  // React Flow needs a managed nodes state (so dimension/select changes flow
  // through applyNodeChanges into the internal store). We sync from Firestore
  // (persons) → local nodes whenever persons or computed positions change,
  // preserving any internal fields React Flow has set (e.g., measured).
  const [nodes, setNodes] = useState<Node[]>([]);
  useEffect(() => {
    setNodes((prev) => {
      const prevById = new Map(prev.map((n) => [n.id, n]));
      return persons.map((p) => {
        const existing = prevById.get(p.id);
        const pos = autoPositions[p.id] ?? { x: 0, y: 0 };
        const kinship = selfPersonId
          ? selfPersonId === p.id
            ? "あなた"
            : findKinship(selfPersonId, p.id, persons, relationships)
          : null;
        return {
          ...(existing ?? {}),
          id: p.id,
          type: "person",
          position: pos,
          data: { person: p, kinship, showAge },
          draggable: false,
          selected: p.id === selectedId,
          width: NODE_WIDTH,
          height: NODE_HEIGHT,
          style: { width: NODE_WIDTH, height: NODE_HEIGHT },
        };
      });
    });
  }, [persons, autoPositions, selectedId, selfPersonId, relationships, showAge]);

  // Build couple lookup and synthetic couple connector nodes.
  const { couples, coupleOfPerson } = useMemo(() => {
    const ids = new Set(persons.map((p) => p.id));
    const inCouple = new Map<string, string>();
    const list: Array<{ a: string; b: string; id: string }> = [];
    for (const r of relationships) {
      if (r.type !== "spouse") continue;
      if (!ids.has(r.from) || !ids.has(r.to)) continue;
      if (inCouple.has(r.from) || inCouple.has(r.to)) continue;
      const a = r.from;
      const b = r.to;
      const ax = autoPositions[a]?.x ?? 0;
      const bx = autoPositions[b]?.x ?? 0;
      const left = ax <= bx ? a : b;
      const right = left === a ? b : a;
      const id = `couple:${[a, b].sort().join("|")}`;
      list.push({ a: left, b: right, id });
      inCouple.set(a, id);
      inCouple.set(b, id);
    }
    return { couples: list, coupleOfPerson: inCouple };
  }, [relationships, persons, autoPositions]);

  const coupleNodes = useMemo<Node[]>(() => {
    const out: Node[] = [];
    const byId = new Map(nodes.map((n) => [n.id, n]));
    for (const c of couples) {
      const a = byId.get(c.a);
      const b = byId.get(c.b);
      if (!a || !b) continue;
      out.push({
        id: c.id,
        type: "couple",
        position: {
          // center the 8x8 connector on the midpoint of the two spouses' centers.
          x: (a.position.x + b.position.x + NODE_WIDTH) / 2 - 4,
          y: a.position.y + NODE_HEIGHT / 2 - 4,
        },
        data: {},
        draggable: false,
        selectable: false,
        width: 8,
        height: 8,
        measured: { width: 8, height: 8 },
        style: { width: 8, height: 8 },
      });
    }
    return out;
  }, [couples, nodes]);

  const allNodes = useMemo<Node[]>(
    () => [...nodes, ...coupleNodes],
    [nodes, coupleNodes],
  );

  const edges = useMemo<Edge[]>(() => {
    const out: Edge[] = [];
    const ids = new Set(persons.map((p) => p.id));

    // Spouse / 婚姻線: traditional Japanese family-tree double line in the
    // brand 朱 color. Rendered by the custom SpouseEdge component.
    for (const c of couples) {
      out.push({
        id: `spouse:${c.id}`,
        source: c.a,
        target: c.b,
        sourceHandle: "right",
        targetHandle: "left",
        type: "spouse",
        style: { stroke: "#A52A1F", opacity: 0.9 },
      });
    }

    // Build child → parents map
    const childToParents = new Map<string, Set<string>>();
    for (const r of relationships) {
      if (r.type !== "parent") continue;
      if (!ids.has(r.from) || !ids.has(r.to)) continue;
      if (!childToParents.has(r.to)) childToParents.set(r.to, new Set());
      childToParents.get(r.to)!.add(r.from);
    }

    // Stagger smoothstep bend y between two levels, alternating across
    // parent sources sorted by x. Adjacent parents whose horizontal segments
    // would otherwise occupy the same y end up on different levels.
    const parentSourceIds = new Set<string>();
    for (const parentIds of childToParents.values()) {
      for (const pid of parentIds) {
        const cId = coupleOfPerson.get(pid);
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
    const nodeXById = new Map<string, number>();
    const nodeYById = new Map<string, number>();
    for (const n of [...nodes, ...coupleNodes]) {
      nodeXById.set(n.id, n.position.x);
      nodeYById.set(n.id, n.position.y);
    }
    // Compute x-range covered by each parent's child edges; assign explicit
    // horizontal-y levels via interval graph coloring so only parents whose
    // ranges ACTUALLY overlap get bumped to a different level. The horizontal
    // y is the actual SVG segment y (not just an offset like React Flow's
    // built-in smoothstep, which keeps horizontal at fixed mid_y).
    const rangeOf = new Map<string, { lo: number; hi: number }>();
    for (const [childId, pids] of childToParents.entries()) {
      const childX = (autoPositions[childId]?.x ?? 0) + NODE_WIDTH / 2;
      for (const pid of pids) {
        const cId = coupleOfPerson.get(pid);
        let sourceId = pid;
        if (cId) {
          const couple = couples.find((c) => c.id === cId);
          const partner = couple?.a === pid ? couple?.b : couple?.a;
          if (partner && pids.has(partner)) sourceId = cId;
        }
        const sx = nodeXById.get(sourceId) ?? 0;
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

    // For each parent unit, find the y of the parent rank's BOTTOM (i.e. the
    // bottom edge of the person nodes in that rank). This gives a consistent
    // anchor regardless of whether the source is a couple node (8px tall, sits
    // mid-person-height) or an individual person node.
    const personRankBottomOf = new Map<string, number>();
    for (const id of parentSourceIds) {
      const couple = couples.find((c) => c.id === id);
      const personIds = couple ? [couple.a, couple.b] : [id];
      let maxBottom = 0;
      for (const pid of personIds) {
        const r = autoPositions[pid];
        if (r) maxBottom = Math.max(maxBottom, r.y + NODE_HEIGHT);
      }
      personRankBottomOf.set(id, maxBottom);
    }

    // Group by person-rank bottom (effectively rank-level), then within each
    // rank greedy-color into horizontal levels.
    const byRank = new Map<number, string[]>();
    for (const id of parentSourceIds) {
      const yKey = Math.round((personRankBottomOf.get(id) ?? 0) / 10) * 10;
      if (!byRank.has(yKey)) byRank.set(yKey, []);
      byRank.get(yKey)!.push(id);
    }
    const horizYOf = new Map<string, number>();
    const BASE_GAP = 18; // small gap below the person-rank bottom
    const LEVEL_GAP = 25;
    for (const ids of byRank.values()) {
      ids.sort((a, b) => (rangeOf.get(a)?.lo ?? 0) - (rangeOf.get(b)?.lo ?? 0));
      const levelRanges: Array<Array<{ lo: number; hi: number }>> = [];
      const rankBottom = personRankBottomOf.get(ids[0]) ?? 0;
      for (const id of ids) {
        const r = rangeOf.get(id);
        if (!r) {
          horizYOf.set(id, rankBottom + BASE_GAP);
          continue;
        }
        let level = 0;
        while (level < levelRanges.length) {
          const ranges = levelRanges[level];
          const overlap = ranges.some(
            (x) => Math.max(x.lo, r.lo) < Math.min(x.hi, r.hi),
          );
          if (!overlap) break;
          level++;
        }
        if (level >= levelRanges.length) levelRanges.push([]);
        levelRanges[level].push(r);
        horizYOf.set(id, rankBottom + BASE_GAP + level * LEVEL_GAP);
      }
    }
    // Suppress unused-var lint for nodeYById which is no longer needed.
    void nodeYById;

    // Family palette — refined Japanese 和色, distinct enough to tell which
    // parent unit a line belongs to. Cycle if more parent units than colors.
    const FAMILY_COLORS = [
      "#2A416E", // 藍 indigo
      "#5F6F45", // 柳 willow green
      "#5C3F7A", // 紫 purple
      "#6E4F2D", // 黄土 ocher
      "#3F6A6E", // 浅葱 asagi
      "#8C2D33", // 茜 madder
      "#5C5347", // 鈍 mute
      "#7A5C24", // dark gold
    ];
    // Determine deterministic order so colors are stable across renders:
    // sort source ids by their rendered x.
    const colorOrderedSources = [...parentSourceIds].sort(
      (a, b) => (nodeXById.get(a) ?? 0) - (nodeXById.get(b) ?? 0),
    );
    const colorOf = new Map<string, string>();
    colorOrderedSources.forEach((id, i) => {
      colorOf.set(id, FAMILY_COLORS[i % FAMILY_COLORS.length]);
    });
    const styleFor = (sid: string) => ({
      stroke: colorOf.get(sid) ?? "#3F3A36",
      strokeWidth: 1.5,
      opacity: 0.9,
    });

    // Parent edges: from couple node when both parents are spouses, else from
    // individual parent.
    for (const [childId, parentIds] of childToParents.entries()) {
      const coupleSources = new Set<string>();
      const singletonSources: string[] = [];
      const coveredByCouple = new Set<string>();
      for (const pid of parentIds) {
        if (coveredByCouple.has(pid)) continue;
        const cId = coupleOfPerson.get(pid);
        if (cId) {
          const couple = couples.find((c) => c.id === cId);
          const partner = couple?.a === pid ? couple?.b : couple?.a;
          if (partner && parentIds.has(partner)) {
            coupleSources.add(cId);
            coveredByCouple.add(pid);
            coveredByCouple.add(partner);
            continue;
          }
        }
        singletonSources.push(pid);
      }
      for (const cid of coupleSources) {
        out.push({
          id: `parent:${cid}->${childId}`,
          source: cid,
          target: childId,
          type: "parent",
          style: styleFor(cid),
          data: { horizY: horizYOf.get(cid) },
        });
      }
      for (const pid of singletonSources) {
        out.push({
          id: `parent:${pid}->${childId}`,
          source: pid,
          target: childId,
          type: "parent",
          style: styleFor(pid),
          data: { horizY: horizYOf.get(pid) },
        });
      }
    }

    return out;
  }, [
    relationships,
    persons,
    couples,
    coupleOfPerson,
    nodes,
    coupleNodes,
    autoPositions,
  ]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    // Filter out changes for synthetic couple nodes — they're recomputed.
    const personChanges = changes.filter(
      (c) => !("id" in c && typeof c.id === "string" && c.id.startsWith("couple:")),
    );
    setNodes((nds) => applyNodeChanges(personChanges, nds));
  }, []);

  const onNodeClick = useCallback<NodeMouseHandler>((_, node) => {
    setSelectedId(node.id);
  }, []);

  const onPaneClick = useCallback(() => setSelectedId(null), []);

  useEffect(() => {
    if (!treeId) {
      setSelfPersonIdState(null);
      return;
    }
    setSelfPersonIdState(getSelfPersonId(uid, treeId));
  }, [uid, treeId]);

  const updateSelf = useCallback(
    (personId: string | null) => {
      if (!treeId) return;
      setSelfPersonId(uid, treeId, personId);
      setSelfPersonIdState(personId);
    },
    [uid, treeId],
  );

  const runExport = useCallback(
    async (kind: "png" | "pdf") => {
      const wrapper = flowWrapperRef.current;
      if (!wrapper || !currentTree) return;
      setExportError(null);
      try {
        const fn = kind === "png" ? exportTreeAsPng : exportTreeAsPdf;
        await fn(wrapper, nodes, currentTree.name);
      } catch (e) {
        console.error("[export] failed", e);
        setExportError(e instanceof Error ? e.message : String(e));
      }
    },
    [nodes, currentTree],
  );

  const handleAddPerson = async () => {
    if (!treeId) return;
    const id = await createPerson(
      treeId,
      { lastName: "新規", firstName: "人物" },
      { actor },
    );
    setSelectedId(id);
  };

  const selected = persons.find((p) => p.id === selectedId) ?? null;

  return (
    <div className="relative flex h-screen h-svh flex-col overflow-hidden">
      <Toolbar
        onAddPerson={() => void handleAddPerson()}
        trees={trees}
        currentTreeId={currentTreeId}
        onSelectTree={(id) => setCurrentTreeId(id)}
        onCreateTree={async () => {
          const name = prompt("新しい家系図の名前", "新しい家系図");
          if (!name?.trim()) return;
          const id = await createTree(uid, name.trim(), {
            email: user!.email,
            displayName: user!.displayName,
          });
          setCurrentTreeId(id);
        }}
        onOpenSettings={() => setShowSettings(true)}
        onOpenImport={() => setShowImport(true)}
        onOpenHistory={() => setShowHistory(true)}
        onOpenSearch={() => setShowSearch(true)}
        onOpenBirthdays={() => setShowBirthdays(true)}
        onOpenTimeline={() => setShowTimeline(true)}
        onExportPng={() => void runExport("png")}
        onExportPdf={() => void runExport("pdf")}
        onOpenSelfPicker={() => setShowSelfPicker(true)}
        showAge={showAge}
        onToggleShowAge={toggleShowAge}
        persons={persons}
        canImport={canEdit && trees.length >= 2}
        canAddPerson={!!treeId && canEdit}
        canSearch={!!treeId && persons.length > 0}
        canExport={!!treeId && persons.length > 0}
      />
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <div ref={flowWrapperRef} className="relative h-full min-w-0 flex-1">
          <ReactFlow
            nodes={allNodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            fitView
            minZoom={0.2}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
            nodesDraggable={false}
            panOnDrag
          >
            <Background gap={24} size={1} />
            <Controls position="bottom-right" showInteractive={false} />
            <MiniMap
              position="bottom-left"
              pannable
              zoomable
              nodeColor={() => "#94a3b8"}
              className="!hidden sm:!block"
            />
          </ReactFlow>
          {persons.length === 0 && (
            <EmptyOverlay onAdd={() => void handleAddPerson()} />
          )}
        </div>
        {selected && treeId && (
          <PersonDetailPanel
            treeId={treeId}
            person={selected}
            allPersons={persons}
            relationships={relationships}
            canEdit={canEdit}
            actor={actor}
            selfPersonId={selfPersonId}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
      {showHistory && currentTree && (
        <AuditHistoryDialog
          treeId={currentTree.id}
          uid={uid}
          email={user?.email}
          displayName={user?.displayName}
          canEdit={canEdit}
          onClose={() => setShowHistory(false)}
        />
      )}
      {showSearch && (
        <SearchDialog
          persons={persons}
          onClose={() => setShowSearch(false)}
          onPick={(id) => {
            setSelectedId(id);
            const pos = autoPositions[id];
            if (pos) {
              rf.setCenter(
                pos.x + NODE_WIDTH / 2,
                pos.y + NODE_HEIGHT / 2,
                { zoom: 1.2, duration: 400 },
              );
            }
          }}
        />
      )}
      {showBirthdays && (
        <BirthdaysDialog
          persons={persons}
          onClose={() => setShowBirthdays(false)}
          onPick={(id) => {
            setSelectedId(id);
            const pos = autoPositions[id];
            if (pos) {
              rf.setCenter(
                pos.x + NODE_WIDTH / 2,
                pos.y + NODE_HEIGHT / 2,
                { zoom: 1.2, duration: 400 },
              );
            }
          }}
        />
      )}
      {showSelfPicker && (
        <SelfPickerDialog
          persons={persons}
          currentSelfId={selfPersonId}
          onPick={(id) => updateSelf(id)}
          onClear={() => updateSelf(null)}
          onClose={() => setShowSelfPicker(false)}
        />
      )}
      {showTimeline && (
        <TimelineDialog
          persons={persons}
          onClose={() => setShowTimeline(false)}
          onPick={(id) => {
            setSelectedId(id);
            const pos = autoPositions[id];
            if (pos) {
              rf.setCenter(
                pos.x + NODE_WIDTH / 2,
                pos.y + NODE_HEIGHT / 2,
                { zoom: 1.2, duration: 400 },
              );
            }
          }}
        />
      )}
      {showSettings && currentTree && (
        <TreeSettingsDialog
          tree={currentTree}
          uid={uid}
          myEmail={user?.email}
          onClose={() => setShowSettings(false)}
        />
      )}
      {showImport && currentTree && (
        <TreeImportDialog
          destTree={currentTree}
          trees={trees}
          onClose={() => setShowImport(false)}
        />
      )}
      {autoCreateError && (
        <div className="absolute bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md border-l-2 border-shu bg-paper px-4 py-2 text-sm text-shu-deep shadow-paper-lg">
          家系図の自動作成に失敗: {autoCreateError}
        </div>
      )}
      {exportError && (
        <div className="absolute bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md border-l-2 border-shu bg-paper px-4 py-2 text-sm text-shu-deep shadow-paper-lg">
          書き出しに失敗: {exportError}
          <button
            type="button"
            onClick={() => setExportError(null)}
            className="ml-3 text-xs text-ink-mute hover:text-ink"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}

function EmptyOverlay({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="pointer-events-auto w-[360px] max-w-[90vw] animate-fade-in-up rounded-lg border border-ink-line bg-paper/95 p-8 text-center shadow-paper-lg backdrop-blur-sm">
        <span className="seal mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-sm font-mincho text-xl">
          始
        </span>
        <h2 className="mb-2 font-mincho text-2xl font-semibold tracking-wider text-ink">
          家系図を始める
        </h2>
        <p className="mx-auto mb-7 max-w-xs font-mincho text-sm leading-7 text-ink-soft">
          最初の人物を加えるところから、
          <br />
          樹は育ちはじめます。
        </p>
        <button type="button" onClick={onAdd} className="btn-shu">
          ＋ 人物を追加
        </button>
      </div>
    </div>
  );
}
