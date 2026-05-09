import { useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { ja } from "date-fns/locale";
import { revertEvent, useAuditEvents } from "../data/audit.io";
import { collectRevertedIds, computeRevertPlan } from "../data/audit";
import type { AuditEvent } from "../types";

type Props = {
  treeId: string;
  uid: string;
  email?: string | null;
  displayName?: string | null;
  canEdit: boolean;
  onClose: () => void;
};

const TYPE_BADGE: Record<
  AuditEvent["type"],
  { label: string; bg: string; fg: string }
> = {
  create: { label: "追加", bg: "bg-emerald-50", fg: "text-emerald-700" },
  update: { label: "編集", bg: "bg-amber-50", fg: "text-amber-700" },
  delete: { label: "削除", bg: "bg-shu-soft/40", fg: "text-shu-deep" },
  restore: { label: "復元", bg: "bg-sky-50", fg: "text-sky-700" },
};

export function AuditHistoryDialog({
  treeId,
  uid,
  email,
  displayName,
  canEdit,
  onClose,
}: Props) {
  const { events, loading } = useAuditEvents(treeId);
  const revertedIds = collectRevertedIds(events);
  const [revertBusy, setRevertBusy] = useState<string | null>(null);
  const [revertError, setRevertError] = useState<string | null>(null);
  const [revertOk, setRevertOk] = useState<string | null>(null);

  const onRevert = async (e: AuditEvent) => {
    if (!canEdit) return;
    if (!confirm(`次の操作を元に戻しますか？\n\n${e.summary}`)) return;
    setRevertError(null);
    setRevertOk(null);
    setRevertBusy(e.id);
    try {
      await revertEvent(e, {
        uid,
        ...(email ? { email } : {}),
        ...(displayName ? { name: displayName } : {}),
      });
      setRevertOk(`${e.summary} を元に戻しました`);
    } catch (err) {
      setRevertError(err instanceof Error ? err.message : String(err));
    } finally {
      setRevertBusy(null);
    }
  };

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-ink/30 p-4 backdrop-blur-sm animate-fade-in">
      <div className="flex max-h-full w-full max-w-2xl animate-fade-in-up flex-col overflow-hidden rounded-xl border border-ink-line bg-paper shadow-paper-lg">
        <div className="flex items-center justify-between border-b border-ink-line bg-washi-warm/50 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="seal h-7 w-7 rounded-sm font-mincho text-xs">
              暦
            </span>
            <h2 className="font-mincho text-lg font-semibold tracking-wider text-ink">
              編集履歴
            </h2>
            <span className="text-xs text-ink-faint">
              {events.length > 0 && `(${events.length} 件)`}
            </span>
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

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && (
            <p className="py-8 text-center text-sm text-ink-mute">
              読み込み中…
            </p>
          )}
          {!loading && events.length === 0 && (
            <p className="py-8 text-center text-sm text-ink-mute">
              まだ編集履歴はありません
            </p>
          )}
          {revertError && (
            <p className="mb-3 border-l-2 border-shu bg-shu-soft/30 px-3 py-2 text-xs text-shu-deep">
              {revertError}
            </p>
          )}
          {revertOk && (
            <p className="mb-3 border-l-2 border-sky-500 bg-sky-50 px-3 py-2 text-xs text-sky-700">
              ✓ {revertOk}
            </p>
          )}
          {!loading && events.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {events.map((e) => (
                <EventRow
                  key={e.id}
                  event={e}
                  canEdit={canEdit}
                  alreadyReverted={revertedIds.has(e.id)}
                  busy={revertBusy === e.id}
                  onRevert={() => void onRevert(e)}
                />
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-ink-line bg-washi-warm/30 px-5 py-3 text-[11px] leading-5 text-ink-mute">
          各操作の右にある「元に戻す」で、その時点の状態に戻せます。<br />
          復元ずみの操作（同色のリンク先がある行）は再度の取り消しはできません。
        </div>
      </div>
    </div>
  );
}

function EventRow({
  event,
  canEdit,
  alreadyReverted,
  busy,
  onRevert,
}: {
  event: AuditEvent;
  canEdit: boolean;
  alreadyReverted: boolean;
  busy: boolean;
  onRevert: () => void;
}) {
  const badge = TYPE_BADGE[event.type];
  const date = new Date(event.ts);
  const tsAbsolute = format(date, "yyyy/MM/dd HH:mm", { locale: ja });
  const tsRelative = formatDistanceToNow(date, { locale: ja, addSuffix: true });
  const actor =
    event.actorName ||
    event.actorEmail ||
    `${event.actor.slice(0, 6)}…`;
  const canRevert =
    canEdit &&
    computeRevertPlan(event) !== null &&
    !event.revertOfId &&
    !alreadyReverted;

  return (
    <li className="rounded-md border border-ink-line/60 bg-paper px-3 py-2.5 transition hover:border-ink-line">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span
          className={`flex-none rounded-sm px-1.5 py-0.5 text-[10px] tracking-wider2 ${badge.bg} ${badge.fg}`}
        >
          {badge.label}
        </span>
        <span className="flex-1 truncate font-mincho text-sm text-ink">
          {event.summary}
        </span>
        {canRevert && (
          <button
            type="button"
            onClick={onRevert}
            disabled={busy}
            className="flex-none rounded-md border border-shu/30 bg-shu-soft/30 px-2.5 py-1 text-[11px] tracking-wider2 text-shu-deep transition hover:border-shu/50 hover:bg-shu-soft/50 disabled:opacity-50"
          >
            {busy ? "戻し中…" : "元に戻す"}
          </button>
        )}
        {alreadyReverted && !event.revertOfId && (
          <span className="flex-none rounded-md border border-ink-line/60 bg-washi-warm/40 px-2 py-1 text-[10px] tracking-wider2 text-ink-faint">
            戻し済
          </span>
        )}
      </div>
      <div className="mt-1 flex items-center gap-2 text-[11px] text-ink-mute">
        <span>{actor}</span>
        <span className="text-ink-faint">·</span>
        <span title={tsAbsolute}>{tsRelative}</span>
        <span className="text-ink-faint">·</span>
        <span className="font-mono text-[10px] text-ink-faint">
          {tsAbsolute}
        </span>
      </div>
    </li>
  );
}
