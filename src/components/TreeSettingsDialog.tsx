import { useState } from "react";
import {
  removeTreeMember,
  setTreeMemberRole,
  updateTreeName,
  deleteTree,
} from "../data/trees";
import { inviteByEmail, cancelEmailInvite } from "../data/invites";
import type { Tree, TreeRole } from "../types";

type Props = {
  tree: Tree;
  uid: string;
  myEmail: string | null | undefined;
  onClose: () => void;
};

export function TreeSettingsDialog({ tree, uid, myEmail, onClose }: Props) {
  const myRole = tree.memberRoles?.[uid];
  const isOwner = myRole === "owner";
  const [name, setName] = useState(tree.name);
  const [newInviteEmail, setNewInviteEmail] = useState("");
  const [newInviteRole, setNewInviteRole] = useState<TreeRole>("editor");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onAddInvite = async () => {
    setError(null);
    const email = newInviteEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      setError("メールアドレスの形式が正しくありません");
      return;
    }
    if (myEmail && email === myEmail.toLowerCase()) {
      setError("自分のメールアドレスは追加できません");
      return;
    }
    if (tree.invitedEmails?.includes(email)) {
      setError("既に招待中です");
      return;
    }
    // Only count people who are CURRENTLY in memberIds — stale memberInfo
    // entries (e.g. someone removed earlier) shouldn't block re-inviting.
    const activeMemberEmails = tree.memberIds
      .map((m) => tree.memberInfo?.[m]?.email?.toLowerCase())
      .filter((e): e is string => !!e);
    if (activeMemberEmails.includes(email)) {
      setError("既に参加済みです");
      return;
    }
    setBusy(true);
    try {
      await inviteByEmail(tree.id, email, newInviteRole);
      setNewInviteEmail("");
      setNewInviteRole("editor");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onCancelInvite = async (email: string) => {
    if (!confirm(`${email} の招待を取り消しますか？`)) return;
    await cancelEmailInvite(tree.id, email);
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

  const memberLabel = (memberUid: string): { primary: string; secondary?: string } => {
    const info = tree.memberInfo?.[memberUid];
    if (info?.email) {
      return {
        primary: info.email,
        secondary: info.displayName || undefined,
      };
    }
    if (info?.displayName) return { primary: info.displayName, secondary: memberUid };
    return { primary: memberUid };
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/30 p-4 backdrop-blur-sm animate-fade-in">
      <div className="flex max-h-[90vh] max-h-[90dvh] w-full max-w-lg animate-fade-in-up flex-col overflow-hidden rounded-xl border border-ink-line bg-paper shadow-paper-lg">
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

          {/* Members */}
          <section className="mb-7">
            <div className="mb-3 flex items-center gap-2">
              <span className="h-px w-4 flex-none bg-ink-line" />
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
                const label = memberLabel(mUid);
                return (
                  <li
                    key={mUid}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-ink-line/60 bg-paper px-3 py-2 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm text-ink">
                          {label.primary}
                        </span>
                        {isMe && (
                          <span className="flex-none rounded-sm bg-shu-soft/40 px-1.5 py-0.5 text-[10px] tracking-wider2 text-shu-deep">
                            あなた
                          </span>
                        )}
                      </div>
                      {label.secondary && (
                        <div className="truncate font-mincho text-[11px] text-ink-mute">
                          {label.secondary}
                        </div>
                      )}
                    </div>
                    <div className="ml-auto flex flex-none items-center gap-2">
                      {isOwner && !isMe && mUid !== tree.ownerId ? (
                        <select
                          value={role}
                          onChange={(e) =>
                            void onChangeRole(mUid, e.target.value as TreeRole)
                          }
                          className="input !w-auto !py-1 !text-[11px]"
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
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* Pending email invites */}
            {tree.invitedEmails && tree.invitedEmails.length > 0 && (
              <>
                <div className="mb-2 mt-4 text-[10px] font-medium uppercase tracking-widest2 text-ink-mute">
                  招待中
                </div>
                <ul className="mb-4 flex flex-col gap-1.5">
                  {tree.invitedEmails.map((email) => {
                    const role = tree.pendingRoles?.[email] ?? "editor";
                    const roleLabel =
                      role === "owner"
                        ? "オーナー"
                        : role === "viewer"
                          ? "閲覧者"
                          : "編集者";
                    return (
                      <li
                        key={email}
                        className="flex items-center gap-2 rounded-md border border-dashed border-ink-line/80 bg-washi-warm/40 px-3 py-2 text-sm"
                      >
                        <span className="flex-1 truncate text-ink-soft">
                          {email}
                        </span>
                        <span className="rounded-sm bg-washi-deep/50 px-1.5 py-0.5 text-[10px] tracking-wider2 text-ink-soft">
                          {roleLabel}
                        </span>
                        {isOwner && (
                          <button
                            type="button"
                            onClick={() => void onCancelInvite(email)}
                            className="text-[11px] text-shu hover:text-shu-deep hover:underline"
                          >
                            取消
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}

            {isOwner && (
              <div className="rounded-md border border-ink-line/60 bg-washi-warm/40 p-3">
                <label className="mb-2 block text-[10px] font-medium uppercase tracking-widest2 text-ink-mute">
                  メンバーを招待
                </label>
                <p className="mb-2 text-[11px] leading-5 text-ink-mute">
                  Google アカウントのメールアドレスを入力してください。次回そのメールでサインインすると自動的にメンバーになります。
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="email"
                    value={newInviteEmail}
                    onChange={(e) => setNewInviteEmail(e.target.value)}
                    placeholder="example@gmail.com"
                    className="input flex-1"
                  />
                  <select
                    value={newInviteRole}
                    onChange={(e) =>
                      setNewInviteRole(e.target.value as TreeRole)
                    }
                    className="input sm:w-28"
                  >
                    <option value="viewer">閲覧者</option>
                    <option value="editor">編集者</option>
                    <option value="owner">オーナー</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => void onAddInvite()}
                    disabled={busy || !newInviteEmail.trim()}
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
                <span className="h-px w-4 flex-none bg-shu/40" />
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
