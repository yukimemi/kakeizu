import { useEffect, useRef, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Person } from "../types";
import { deletePersonPhoto, uploadPersonPhoto } from "../data/storage";
import {
  formatPostalCode,
  isCompletePostalCode,
  lookupPostalCode,
  normalizePostalCode,
} from "../lib/postalCode";
import { computeAge } from "../lib/age";
import { SOCIAL_SERVICES, SocialIcon, buildSocialUrl } from "../lib/socials";

type PhotoTransform = { x: number; y: number; scale: number };
const DEFAULT_TRANSFORM: PhotoTransform = { x: 0, y: 0, scale: 1 };

const contactEntrySchema = z.object({
  label: z.string().optional(),
  value: z.string().optional(),
});

const schema = z.object({
  lastName: z.string().min(1, "姓は必須です"),
  firstName: z.string().min(1, "名は必須です"),
  lastNameKana: z.string().optional(),
  firstNameKana: z.string().optional(),
  birthDate: z.string().optional(),
  deathDate: z.string().optional(),
  gender: z.enum(["male", "female", "other"]).optional().or(z.literal("")),
  postalCode: z.string().optional(),
  address: z.string().optional(),
  phones: z.array(contactEntrySchema),
  emails: z.array(contactEntrySchema),
  socials: z.record(z.string(), z.string().optional()),
  memo: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

type Props = {
  treeId: string;
  initial: Person;
  onSubmit: (
    values: Omit<Person, "id" | "treeId" | "createdAt" | "updatedAt">,
  ) => Promise<void>;
  submitLabel: string;
  readOnly?: boolean;
  // When set, the <form> exposes this id so an external <button form={id}>
  // can trigger submission. Used by PersonDetailPanel to put the save
  // button next to the delete button in the panel footer.
  formId?: string;
  // Hide the in-form submit button when an external one is rendered.
  hideSubmitButton?: boolean;
  // Called after each save attempt so the parent can render a status
  // chip near its own (external) submit button. The internal status
  // line is hidden when this is provided.
  onSaveResult?: (
    r: { ok: true; at: number } | { ok: false; error: string },
  ) => void;
};

function buildDefaultValues(initial: Person): FormValues {
  // Read structured fields if present, otherwise fall back to legacy single
  // values so existing person docs render correctly in the new form.
  const phones =
    initial.phones && initial.phones.length > 0
      ? initial.phones.map((p) => ({ label: p.label ?? "", value: p.value }))
      : initial.phone
        ? [{ label: "", value: initial.phone }]
        : [];
  const emails =
    initial.emails && initial.emails.length > 0
      ? initial.emails.map((e) => ({ label: e.label ?? "", value: e.value }))
      : initial.email
        ? [{ label: "", value: initial.email }]
        : [];
  const socials: Record<string, string> = {};
  if (initial.socials) {
    for (const [k, v] of Object.entries(initial.socials)) {
      if (v) socials[k] = v;
    }
  }
  return {
    lastName: initial.lastName ?? "",
    firstName: initial.firstName ?? "",
    lastNameKana: initial.lastNameKana ?? "",
    firstNameKana: initial.firstNameKana ?? "",
    birthDate: initial.birthDate ?? "",
    deathDate: initial.deathDate ?? "",
    gender: (initial.gender as FormValues["gender"]) ?? "",
    postalCode: initial.postalCode ?? "",
    address: initial.address ?? "",
    phones,
    emails,
    socials,
    memo: initial.memo ?? "",
  };
}

export function PersonForm({
  treeId,
  initial,
  onSubmit,
  submitLabel,
  readOnly = false,
  formId,
  hideSubmitButton = false,
  onSaveResult,
}: Props) {
  const {
    register,
    handleSubmit,
    control,
    setValue,
    getValues,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: buildDefaultValues(initial),
  });

  const phonesArr = useFieldArray({ control, name: "phones" });
  const emailsArr = useFieldArray({ control, name: "emails" });

  const [photoUrl, setPhotoUrl] = useState<string | undefined>(
    initial.photoUrl,
  );
  const [photoTransform, setPhotoTransform] = useState<PhotoTransform>(
    initial.photoTransform ?? DEFAULT_TRANSFORM,
  );
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [zipBusy, setZipBusy] = useState(false);
  const [zipError, setZipError] = useState<string | null>(null);
  const [zipNote, setZipNote] = useState<string | null>(null);

  const onPickPhoto = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    try {
      const url = await uploadPersonPhoto(treeId, initial.id, file);
      setPhotoUrl(url);
      setPhotoTransform(DEFAULT_TRANSFORM);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  };

  const onDeletePhoto = async () => {
    if (!photoUrl) return;
    if (!confirm("写真を削除しますか？")) return;
    const old = photoUrl;
    setPhotoUrl(undefined);
    setPhotoTransform(DEFAULT_TRANSFORM);
    void deletePersonPhoto(old);
  };

  const onLookupZip = async () => {
    const raw = getValues("postalCode") ?? "";
    setZipError(null);
    setZipNote(null);
    if (!isCompletePostalCode(raw)) {
      setZipError("7 桁の郵便番号を入力してください");
      return;
    }
    setZipBusy(true);
    try {
      const result = await lookupPostalCode(raw);
      if (!result) {
        setZipError("一致する住所が見つかりませんでした");
        return;
      }
      // Preserve any building / unit details the user has already typed
      // beyond the prefilled prefecture+city+town.
      const current = getValues("address") ?? "";
      const prefix = result.full;
      const next =
        current && current.startsWith(prefix)
          ? current
          : current
            ? `${prefix} ${current.trim()}`.trim()
            : prefix;
      setValue("address", next, { shouldDirty: true });
      setZipNote(`${result.full} を反映しました`);
    } catch (e) {
      setZipError(e instanceof Error ? e.message : String(e));
    } finally {
      setZipBusy(false);
    }
  };

  // Keep the postal-code input always normalised+formatted (1234567 → 123-4567).
  const postalRaw = watch("postalCode");
  useEffect(() => {
    const formatted = formatPostalCode(postalRaw ?? "");
    if (formatted !== postalRaw) {
      setValue("postalCode", formatted, { shouldDirty: false });
    }
  }, [postalRaw, setValue]);

  const submit = handleSubmit(
    async (v) => {
      setSaveError(null);
      let succeeded = false;
      let savedAtLocal = 0;
      try {
        // Strip empty contact entries; normalise label="" → undefined.
        const phones = v.phones
          .filter((p) => p.value && p.value.trim() !== "")
          .map((p) => ({
            value: p.value!.trim(),
            ...(p.label && p.label.trim() ? { label: p.label.trim() } : {}),
          }));
        const emails = v.emails
          .filter((e) => e.value && e.value.trim() !== "")
          .map((e) => ({
            value: e.value!.trim(),
            ...(e.label && e.label.trim() ? { label: e.label.trim() } : {}),
          }));
        const socials: Record<string, string> = {};
        for (const def of SOCIAL_SERVICES) {
          const handle = v.socials?.[def.id]?.trim();
          if (handle) socials[def.id] = handle;
        }
        await onSubmit({
          lastName: v.lastName,
          firstName: v.firstName,
          lastNameKana: v.lastNameKana || undefined,
          firstNameKana: v.firstNameKana || undefined,
          birthDate: v.birthDate || undefined,
          deathDate: v.deathDate || undefined,
          gender: v.gender ? (v.gender as Person["gender"]) : undefined,
          postalCode: v.postalCode
            ? formatPostalCode(v.postalCode) || undefined
            : undefined,
          address: v.address || undefined,
          phones: phones.length > 0 ? phones : undefined,
          emails: emails.length > 0 ? emails : undefined,
          socials: Object.keys(socials).length > 0 ? socials : undefined,
          memo: v.memo || undefined,
          photoUrl,
          photoTransform: photoUrl ? photoTransform : undefined,
          position: initial.position,
        });
        savedAtLocal = Date.now();
        setSavedAt(savedAtLocal);
        succeeded = true;
      } catch (e) {
        console.error("save failed", e);
        const msg = e instanceof Error ? e.message : String(e);
        setSaveError(msg);
        onSaveResult?.({ ok: false, error: msg });
      }
      if (succeeded) onSaveResult?.({ ok: true, at: savedAtLocal });
    },
    (errs) => {
      console.warn("validation failed", errs);
    },
  );

  return (
    <form
      id={formId}
      onSubmit={(e) => void submit(e)}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col items-center gap-2">
        {photoUrl ? (
          readOnly ? (
            <div className="h-32 w-32 overflow-hidden rounded-full ring-1 ring-slate-300">
              <img
                src={photoUrl}
                alt=""
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  transform: `translate(${photoTransform.x}%, ${photoTransform.y}%) scale(${photoTransform.scale})`,
                  transformOrigin: "center center",
                }}
              />
            </div>
          ) : (
            <PhotoEditor
              url={photoUrl}
              transform={photoTransform}
              onChange={setPhotoTransform}
            />
          )
        ) : (
          <div
            className="flex h-32 w-32 items-center justify-center rounded-full border border-ink-line bg-washi-warm font-mincho text-4xl text-ink-faint"
            aria-hidden
          >
            ?
          </div>
        )}
        {!readOnly && (
          <div className="flex items-center gap-2">
            <label className="inline-flex min-h-[36px] cursor-pointer items-center rounded-md border border-ink-line bg-white/60 px-3 text-xs tracking-wider2 text-shu transition hover:border-shu/40 hover:bg-shu-soft/15 hover:text-shu-deep">
              {uploading
                ? "アップロード中..."
                : photoUrl
                  ? "別の写真"
                  : "写真を選択"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onPickPhoto(f);
                }}
              />
            </label>
            {photoUrl && (
              <button
                type="button"
                onClick={() => void onDeletePhoto()}
                className="inline-flex min-h-[36px] items-center rounded-md border border-ink-line bg-white/60 px-3 text-xs tracking-wider2 text-ink-mute transition hover:border-shu/40 hover:bg-shu-soft/15 hover:text-shu-deep"
              >
                削除
              </button>
            )}
          </div>
        )}
        {uploadError && (
          <span className="text-xs text-shu-deep">{uploadError}</span>
        )}
      </div>

      <fieldset disabled={readOnly} className="contents">
        <Row>
          <Field label="姓 *" error={errors.lastName?.message}>
            <input
              {...register("lastName")}
              className="input"
              autoComplete="off"
            />
          </Field>
          <Field label="名 *" error={errors.firstName?.message}>
            <input
              {...register("firstName")}
              className="input"
              autoComplete="off"
            />
          </Field>
        </Row>

        <Row>
          <Field label="姓 (ふりがな)">
            <input {...register("lastNameKana")} className="input" />
          </Field>
          <Field label="名 (ふりがな)">
            <input {...register("firstNameKana")} className="input" />
          </Field>
        </Row>

        <Row>
          <Field label="生年月日">
            <input type="date" {...register("birthDate")} className="input" />
          </Field>
          <Field label="性別">
            <select {...register("gender")} className="input">
              <option value="">未指定</option>
              <option value="male">男性</option>
              <option value="female">女性</option>
              <option value="other">その他</option>
            </select>
          </Field>
        </Row>

        <Row>
          <Field label="没年月日">
            <input type="date" {...register("deathDate")} className="input" />
          </Field>
          <Field label={watch("deathDate") ? "享年" : "年齢"}>
            <AgeReadout
              birthDate={watch("birthDate")}
              deathDate={watch("deathDate")}
            />
          </Field>
        </Row>

        <SectionLabel>住所</SectionLabel>
        <div className="flex flex-col gap-2">
          <div className="flex items-end gap-2">
            <Field label="郵便番号">
              <div className="flex gap-1.5">
                <input
                  {...register("postalCode", {
                    setValueAs: (v: string) =>
                      v ? formatPostalCode(normalizePostalCode(v)) : "",
                  })}
                  inputMode="numeric"
                  placeholder="123-4567"
                  className="input w-32 font-mono"
                />
                <button
                  type="button"
                  onClick={() => void onLookupZip()}
                  disabled={zipBusy || readOnly}
                  className="rounded-md border border-ink-line bg-washi-warm px-3 text-xs tracking-wider2 text-ink-soft transition hover:border-shu/40 hover:bg-shu-soft/30 hover:text-shu-deep disabled:opacity-50"
                  title="住所を自動入力"
                >
                  {zipBusy ? "検索中…" : "住所検索"}
                </button>
              </div>
            </Field>
          </div>
          {zipError && (
            <p className="border-l-2 border-shu bg-shu-soft/30 px-2 py-1 text-[11px] text-shu-deep">
              {zipError}
            </p>
          )}
          {zipNote && !zipError && (
            <p className="text-[11px] text-ink-mute">{zipNote}</p>
          )}
          <Field label="住所">
            <input
              {...register("address")}
              placeholder="郵便番号で自動入力。番地・建物名は手入力"
              className="input"
            />
          </Field>
        </div>

        <SectionLabel>電話番号</SectionLabel>
        <div className="flex flex-col gap-2">
          {phonesArr.fields.length === 0 && (
            <p className="text-[11px] text-ink-faint">未登録</p>
          )}
          {phonesArr.fields.map((f, i) => (
            <ContactRow
              key={f.id}
              labelPlaceholder="自宅 / 携帯 / 会社 など"
              valuePlaceholder="例: 090-1234-5678"
              valueProps={{
                ...register(`phones.${i}.value`),
                type: "tel",
                inputMode: "tel",
              }}
              labelProps={register(`phones.${i}.label`)}
              onRemove={() => phonesArr.remove(i)}
              readOnly={readOnly}
            />
          ))}
          {!readOnly && (
            <button
              type="button"
              onClick={() => phonesArr.append({ label: "", value: "" })}
              className="inline-flex min-h-[40px] self-start items-center rounded-md border border-dashed border-ink-line/80 px-3 text-xs tracking-wider2 text-shu transition hover:border-shu/50 hover:bg-shu-soft/15 hover:text-shu-deep"
            >
              + 電話番号を追加
            </button>
          )}
        </div>

        <SectionLabel>メール</SectionLabel>
        <div className="flex flex-col gap-2">
          {emailsArr.fields.length === 0 && (
            <p className="text-[11px] text-ink-faint">未登録</p>
          )}
          {emailsArr.fields.map((f, i) => (
            <ContactRow
              key={f.id}
              labelPlaceholder="個人 / 仕事 など"
              valuePlaceholder="example@example.com"
              valueProps={{
                ...register(`emails.${i}.value`),
                type: "email",
                inputMode: "email",
              }}
              labelProps={register(`emails.${i}.label`)}
              onRemove={() => emailsArr.remove(i)}
              readOnly={readOnly}
            />
          ))}
          {!readOnly && (
            <button
              type="button"
              onClick={() => emailsArr.append({ label: "", value: "" })}
              className="inline-flex min-h-[40px] self-start items-center rounded-md border border-dashed border-ink-line/80 px-3 text-xs tracking-wider2 text-shu transition hover:border-shu/50 hover:bg-shu-soft/15 hover:text-shu-deep"
            >
              + メールを追加
            </button>
          )}
        </div>

        <SectionLabel>SNS</SectionLabel>
        <div className="flex flex-col gap-1.5">
          {SOCIAL_SERVICES.map((def) => {
            const handle = watch(`socials.${def.id}` as const);
            const url = handle ? buildSocialUrl(def.id, handle) : null;
            return (
              <div
                key={def.id}
                className="flex items-center gap-2 rounded-md border border-ink-line/50 bg-paper px-2 py-1.5 transition focus-within:border-shu/40"
              >
                <span
                  className="flex h-7 w-7 flex-none items-center justify-center rounded-md"
                  style={{ backgroundColor: `${def.color}12` }}
                  title={def.label}
                >
                  <SocialIcon service={def.id} size={16} />
                </span>
                <input
                  {...register(`socials.${def.id}` as const)}
                  placeholder={def.placeholder}
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-faint"
                />
                {url && !readOnly && (
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-9 flex-none items-center rounded-md px-2.5 text-xs tracking-wider2 text-shu transition hover:bg-shu-soft/30 hover:text-shu-deep"
                    title={url}
                  >
                    開く ↗
                  </a>
                )}
              </div>
            );
          })}
        </div>

        <Field label="メモ">
          <textarea {...register("memo")} rows={3} className="input resize-none" />
        </Field>
      </fieldset>

      {!readOnly && !hideSubmitButton && (
        <>
          <button
            type="submit"
            disabled={isSubmitting || uploading}
            className="btn-shu mt-2 w-full"
          >
            {isSubmitting ? "保存中..." : submitLabel}
          </button>
          {saveError && (
            <div className="rounded-md border-l-2 border-shu bg-shu-soft/30 px-3 py-2 text-xs text-shu-deep">
              保存に失敗しました: {saveError}
            </div>
          )}
          {!saveError && savedAt && (
            <div className="text-center text-xs tracking-wider2 text-shu">
              ✓ 保存しました
            </div>
          )}
        </>
      )}
    </form>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10px] font-medium uppercase tracking-widest2 text-ink-mute">
        {label}
      </span>
      {children}
      {error && <span className="text-[11px] text-shu-deep">{error}</span>}
    </label>
  );
}

function AgeReadout({
  birthDate,
  deathDate,
}: {
  birthDate?: string;
  deathDate?: string;
}) {
  const age = computeAge(birthDate, deathDate || undefined);
  return (
    <div className="input flex items-center whitespace-nowrap !bg-washi-warm/40 font-mincho text-sm text-ink-soft">
      {age != null ? `${age}歳` : "—"}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-2 flex items-center gap-2">
      <span className="h-px flex-none w-3 bg-ink-line" />
      <span className="text-[10px] font-medium uppercase tracking-widest2 text-ink-mute">
        {children}
      </span>
      <span className="h-px flex-1 bg-ink-line" />
    </div>
  );
}

type ContactRowProps = {
  labelPlaceholder: string;
  valuePlaceholder: string;
  valueProps: React.InputHTMLAttributes<HTMLInputElement> & {
    name?: string;
    onChange?: React.ChangeEventHandler<HTMLInputElement>;
  };
  labelProps: React.InputHTMLAttributes<HTMLInputElement> & {
    name?: string;
    onChange?: React.ChangeEventHandler<HTMLInputElement>;
  };
  onRemove: () => void;
  readOnly?: boolean;
};

function ContactRow({
  labelPlaceholder,
  valuePlaceholder,
  valueProps,
  labelProps,
  onRemove,
  readOnly,
}: ContactRowProps) {
  return (
    <div className="flex items-center gap-2">
      <input
        {...labelProps}
        placeholder={labelPlaceholder}
        className="input w-24 !py-1.5 !text-xs"
      />
      <input
        {...valueProps}
        placeholder={valuePlaceholder}
        className="input flex-1 !py-1.5"
      />
      {!readOnly && (
        <button
          type="button"
          onClick={onRemove}
          className="flex h-10 w-10 flex-none items-center justify-center rounded-md text-ink-mute transition hover:bg-shu-soft/30 hover:text-shu-deep"
          aria-label="削除"
          title="削除"
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
      )}
    </div>
  );
}

const EDITOR_SIZE = 128;

function PhotoEditor({
  url,
  transform,
  onChange,
}: {
  url: string;
  transform: PhotoTransform;
  onChange: (t: PhotoTransform) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const startRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const pxToPct = 100 / EDITOR_SIZE;

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = true;
    startRef.current = { x: e.clientX, y: e.clientY };
    ref.current?.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const dx = (e.clientX - startRef.current.x) * pxToPct;
    const dy = (e.clientY - startRef.current.y) * pxToPct;
    startRef.current = { x: e.clientX, y: e.clientY };
    onChange({
      ...transform,
      x: transform.x + dx,
      y: transform.y + dy,
    });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    dragging.current = false;
    try {
      ref.current?.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        ref={ref}
        className="relative cursor-grab overflow-hidden rounded-full ring-1 ring-slate-300 active:cursor-grabbing"
        style={{
          width: EDITOR_SIZE,
          height: EDITOR_SIZE,
          touchAction: "none",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <img
          src={url}
          alt=""
          draggable={false}
          className="select-none"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: `translate(${transform.x}%, ${transform.y}%) scale(${transform.scale})`,
            transformOrigin: "center center",
            pointerEvents: "none",
          }}
        />
      </div>
      <div className="flex w-full items-center gap-2">
        <span className="text-xs text-slate-500">縮小</span>
        <input
          type="range"
          min={0.5}
          max={3}
          step={0.05}
          value={transform.scale}
          onChange={(e) =>
            onChange({ ...transform, scale: parseFloat(e.target.value) })
          }
          className="flex-1"
        />
        <span className="text-xs text-slate-500">拡大</span>
        <button
          type="button"
          onClick={() => onChange(DEFAULT_TRANSFORM)}
          className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50"
          title="位置とズームをリセット"
        >
          ⟳
        </button>
      </div>
      <p className="text-center text-[10px] text-slate-400">
        ドラッグで移動、スライダーでズーム
      </p>
    </div>
  );
}
