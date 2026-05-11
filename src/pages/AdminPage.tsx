import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import {
  useAccessConfig,
  addAllowedEmail,
  removeAllowedEmail,
  addAdminEmail,
  removeAdminEmail,
} from "../data/access";
import { useAllUsers, useAllTrees } from "../data/admin";

export function AdminPage() {
  const { user, logout } = useAuth();
  const { config, loading: accessLoading } = useAccessConfig();
  const { users, loading: usersLoading } = useAllUsers();
  const { trees, loading: treesLoading } = useAllTrees();

  return (
    <div className="flex min-h-full flex-col bg-washi pb-16">
      <header className="z-10 flex h-14 flex-none items-center gap-3 border-b border-ink-line bg-paper/95 px-3 backdrop-blur-sm sm:px-5">
        <div className="flex items-center gap-2.5">
          <span className="seal h-7 w-7 rounded-sm text-xs font-semibold">管</span>
          <span className="font-mincho text-xl font-semibold tracking-wider text-ink">
            管理画面
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2.5 sm:gap-3">
          <Link to="/" className="btn-line !py-1.5 text-xs sm:text-sm">
            ← 家系図に戻る
          </Link>
          {user?.photoURL && (
            <img
              src={user.photoURL}
              alt=""
              referrerPolicy="no-referrer"
              className="h-8 w-8 flex-none rounded-full ring-1 ring-ink-line"
            />
          )}
          <span className="hidden font-mincho text-sm text-ink-soft md:inline">
            {user?.displayName}
          </span>
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

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
        <div className="grid grid-cols-1 gap-6">
          <StatsCard
            users={users.length}
            trees={trees.length}
            admins={config?.adminEmails.length ?? 0}
            allowed={config?.allowedEmails.length ?? 0}
            loading={accessLoading || usersLoading || treesLoading}
          />
          <EmailListCard
            title="管理者"
            description="adminEmails に登録された運用者。全家系図を閲覧できます。"
            badge="管"
            emails={config?.adminEmails ?? []}
            myEmail={user?.email ?? null}
            onAdd={addAdminEmail}
            onRemove={removeAdminEmail}
            confirmRemoveText={(email) =>
              `${email} の管理者権限を取り消しますか？\nこの操作はそのユーザーから admin 権限を即時に外します。`
            }
          />
          <EmailListCard
            title="許可ユーザー"
            description="allowedEmails に登録され、書き込み可能なメールアドレス。家系図に招待されたユーザーは自動でここに入ります。"
            badge="許"
            emails={config?.allowedEmails ?? []}
            myEmail={user?.email ?? null}
            onAdd={addAllowedEmail}
            onRemove={removeAllowedEmail}
            confirmRemoveText={(email) =>
              `${email} を許可リストから外しますか？\n書き込み権限が失われます（管理者は除く）。`
            }
            highlightEmails={config?.adminEmails ?? []}
          />
          <UsersCard users={users} loading={usersLoading} trees={trees} />
          <TreesCard
            trees={trees}
            loading={treesLoading}
            users={users}
          />
        </div>
      </main>
    </div>
  );
}

function StatsCard(props: {
  users: number;
  trees: number;
  admins: number;
  allowed: number;
  loading: boolean;
}) {
  const items = [
    { label: "登録ユーザー", value: props.users },
    { label: "家系図", value: props.trees },
    { label: "管理者", value: props.admins },
    { label: "許可メール", value: props.allowed },
  ];
  return (
    <section className="rounded-lg border border-ink-line bg-paper p-5 shadow-paper">
      <h2 className="mb-4 font-mincho text-lg font-semibold tracking-wider text-ink">
        概況
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {items.map((it) => (
          <div
            key={it.label}
            className="rounded-md border border-ink-line bg-washi-warm px-4 py-3"
          >
            <div className="text-[11px] tracking-wider2 text-ink-mute">
              {it.label}
            </div>
            <div className="font-mincho text-2xl font-semibold tracking-wider text-ink">
              {props.loading ? "—" : it.value}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function EmailListCard(props: {
  title: string;
  description: string;
  badge: string;
  emails: string[];
  myEmail: string | null;
  onAdd: (email: string) => Promise<void>;
  onRemove: (email: string) => Promise<void>;
  confirmRemoveText: (email: string) => string;
  highlightEmails?: string[];
}) {
  const [newEmail, setNewEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...props.emails].sort((a, b) => a.localeCompare(b)),
    [props.emails],
  );
  const highlights = new Set((props.highlightEmails ?? []).map((e) => e.toLowerCase()));

  const onAdd = async () => {
    setError(null);
    const e = newEmail.trim().toLowerCase();
    if (!e || !e.includes("@")) {
      setError("メールアドレスの形式が正しくありません");
      return;
    }
    if (sorted.includes(e)) {
      setError("既に登録されています");
      return;
    }
    setBusy(true);
    try {
      await props.onAdd(e);
      setNewEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const onRemove = async (email: string) => {
    if (!confirm(props.confirmRemoveText(email))) return;
    setBusy(true);
    try {
      await props.onRemove(email);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-lg border border-ink-line bg-paper p-5 shadow-paper">
      <div className="mb-2 flex items-center gap-2">
        <span className="seal h-6 w-6 rounded-sm text-[11px]">
          {props.badge}
        </span>
        <h2 className="font-mincho text-lg font-semibold tracking-wider text-ink">
          {props.title}
        </h2>
        <span className="ml-auto text-xs text-ink-faint">
          {sorted.length} 件
        </span>
      </div>
      <p className="mb-4 text-xs leading-6 text-ink-mute">{props.description}</p>

      <div className="mb-4 flex flex-wrap gap-2">
        <input
          type="email"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void onAdd();
            }
          }}
          placeholder="user@example.com"
          className="input flex-1 min-w-[200px]"
          disabled={busy}
        />
        <button
          type="button"
          onClick={() => void onAdd()}
          disabled={busy || !newEmail.trim()}
          className="btn-shu text-xs sm:text-sm"
        >
          ＋ 追加
        </button>
      </div>

      {error && (
        <div className="mb-3 rounded-md border-l-2 border-shu bg-shu-soft/30 px-3 py-2 text-xs text-shu-deep">
          {error}
        </div>
      )}

      {sorted.length === 0 ? (
        <p className="text-center text-xs text-ink-faint">登録なし</p>
      ) : (
        <ul className="divide-y divide-ink-line/60">
          {sorted.map((email) => {
            const isMe = props.myEmail?.toLowerCase() === email;
            const isHighlighted = highlights.has(email);
            return (
              <li
                key={email}
                className="flex items-center justify-between gap-2 py-2"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-mono text-sm text-ink">
                    {email}
                  </span>
                  {isMe && (
                    <span className="rounded-sm bg-ink/10 px-1.5 py-0.5 text-[10px] tracking-wider2 text-ink-soft">
                      自分
                    </span>
                  )}
                  {isHighlighted && (
                    <span className="rounded-sm bg-shu/10 px-1.5 py-0.5 text-[10px] tracking-wider2 text-shu-deep">
                      管理者
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => void onRemove(email)}
                  disabled={busy}
                  className="text-xs text-ink-mute transition hover:text-shu disabled:opacity-40"
                  title="削除"
                >
                  × 削除
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function UsersCard(props: {
  users: Array<{ uid: string; email: string; displayName?: string; photoURL?: string }>;
  loading: boolean;
  trees: Array<{ id: string; memberIds: string[]; ownerId: string }>;
}) {
  const treesByUid = useMemo(() => {
    const map = new Map<string, { owned: number; member: number }>();
    for (const t of props.trees) {
      for (const uid of t.memberIds ?? []) {
        const cur = map.get(uid) ?? { owned: 0, member: 0 };
        cur.member++;
        if (t.ownerId === uid) cur.owned++;
        map.set(uid, cur);
      }
    }
    return map;
  }, [props.trees]);

  const sorted = useMemo(
    () =>
      [...props.users].sort((a, b) =>
        (a.email ?? "").localeCompare(b.email ?? ""),
      ),
    [props.users],
  );

  return (
    <section className="rounded-lg border border-ink-line bg-paper p-5 shadow-paper">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="font-mincho text-lg font-semibold tracking-wider text-ink">
          ユーザー一覧
        </h2>
        <span className="ml-auto text-xs text-ink-faint">
          {sorted.length} 人
        </span>
      </div>
      {props.loading ? (
        <p className="text-center text-xs text-ink-faint">読み込み中…</p>
      ) : sorted.length === 0 ? (
        <p className="text-center text-xs text-ink-faint">ユーザーがいません</p>
      ) : (
        <ul className="divide-y divide-ink-line/60">
          {sorted.map((u) => {
            const stats = treesByUid.get(u.uid);
            return (
              <li key={u.uid} className="flex items-center gap-3 py-2.5">
                {u.photoURL ? (
                  <img
                    src={u.photoURL}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="h-8 w-8 flex-none rounded-full ring-1 ring-ink-line"
                  />
                ) : (
                  <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-washi-deep text-xs text-ink-mute">
                    {(u.displayName ?? u.email ?? "?")[0]}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mincho text-sm text-ink">
                    {u.displayName || "(名前未設定)"}
                  </div>
                  <div className="truncate font-mono text-[11px] text-ink-mute">
                    {u.email}
                  </div>
                </div>
                <div className="hidden font-mono text-[10px] text-ink-faint sm:block">
                  uid: {u.uid.slice(0, 8)}…
                </div>
                <div className="flex-none text-right text-[11px] text-ink-soft">
                  <div>
                    所属 <span className="font-mono">{stats?.member ?? 0}</span>
                  </div>
                  <div>
                    オーナー <span className="font-mono">{stats?.owned ?? 0}</span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function TreesCard(props: {
  trees: Array<{
    id: string;
    name: string;
    ownerId: string;
    memberIds: string[];
    memberInfo?: Record<string, { email?: string; displayName?: string }>;
    createdAt?: unknown;
    updatedAt?: unknown;
  }>;
  loading: boolean;
  users: Array<{ uid: string; email: string; displayName?: string }>;
}) {
  const userByUid = useMemo(
    () => new Map(props.users.map((u) => [u.uid, u])),
    [props.users],
  );

  const sorted = useMemo(
    () => [...props.trees].sort((a, b) => a.name.localeCompare(b.name)),
    [props.trees],
  );

  const fmt = (v: unknown): string => {
    if (v && typeof v === "object" && "toDate" in (v as object)) {
      try {
        return (v as { toDate: () => Date }).toDate().toLocaleString();
      } catch {
        return "";
      }
    }
    return "";
  };

  return (
    <section className="rounded-lg border border-ink-line bg-paper p-5 shadow-paper">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="font-mincho text-lg font-semibold tracking-wider text-ink">
          家系図一覧
        </h2>
        <span className="ml-auto text-xs text-ink-faint">
          {sorted.length} 件
        </span>
      </div>
      {props.loading ? (
        <p className="text-center text-xs text-ink-faint">読み込み中…</p>
      ) : sorted.length === 0 ? (
        <p className="text-center text-xs text-ink-faint">
          家系図が存在しません
        </p>
      ) : (
        <ul className="divide-y divide-ink-line/60">
          {sorted.map((t) => {
            const ownerUser = userByUid.get(t.ownerId);
            const ownerEmail =
              ownerUser?.email ?? t.memberInfo?.[t.ownerId]?.email ?? null;
            const ownerName =
              ownerUser?.displayName ??
              t.memberInfo?.[t.ownerId]?.displayName ??
              null;
            return (
              <li key={t.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-mincho text-base font-semibold text-ink">
                      {t.name}
                    </span>
                    <span className="rounded-sm bg-ink/5 px-1.5 py-0.5 font-mono text-[10px] text-ink-mute">
                      {t.id.slice(0, 10)}…
                    </span>
                  </div>
                  <div className="mt-1 truncate text-[11px] text-ink-mute">
                    オーナー：
                    <span className="font-mincho text-ink-soft">
                      {ownerName || "(名前不明)"}
                    </span>
                    {ownerEmail && (
                      <span className="ml-1 font-mono">({ownerEmail})</span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[10px] text-ink-faint">
                    メンバー {t.memberIds.length} 人
                    {fmt(t.createdAt) && ` · 作成 ${fmt(t.createdAt)}`}
                    {fmt(t.updatedAt) && ` · 更新 ${fmt(t.updatedAt)}`}
                  </div>
                </div>
                <Link
                  to={`/admin/tree/${t.id}`}
                  className="btn-line !py-1.5 text-xs"
                >
                  閲覧 →
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
