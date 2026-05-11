import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type NodeMouseHandler,
} from "@xyflow/react";
import { useAuth } from "../auth/AuthContext";
import { usePersons } from "../data/persons";
import { useRelationships } from "../data/relationships";
import { fetchTree } from "../data/admin";
import {
  computeAutoLayout,
  NODE_WIDTH,
  NODE_HEIGHT,
} from "../layout/treeLayout";
import { PersonNode } from "../components/PersonNode";
import { CoupleNode } from "../components/CoupleNode";
import { ParentEdge } from "../components/ParentEdge";
import { SpouseEdge } from "../components/SpouseEdge";
import { PersonDetailPanel } from "../components/PersonDetailPanel";
import type { Actor } from "../data/audit";
import type { Tree } from "../types";

const nodeTypes = { person: PersonNode, couple: CoupleNode };
const edgeTypes = { parent: ParentEdge, spouse: SpouseEdge };

export function AdminTreeViewPage() {
  return (
    <ReactFlowProvider>
      <AdminTreeViewInner />
    </ReactFlowProvider>
  );
}

function AdminTreeViewInner() {
  const { treeId } = useParams<{ treeId: string }>();
  const { user, logout } = useAuth();
  const [tree, setTree] = useState<Tree | null>(null);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const actor: Actor = useMemo(
    () => ({
      uid: user!.uid,
      ...(user?.email ? { email: user.email } : {}),
      ...(user?.displayName ? { name: user.displayName } : {}),
    }),
    [user],
  );

  useEffect(() => {
    if (!treeId) return;
    let cancelled = false;
    fetchTree(treeId)
      .then((t) => {
        if (cancelled) return;
        setTree(t);
        if (!t) setTreeError("家系図が見つかりません");
      })
      .catch((e) => {
        if (cancelled) return;
        setTreeError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [treeId]);

  const { persons } = usePersons(treeId);
  const { relationships } = useRelationships(treeId);

  const autoPositions = useMemo(
    () => computeAutoLayout(persons, relationships),
    [persons, relationships],
  );

  const nodes = useMemo<Node[]>(() => {
    return persons.map((p) => {
      const pos = autoPositions[p.id] ?? { x: 0, y: 0 };
      return {
        id: p.id,
        type: "person",
        position: pos,
        data: { person: p, kinship: null, showAge: false },
        draggable: false,
        selected: p.id === selectedId,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        style: { width: NODE_WIDTH, height: NODE_HEIGHT },
      };
    });
  }, [persons, autoPositions, selectedId]);

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
    const childToParents = new Map<string, Set<string>>();
    for (const r of relationships) {
      if (r.type !== "parent") continue;
      if (!ids.has(r.from) || !ids.has(r.to)) continue;
      if (!childToParents.has(r.to)) childToParents.set(r.to, new Set());
      childToParents.get(r.to)!.add(r.from);
    }
    for (const [childId, parentIds] of childToParents.entries()) {
      const handled = new Set<string>();
      for (const pid of parentIds) {
        if (handled.has(pid)) continue;
        const cId = coupleOfPerson.get(pid);
        if (cId) {
          const couple = couples.find((c) => c.id === cId);
          const partner = couple?.a === pid ? couple?.b : couple?.a;
          if (partner && parentIds.has(partner)) {
            out.push({
              id: `parent:${cId}->${childId}`,
              source: cId,
              target: childId,
              type: "parent",
              style: { stroke: "#3F3A36", strokeWidth: 1.5, opacity: 0.85 },
            });
            handled.add(pid);
            handled.add(partner);
            continue;
          }
        }
        out.push({
          id: `parent:${pid}->${childId}`,
          source: pid,
          target: childId,
          type: "parent",
          style: { stroke: "#3F3A36", strokeWidth: 1.5, opacity: 0.85 },
        });
        handled.add(pid);
      }
    }
    return out;
  }, [relationships, persons, couples, coupleOfPerson]);

  const onNodeClick = useCallback<NodeMouseHandler>((_, node) => {
    if (node.id.startsWith("couple:")) return;
    setSelectedId(node.id);
  }, []);
  const onPaneClick = useCallback(() => setSelectedId(null), []);

  const selected = persons.find((p) => p.id === selectedId) ?? null;

  return (
    <div className="relative flex h-screen h-svh flex-col overflow-hidden">
      <header className="z-10 flex h-14 flex-none items-center gap-3 border-b border-ink-line bg-paper/95 px-3 backdrop-blur-sm sm:px-5">
        <Link to="/admin" className="btn-line !py-1.5 text-xs sm:text-sm">
          ← 管理画面
        </Link>
        <div className="h-6 w-px bg-ink-line" />
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="seal h-7 w-7 rounded-sm text-xs font-semibold">
            閲
          </span>
          <span className="truncate font-mincho text-lg font-semibold tracking-wider text-ink">
            {tree?.name ?? "(読み込み中…)"}
          </span>
          <span className="rounded-sm bg-ink/5 px-1.5 py-0.5 font-mono text-[10px] text-ink-mute">
            read-only
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2.5">
          <span className="text-[11px] text-ink-mute">
            人物 {persons.length} 件 / 関係 {relationships.length} 件
          </span>
          {user?.photoURL && (
            <img
              src={user.photoURL}
              alt=""
              referrerPolicy="no-referrer"
              className="h-8 w-8 flex-none rounded-full ring-1 ring-ink-line"
            />
          )}
          <button
            type="button"
            onClick={() => void logout()}
            className="btn-line !py-1.5 text-xs sm:text-sm"
            title="ログアウト"
          >
            ログアウト
          </button>
        </div>
      </header>
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <div className="relative h-full min-w-0 flex-1">
          {treeError ? (
            <div className="flex h-full items-center justify-center">
              <div className="rounded-md border-l-2 border-shu bg-paper px-4 py-3 text-sm text-shu-deep shadow-paper-lg">
                {treeError}
              </div>
            </div>
          ) : (
            <ReactFlow
              nodes={allNodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onNodeClick={onNodeClick}
              onPaneClick={onPaneClick}
              fitView
              minZoom={0.2}
              maxZoom={2}
              proOptions={{ hideAttribution: true }}
              nodesDraggable={false}
              nodesConnectable={false}
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
          )}
        </div>
        {selected && treeId && (
          <PersonDetailPanel
            treeId={treeId}
            person={selected}
            allPersons={persons}
            relationships={relationships}
            canEdit={false}
            actor={actor}
            selfPersonId={null}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
    </div>
  );
}
