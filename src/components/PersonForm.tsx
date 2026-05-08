import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Person } from "../types";
import { deletePersonPhoto, uploadPersonPhoto } from "../data/storage";

type PhotoTransform = { x: number; y: number; scale: number };
const DEFAULT_TRANSFORM: PhotoTransform = { x: 0, y: 0, scale: 1 };

const schema = z.object({
  lastName: z.string().min(1, "姓は必須です"),
  firstName: z.string().min(1, "名は必須です"),
  lastNameKana: z.string().optional(),
  firstNameKana: z.string().optional(),
  birthDate: z.string().optional(),
  gender: z.enum(["male", "female", "other"]).optional().or(z.literal("")),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("メール形式が不正です").optional().or(z.literal("")),
  sns: z.string().optional(),
  memo: z.string().optional(),
});

export type PersonFormValues = z.infer<typeof schema>;

type Props = {
  treeId: string;
  initial: Person;
  onSubmit: (
    values: Omit<Person, "id" | "treeId" | "createdAt" | "updatedAt">,
  ) => Promise<void>;
  submitLabel: string;
  readOnly?: boolean;
};

export function PersonForm({
  treeId,
  initial,
  onSubmit,
  submitLabel,
  readOnly = false,
}: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PersonFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      lastName: initial.lastName ?? "",
      firstName: initial.firstName ?? "",
      lastNameKana: initial.lastNameKana ?? "",
      firstNameKana: initial.firstNameKana ?? "",
      birthDate: initial.birthDate ?? "",
      gender: (initial.gender as PersonFormValues["gender"]) ?? "",
      address: initial.address ?? "",
      phone: initial.phone ?? "",
      email: initial.email ?? "",
      sns: initial.sns ?? "",
      memo: initial.memo ?? "",
    },
  });

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

  const submit = handleSubmit(
    async (v) => {
      setSaveError(null);
      try {
        await onSubmit({
          lastName: v.lastName,
          firstName: v.firstName,
          lastNameKana: v.lastNameKana || undefined,
          firstNameKana: v.firstNameKana || undefined,
          birthDate: v.birthDate || undefined,
          gender: v.gender ? (v.gender as Person["gender"]) : undefined,
          address: v.address || undefined,
          phone: v.phone || undefined,
          email: v.email || undefined,
          sns: v.sns || undefined,
          memo: v.memo || undefined,
          photoUrl,
          photoTransform: photoUrl ? photoTransform : undefined,
          position: initial.position,
        });
        setSavedAt(Date.now());
      } catch (e) {
        console.error("save failed", e);
        setSaveError(e instanceof Error ? e.message : String(e));
      }
    },
    (errs) => {
      console.warn("validation failed", errs);
    },
  );

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
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
          <div className="flex items-center gap-3">
            <label className="cursor-pointer text-[11px] tracking-wider2 text-shu hover:text-shu-deep hover:underline">
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
              <>
                <span className="text-ink-faint">·</span>
                <button
                  type="button"
                  onClick={() => void onDeletePhoto()}
                  className="text-[11px] tracking-wider2 text-ink-mute hover:text-shu-deep hover:underline"
                >
                  写真を削除
                </button>
              </>
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

      <Field label="住所">
        <input {...register("address")} className="input" />
      </Field>
      <Field label="電話番号">
        <input {...register("phone")} className="input" />
      </Field>
      <Field label="メール" error={errors.email?.message}>
        <input {...register("email")} className="input" />
      </Field>
      <Field label="SNS">
        <input
          {...register("sns")}
          placeholder="@handle や URL など"
          className="input"
        />
      </Field>
      <Field label="メモ">
        <textarea {...register("memo")} rows={3} className="input resize-none" />
      </Field>
      </fieldset>

      {!readOnly && (
        <button
          type="submit"
          disabled={isSubmitting || uploading}
          className="btn-shu mt-2 w-full"
        >
          {isSubmitting ? "保存中..." : submitLabel}
        </button>
      )}
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
      {error && (
        <span className="text-[11px] text-shu-deep">{error}</span>
      )}
    </label>
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

  // x/y are stored as percentages of the image's own size (= container size,
  // since the img is 100% width/height with object-fit: cover). 1px on screen
  // corresponds to (100 / EDITOR_SIZE) percentage points. We convert when
  // committing drag deltas so the saved values are size-independent.
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
