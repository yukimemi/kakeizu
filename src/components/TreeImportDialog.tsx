import { useEffect, useMemo, useState } from "react";
import {
  applyImportActions,
  diffPersons,
  fetchTreePersons,
  type ImportAction,
} from "../data/import";
import type { Person, Tree } from "../types";

type Props = {
  destTree: Tree;
  trees: Tree[];
  onClose: () => void;
};

type Status =
  | { kind: "new" }
  | { kind: "synced"; destId: string }
  | { kind: "drifted"; destId: string; diffs: string[] };

export function TreeImportDialog({ destTree, trees, onClose }: Props) {
  const otherTrees = trees.filter((t) => t.id !== destTree.id);
  const [sourceTreeId, setSourceTreeId] = useState<string>(
    otherTrees[0]?.id ?? "",
  );
  const [sourcePersons, setSourcePersons] = useState<Person[]>([]);
  const [destPersons, setDestPersons] = useState<Person[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [includeRels, setIncludeRels] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    created: number;
    resynced: number;
    copiedRelationships: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load source + dest persons whenever source changes
  useEffect(() => {
    if (!sourceTreeId) {
      setSourcePersons([]);
      setDestPersons([]);
      return;
    }
    setLoading(true);
    setSelectedIds(new Set());
    setResult(null);
    Promise.all([fetchTreePersons(sourceTreeId), fetchTreePersons(destTree.id)])
      .then(([src, dst]) => {
        src.sort((a, b) => {
          const ba = a.birthDate ?? "";
          const bb = b.birthDate ?? "";
          if (ba !== bb) return ba.localeCompare(bb);
          return `${a.lastName}${a.firstName}`.localeCompare(
            `${b.lastName}${b.firstName}`,
          );
        });
        setSourcePersons(src);
        setDestPersons(dst);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [sourceTreeId, destTree.id]);

  // For each source person, derive its status in the dest tree.
  const statusBySource = useMemo(() => {
    const destBySource = new Map<string, Person>();
    for (const d of destPersons) {
      if (d.importedFromId) destBySource.set(d.importedFromId, d);
    }
    const out = new Map<string, Status>();
    for (const sp of sourcePersons) {
      const ex = destBySource.get(sp.id);
      if (!ex) {
        out.set(sp.id, { kind: "new" });
      } else {
        const diffs = diffPersons(sp, ex);
        if (diffs.length === 0) {
          out.set(sp.id, { kind: "synced", destId: ex.id });
        } else {
          out.set(sp.id, { kind: "drifted", destId: ex.id, diffs });
        }
      }
    }
    return out;
  }, [sourcePersons, destPersons]);

  // Selectable = not "synced" (synced rows are locked).
  const selectableIds = useMemo(
    () =>
      sourcePersons
        .filter((p) => statusBySource.get(p.id)?.kind !== "synced")
        .map((p) => p.id),
    [sourcePersons, statusBySource],
  );

  const toggle = (id: string) => {
    if (statusBySource.get(id)?.kind === "synced") return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected =
    selectableIds.length > 0 && selectedIds.size === selectableIds.length;
  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(selectableIds));
  };

  const counts = useMemo(() => {
    let toCreate = 0;
    let toResync = 0;
    for (const id of selectedIds) {
      const s = statusBySource.get(id);
      if (s?.kind === "new") toCreate++;
      else if (s?.kind === "drifted") toResync++;
    }
    return { toCreate, toResync };
  }, [selectedIds, statusBySource]);

  const onImport = async () => {
    if (!sourceTreeId || selectedIds.size === 0) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const actions: ImportAction[] = [];
      for (const id of selectedIds) {
        const s = statusBySource.get(id);
        if (!s) continue;
        if (s.kind === "new") actions.push({ kind: "create", sourceId: id });
        else if (s.kind === "drifted")
          actions.push({ kind: "resync", sourceId: id, destId: s.destId });
      }
      const r = await applyImportActions({
        sourceTreeId,
        destTreeId: destTree.id,
        actions,
        includeRelationships: includeRels,
      });
      setResult({
        created: r.created,
        resynced: r.resynced,
        copiedRelationships: r.copiedRelationships,
      });
      setSelectedIds(new Set());
      // Re-fetch dest persons so freshly-imported rows flip to "synced".
      setDestPersons(await fetchTreePersons(destTree.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-x-0 top-0 z-40 flex h-svh items-center justify-center bg-ink/30 p-4 backdrop-blur-sm animate-fade-in">
      <div className="flex max-h-[90vh] max-h-[90svh] w-full max-w-xl animate-fade-in-up flex-col overflow-hidden rounded-xl border border-ink-line bg-paper shadow-paper-lg">
        <div className="flex items-center justify-between border-b border-ink-line bg-washi-warm/50 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="seal h-7 w-7 rounded-sm font-mincho text-xs">
              移
            </span>
            <h2 className="font-mincho text-lg font-semibold tracking-wider text-ink">
              他の家系図から人物をインポート
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-ink-mute transition hover:bg-washi hover:text-ink"
            aria-label="閉じる"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col gap-3 border-b border-ink-line px-5 py-4">
          <p className="border-l-2 border-shu/40 bg-shu-soft/15 px-3 py-2 text-xs leading-5 text-ink-soft">
            <span className="font-mincho font-semibold text-ink">
              {destTree.name}
            </span>{" "}
            へコピーします。元のツリーは変更されません。
          </p>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-widest2 text-ink-mute">
              元のツリー
            </span>
            <select
              value={sourceTreeId}
              onChange={(e) => setSourceTreeId(e.target.value)}
              className="input font-mincho"
              disabled={otherTrees.length === 0}
            >
              {otherTrees.length === 0 ? (
                <option value="">他に家系図がありません</option>
              ) : (
                otherTrees.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))
              )}
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs text-ink-soft">
            <input
              type="checkbox"
              checked={includeRels}
              onChange={(e) => setIncludeRels(e.target.checked)}
              className="accent-shu"
            />
            選択した人物同士のつながり（親子・配偶者）も一緒にコピー
          </label>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="text-center text-sm tracking-wider2 text-ink-mute">
              読み込み中...
            </div>
          ) : sourcePersons.length === 0 ? (
            <div className="text-center text-sm italic text-ink-faint">
              選択できる人物がありません
            </div>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={toggleAll}
                  className="font-medium tracking-wider2 text-shu hover:text-shu-deep hover:underline"
                  disabled={selectableIds.length === 0}
                >
                  {allSelected ? "全解除" : "全選択（同期済み除く）"}
                </button>
                <span className="text-ink-mute">
                  {selectedIds.size} 選択 · 新規{" "}
                  <span className="font-medium text-ink">
                    {counts.toCreate}
                  </span>{" "}
                  · 再同期{" "}
                  <span className="font-medium text-ink">
                    {counts.toResync}
                  </span>
                </span>
              </div>
              <ul className="flex flex-col gap-1">
                {sourcePersons.map((p) => {
                  const status = statusBySource.get(p.id);
                  const selected = selectedIds.has(p.id);
                  const isSynced = status?.kind === "synced";
                  return (
                    <li key={p.id}>
                      <label
                        className={`flex items-center gap-3 rounded-md border px-3 py-2 text-sm transition ${
                          isSynced
                            ? "cursor-not-allowed border-transparent bg-washi-deep/30 text-ink-faint"
                            : selected
                              ? "cursor-pointer border-shu/30 bg-shu-soft/25 text-ink"
                              : "cursor-pointer border-ink-line/60 bg-paper hover:border-ink-line"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          disabled={isSynced}
                          onChange={() => toggle(p.id)}
                          className="flex-none accent-shu"
                        />
                        <span className="flex-1 truncate font-mincho">
                          {p.lastName} {p.firstName}
                          {(p.lastNameKana || p.firstNameKana) && (
                            <span className="ml-2 text-xs font-sans text-ink-mute">
                              {p.lastNameKana} {p.firstNameKana}
                            </span>
                          )}
                        </span>
                        {p.birthDate && (
                          <span className="flex-none font-mono text-[11px] text-ink-mute">
                            {p.birthDate}
                          </span>
                        )}
                        {status?.kind === "synced" && (
                          <span className="flex-none rounded-sm bg-washi-deep/60 px-1.5 py-0.5 text-[10px] tracking-wider2 text-ink-mute">
                            同期済
                          </span>
                        )}
                        {status?.kind === "drifted" && (
                          <span
                            className="flex-none rounded-sm bg-gold-soft/60 px-1.5 py-0.5 text-[10px] tracking-wider2 text-gold-deep"
                            title={`差分: ${status.diffs.join(", ")}`}
                          >
                            差分 {status.diffs.length}
                          </span>
                        )}
                        {status?.kind === "new" && (
                          <span className="flex-none rounded-sm bg-shu-soft/60 px-1.5 py-0.5 text-[10px] tracking-wider2 text-shu-deep">
                            新規
                          </span>
                        )}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {result && (
            <div className="mt-4 rounded-md border-l-2 border-shu bg-shu-soft/25 px-3 py-2 text-sm text-shu-deep">
              ✓ 新規 {result.created} · 再同期 {result.resynced} · つながり{" "}
              {result.copiedRelationships}
            </div>
          )}
          {error && (
            <div className="mt-4 rounded-md border-l-2 border-shu bg-shu-soft/30 px-3 py-2 text-xs text-shu-deep">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-ink-line bg-washi-warm/40 px-5 py-3">
          <button type="button" onClick={onClose} className="btn-line">
            閉じる
          </button>
          <button
            type="button"
            onClick={() => void onImport()}
            disabled={busy || selectedIds.size === 0 || !sourceTreeId}
            className="btn-shu"
          >
            {busy
              ? "実行中..."
              : `実行（新規 ${counts.toCreate} + 再同期 ${counts.toResync}）`}
          </button>
        </div>
      </div>
    </div>
  );
}
