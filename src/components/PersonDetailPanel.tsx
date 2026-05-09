import { useEffect, useState } from "react";
import type { Person, Relationship } from "../types";
import { PersonForm } from "./PersonForm";
import { softDeletePerson, updatePerson } from "../data/persons";
import {
  createRelationship,
  softDeleteRelationship,
} from "../data/relationships";
import type { Actor } from "../data/audit";

type Props = {
  treeId: string;
  person: Person;
  allPersons: Person[];
  relationships: Relationship[];
  canEdit: boolean;
  actor: Actor;
  onClose: () => void;
};

const fullName = (p: Person | undefined): string =>
  p ? `${p.lastName} ${p.firstName}` : "";

export function PersonDetailPanel({
  treeId,
  person,
  allPersons,
  relationships,
  canEdit,
  actor,
  onClose,
}: Props) {
  const [tab, setTab] = useState<"info" | "relations">("info");
  const [saveStatus, setSaveStatus] = useState<
    { ok: true; at: number } | { ok: false; error: string } | null
  >(null);

  // Auto-clear the success chip after a couple of seconds; errors stick
  // around so the user can read them.
  useEffect(() => {
    if (!saveStatus || !saveStatus.ok) return;
    const t = setTimeout(() => setSaveStatus(null), 2500);
    return () => clearTimeout(t);
  }, [saveStatus]);

  // Different person opened → reset any lingering save chip.
  useEffect(() => {
    setSaveStatus(null);
  }, [person.id]);

  const parents = relationships
    .filter((r) => r.type === "parent" && r.to === person.id)
    .map((r) => ({
      rel: r,
      person: allPersons.find((p) => p.id === r.from),
    }))
    .filter((x) => x.person);
  const children = relationships
    .filter((r) => r.type === "parent" && r.from === person.id)
    .map((r) => ({
      rel: r,
      person: allPersons.find((p) => p.id === r.to),
    }))
    .filter((x) => x.person);
  const spouses = relationships
    .filter(
      (r) => r.type === "spouse" && (r.from === person.id || r.to === person.id),
    )
    .map((r) => ({
      rel: r,
      person: allPersons.find(
        (p) => p.id === (r.from === person.id ? r.to : r.from),
      ),
    }))
    .filter((x) => x.person);

  const nameOf = (id: string): string => {
    const p = allPersons.find((x) => x.id === id);
    return fullName(p);
  };

  const handleDelete = async () => {
    if (
      !confirm(
        `${fullName(person)} を削除しますか？\n削除した内容は「編集履歴」から元に戻すことができます。`,
      )
    )
      return;
    const related = relationships.filter(
      (r) => r.from === person.id || r.to === person.id,
    );
    await softDeletePerson(person, actor, related, nameOf);
    onClose();
  };

  return (
    <aside className="absolute inset-0 z-20 flex h-full w-full flex-none animate-fade-in flex-col border-l border-ink-line bg-paper shadow-paper-lg sm:relative sm:inset-auto sm:w-[400px]">
      <div className="flex items-center justify-between border-b border-ink-line px-5 py-4">
        <div>
          <div className="text-[10px] uppercase tracking-widest2 text-ink-faint">
            人物
          </div>
          <div className="font-mincho text-lg font-semibold tracking-wider text-ink">
            {person.lastName} {person.firstName}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1.5 text-ink-mute transition hover:bg-washi-warm hover:text-ink"
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

      <nav className="flex border-b border-ink-line bg-washi-warm/30 text-sm">
        {(
          [
            ["info", "情報"],
            ["relations", "つながり"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`relative flex-1 py-3 font-mincho tracking-wider transition ${
              tab === key
                ? "text-ink"
                : "text-ink-mute hover:bg-washi-warm hover:text-ink-soft"
            }`}
          >
            {label}
            {tab === key && (
              <span className="absolute inset-x-6 -bottom-px h-0.5 bg-shu" />
            )}
          </button>
        ))}
      </nav>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        <div className={tab === "info" ? "" : "hidden"}>
          <PersonForm
            key={person.id}
            treeId={treeId}
            initial={person}
            submitLabel="保存"
            readOnly={!canEdit}
            formId={`person-form-${person.id}`}
            hideSubmitButton
            onSaveResult={(r) => setSaveStatus(r)}
            onSubmit={async (values) => {
              await updatePerson(person.id, values, {
                actor,
                before: person,
              });
            }}
          />
          {canEdit && (
            <section className="mt-10 border-t border-ink-line/60 pt-5">
              <div className="mb-3 flex items-center gap-2">
                <span className="h-px flex-none w-4 bg-shu/40" />
                <h3 className="font-mincho text-sm font-semibold tracking-wider text-shu-deep">
                  危険ゾーン
                </h3>
                <span className="h-px flex-1 bg-shu/30" />
              </div>
              <p className="mb-3 text-[11px] leading-5 text-ink-mute">
                削除した内容は「編集履歴」から元に戻せます。
              </p>
              <button
                type="button"
                onClick={() => void handleDelete()}
                className="w-full rounded-md border border-shu/30 bg-shu-soft/30 py-2.5 text-sm font-medium tracking-wider2 text-shu-deep transition hover:border-shu/50 hover:bg-shu-soft/50"
              >
                この人物を削除（つながりも一緒に削除）
              </button>
            </section>
          )}
        </div>
        <div className={tab === "relations" ? "" : "hidden"}>
          <RelationsTab
            treeId={treeId}
            person={person}
            allPersons={allPersons}
            parents={parents}
            children={children}
            spouses={spouses}
            canEdit={canEdit}
            actor={actor}
            nameOf={nameOf}
          />
        </div>
      </div>

      {canEdit && tab === "info" && (
        <div className="flex flex-col gap-2 border-t border-ink-line bg-washi-warm/40 px-5 py-3">
          {saveStatus &&
            (saveStatus.ok ? (
              <div className="text-center text-xs tracking-wider2 text-shu">
                ✓ 保存しました
              </div>
            ) : (
              <div className="rounded-md border-l-2 border-shu bg-shu-soft/30 px-3 py-2 text-xs text-shu-deep">
                保存に失敗しました: {saveStatus.error}
              </div>
            ))}
          <button
            type="submit"
            form={`person-form-${person.id}`}
            className="btn-shu w-full"
          >
            保存
          </button>
        </div>
      )}
    </aside>
  );
}

function RelationsTab({
  treeId,
  person,
  allPersons,
  parents,
  children,
  spouses,
  canEdit,
  actor,
  nameOf,
}: {
  treeId: string;
  person: Person;
  allPersons: Person[];
  parents: { rel: Relationship; person?: Person }[];
  children: { rel: Relationship; person?: Person }[];
  spouses: { rel: Relationship; person?: Person }[];
  canEdit: boolean;
  actor: Actor;
  nameOf: (id: string) => string;
}) {
  const candidates = allPersons.filter((p) => p.id !== person.id);
  const selfName = fullName(person);

  const addParent = (id: string) =>
    createRelationship(treeId, "parent", id, person.id, {
      actor,
      fromName: nameOf(id),
      toName: selfName,
    });
  const addChild = (id: string) =>
    createRelationship(treeId, "parent", person.id, id, {
      actor,
      fromName: selfName,
      toName: nameOf(id),
    });
  const addSpouse = (id: string) =>
    createRelationship(treeId, "spouse", person.id, id, {
      actor,
      fromName: selfName,
      toName: nameOf(id),
    });

  return (
    <div className="flex flex-col gap-6">
      {canEdit && (
        <p className="border-l-2 border-shu/40 bg-shu-soft/15 px-3 py-2 text-xs leading-5 text-ink-soft">
          プルダウンから人を選ぶと即追加されます。
        </p>
      )}
      <Section
        title="親"
        items={parents}
        candidates={candidates.filter(
          (c) => !parents.some((p) => p.person?.id === c.id),
        )}
        onAdd={addParent}
        addLabel="+ 親を追加"
        canEdit={canEdit}
        actor={actor}
        nameOf={nameOf}
      />
      <Section
        title="配偶者"
        items={spouses}
        candidates={candidates.filter(
          (c) => !spouses.some((s) => s.person?.id === c.id),
        )}
        onAdd={addSpouse}
        addLabel="+ 配偶者を追加"
        canEdit={canEdit}
        actor={actor}
        nameOf={nameOf}
      />
      <Section
        title="子"
        items={children}
        candidates={candidates.filter(
          (c) => !children.some((ch) => ch.person?.id === c.id),
        )}
        onAdd={addChild}
        addLabel="+ 子を追加"
        canEdit={canEdit}
        actor={actor}
        nameOf={nameOf}
      />
    </div>
  );
}

function Section({
  title,
  items,
  candidates,
  onAdd,
  addLabel,
  canEdit,
  actor,
  nameOf,
}: {
  title: string;
  items: { rel: Relationship; person?: Person }[];
  candidates: Person[];
  onAdd: (id: string) => Promise<unknown>;
  addLabel: string;
  canEdit: boolean;
  actor: Actor;
  nameOf: (id: string) => string;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="h-px flex-none w-4 bg-ink-line" />
        <div className="font-mincho text-sm font-semibold tracking-wider text-ink-soft">
          {title}
        </div>
        <span className="h-px flex-1 bg-ink-line" />
      </div>
      {items.length === 0 ? (
        <div className="mb-2 text-xs italic text-ink-faint">なし</div>
      ) : (
        <ul className="mb-2 flex flex-col gap-1">
          {items.map((it) => (
            <li
              key={it.rel.id}
              className="flex items-center justify-between rounded-md border border-ink-line/60 bg-paper px-3 py-2 text-sm transition hover:border-ink-line"
            >
              <span className="truncate font-mincho text-ink">
                {it.person?.lastName} {it.person?.firstName}
              </span>
              {canEdit && (
                <button
                  type="button"
                  onClick={() =>
                    void softDeleteRelationship(
                      it.rel,
                      actor,
                      nameOf(it.rel.from),
                      nameOf(it.rel.to),
                    )
                  }
                  className="text-[11px] text-shu hover:text-shu-deep hover:underline"
                >
                  外す
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit &&
        (candidates.length > 0 ? (
          <select
            value=""
            onChange={(e) => {
              const id = e.target.value;
              if (!id) return;
              void onAdd(id);
              e.target.value = "";
            }}
            className="input w-full"
          >
            <option value="">{addLabel}</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.lastName} {c.firstName}
              </option>
            ))}
          </select>
        ) : (
          <div className="text-xs italic text-ink-faint">
            追加できる人がいません
          </div>
        ))}
    </div>
  );
}
