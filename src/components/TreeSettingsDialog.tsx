import { useState } from "react";
import {
  addTreeMember,
  removeTreeMember,
  setTreeMemberRole,
  updateTreeName,
  deleteTree,
} from "../data/trees";
import type { Tree, TreeRole } from "../types";

type Props = {
  tree: Tree;
  uid: string;
  onClose: () => void;
};

export function TreeSettingsDialog({ tree, uid, onClose }: Props) {
  const myRole = tree.memberRoles?.[uid];
  const isOwner = myRole === "owner";
  const [name, setName] = useState(tree.name);
  const [newMemberCode, setNewMemberCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const onCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(uid);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  const onAddMember = async () => {
    setError(null);
    const code = newMemberCode.trim();
    if (!code) return;
    if (code === uid) {
      setError("自分のコードは追加できません");
      return;
    }
    if (tree.memberIds.includes(code)) {
      setError("既にメンバーです");
      return;
    }
    setBusy(true);
    try {
      await addTreeMember(tree.id, code, "editor");
      setNewMemberCode("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onRemoveMember = async (memberUid: string) => {
    if (memberUid === tree.ownerId) {
      alert("オーナーは削除できません");
      return;
    }
    if (!confirm("このメンバーを家系図から外しますか？")) return;
    await removeTreeMember(tree.id, memberUid);
  };

  const onChangeRole = async (memberUid: string, role: TreeRole) => {
    await setTreeMemberRole(tree.id, memberUid, role);
  };

  const onRename = async () => {
    if (!name.trim() || name === tree.name) return;
    await updateTreeName(tree.id, name.trim());
  };

  const onDeleteTree = async () => {
    if (
      !confirm(
        `家系図「${tree.name}」を削除します。\n登録された全ての人物・つながりも削除されます。よろしいですか?`,
      )
    )
      return;
    setBusy(true);
    try {
      await deleteTree(tree.id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/30 p-4 backdrop-blur-sm animate-fade-in">
      <div className="flex max-h-[90vh] w-full max-w-lg animate-fade-in-up flex-col overflow-hidden rounded-xl border border-ink-line bg-paper shadow-paper-lg">
        <div className="flex items-center justify-between border-b border-ink-line bg-washi-warm/50 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="seal h-7 w-7 rounded-sm font-mincho text-xs">
              設
            </span>
            <h2 className="font-mincho text-lg font-semibold tracking-wider text-ink">
              家系図の設定
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

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {/* Name */}
          <section className="mb-7">
            <label className="mb-2 block text-[10px] font-medium uppercase tracking-widest2 text-ink-mute">
              家系図の名前
            </label>
            <div className="flex gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!isOwner}
                className="input flex-1 font-mincho text-base"
              />
              {isOwner && (
                <button
                  type="button"
                  onClick={() => void onRename()}
                  disabled={!name.trim() || name === tree.name}
                  className="btn-ink !py-2"
                >
                  保存
                </button>
              )}
            </div>
          </section>

          {/* My share code */}
          <section className="mb-7">
            <label className="mb-2 block text-[10px] font-medium uppercase tracking-widest2 text-ink-mute">
              あなたのシェアコード
            </label>
            <p className="mb-2 text-[11px] leading-5 text-ink-mute">
              他の家系図に招待してもらうとき、オーナーにこのコードを伝えてください。
            </p>
            <div className="flex gap-2">
              <input
                value={uid}
                readOnly
                className="input flex-1 font-mono text-xs"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <button
                type="button"
                onClick={() => void onCopyCode()}
                className="btn-line"
              >
                {copied ? "✓ コピー済" : "コピー"}
              </button>
            </div>
          </section>

          {/* Members */}
          <section className="mb-7">
            <div className="mb-3 flex items-center gap-2">
              <span className="h-px flex-none w-4 bg-ink-line" />
              <h3 className="font-mincho text-sm font-semibold tracking-wider text-ink-soft">
                メンバー
              </h3>
              <span className="text-xs text-ink-faint">
                ({tree.memberIds.length})
              </span>
              <span className="h-px flex-1 bg-ink-line" />
            </div>
            <ul className="mb-4 flex flex-col gap-1.5">
              {tree.memberIds.map((mUid) => {
                const role = tree.memberRoles?.[mUid] ?? "editor";
                const isMe = mUid === uid;
                const roleLabel =
                  role === "owner"
                    ? "オーナー"
                    : role === "viewer"
                      ? "閲覧者"
                      : "編集者";
                return (
                  <li
                    key={mUid}
                    className="flex items-center gap-2 rounded-md border border-ink-line/60 bg-paper px-3 py-2 text-sm"
                  >
                    <span className="flex-1 truncate font-mono text-[11px] text-ink-soft">
                      {mUid}
                      {isMe && (
                        <span className="ml-2 inline-flex items-center rounded-sm bg-shu-soft/40 px-1.5 py-0.5 font-sans text-[10px] tracking-wider2 text-shu-deep">
                          あなた
                        </span>
                      )}
                    </span>
                    {isOwner && !isMe && mUid !== tree.ownerId ? (
                      <select
                        value={role}
                        onChange={(e) =>
                          void onChangeRole(mUid, e.target.value as TreeRole)
                        }
                        className="input !py-1 !text-[11px]"
                      >
                        <option value="viewer">閲覧者</option>
                        <option value="editor">編集者</option>
                        <option value="owner">オーナー</option>
                      </select>
                    ) : (
                      <span className="rounded-sm bg-washi-deep/50 px-1.5 py-0.5 text-[10px] tracking-wider2 text-ink-soft">
                        {roleLabel}
                      </span>
                    )}
                    {isOwner && !isMe && (
                      <button
                        type="button"
                        onClick={() => void onRemoveMember(mUid)}
                        className="text-[11px] text-shu hover:text-shu-deep hover:underline"
                      >
                        外す
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            {isOwner && (
              <div className="rounded-md border border-ink-line/60 bg-washi-warm/40 p-3">
                <label className="mb-2 block text-[10px] font-medium uppercase tracking-widest2 text-ink-mute">
                  メンバー追加
                </label>
                <p className="mb-2 text-[11px] leading-5 text-ink-mute">
                  招待したい相手のシェアコードを貼り付け
                </p>
                <div className="flex gap-2">
                  <input
                    value={newMemberCode}
                    onChange={(e) => setNewMemberCode(e.target.value)}
                    placeholder="相手のシェアコード"
                    className="input flex-1 font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => void onAddMember()}
                    disabled={busy || !newMemberCode.trim()}
                    className="btn-shu !py-2"
                  >
                    招待
                  </button>
                </div>
              </div>
            )}
            {error && (
              <p className="mt-2 border-l-2 border-shu bg-shu-soft/30 px-2 py-1 text-xs text-shu-deep">
                {error}
              </p>
            )}
          </section>

          {isOwner && (
            <section className="border-t border-ink-line/60 pt-5">
              <div className="mb-3 flex items-center gap-2">
                <span className="h-px flex-none w-4 bg-shu/40" />
                <h3 className="font-mincho text-sm font-semibold tracking-wider text-shu-deep">
                  危険ゾーン
                </h3>
                <span className="h-px flex-1 bg-shu/30" />
              </div>
              <button
                type="button"
                onClick={() => void onDeleteTree()}
                disabled={busy}
                className="w-full rounded-md border border-shu/30 bg-shu-soft/30 py-2.5 text-sm font-medium tracking-wider2 text-shu-deep transition hover:border-shu/50 hover:bg-shu-soft/50 disabled:opacity-50"
              >
                この家系図を削除（人物・つながりも全削除）
              </button>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
