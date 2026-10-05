/**
 * The observation form shared by quick logging (object preset, time = now), adding to a session
 * (object picker) and editing. Designed to be done in a few taps at the eyepiece: everything
 * except the object is optional and pre-filled.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { Clock, ImagePlus, Telescope, X } from "lucide-react";
import type { ApiGear } from "@shared/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { TypeGlyph } from "@/components/common/Glyphs";
import { cn } from "@/lib/utils";
import { useNow } from "@/hooks/useNow";
import { useCatalog } from "@/hooks/useCatalog";
import { SOLAR_SYSTEM } from "@shared/astro/planets";
import { NativeSelect, ScaleInput, StarRatingInput } from "./controls";
import { ObjectPicker } from "./ObjectPicker";
import { photoProblem } from "./api";
import { SEEING_HINT, SEEING_LABEL, TRANSPARENCY_HINT, TRANSPARENCY_LABEL, formatTime, fromWallInput, toWallInput, typeLabel } from "./format";

export interface ObservationValues {
  ref: string | null;
  objectName: string;
  objectType: string | null;
  /** null = "now" (resolved by the server at save time) */
  time: number | null;
  telescopeId: number | null;
  eyepieceId: number | null;
  barlowId: number | null;
  filterId: number | null;
  /** Manual magnification, used only when no eyepiece is chosen. */
  magnification: number | null;
  rating: number | null;
  seeing: number | null;
  transparency: number | null;
  notes: string;
}

export const blankValues = (v: Partial<ObservationValues> = {}): ObservationValues => ({
  ref: null,
  objectName: "",
  objectType: null,
  time: null,
  telescopeId: null,
  eyepieceId: null,
  barlowId: null,
  filterId: null,
  magnification: null,
  rating: null,
  seeing: null,
  transparency: null,
  notes: "",
  ...v,
});

/** Magnification from the chosen optics (null when it can't be computed). */
export function computedMagnification(v: Pick<ObservationValues, "telescopeId" | "eyepieceId" | "barlowId">, gear: ApiGear | undefined) {
  const t = gear?.telescopes.find((x) => x.id === v.telescopeId);
  const e = gear?.eyepieces.find((x) => x.id === v.eyepieceId);
  if (!t || !e || !(e.focalLength > 0)) return null;
  const b = gear?.barlows.find((x) => x.id === v.barlowId);
  return (t.focalLength * (b?.factor ?? 1)) / e.focalLength;
}

export function ObservationForm({
  formId,
  initial,
  gear,
  pickObject = false,
  allowNow = true,
  tz,
  hour12,
  photosEnabled,
  before,
  error,
  onSubmit,
}: {
  formId: string;
  initial: ObservationValues;
  gear: ApiGear | undefined;
  pickObject?: boolean;
  allowNow?: boolean;
  tz?: string;
  hour12: boolean;
  photosEnabled: boolean;
  before?: ReactNode;
  error?: string | null;
  onSubmit: (v: ObservationValues, files: File[]) => void;
}) {
  const [v, setV] = useState<ObservationValues>(initial);
  const [picking, setPicking] = useState(pickObject && !initial.ref);
  const [showGear, setShowGear] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const now = useNow(30_000);
  const set = <K extends keyof ObservationValues>(k: K, value: ObservationValues[K]) => setV((p) => ({ ...p, [k]: value }));

  const { byId } = useCatalog();
  const objectType =
    v.objectType ??
    (v.ref ? (SOLAR_SYSTEM.some((p) => p.id === v.ref!.toLowerCase()) ? (v.ref.toLowerCase() === "moon" ? "moon" : "planet") : (byId.get(v.ref.toUpperCase())?.type ?? null)) : null);
  const mag = computedMagnification(v, gear);
  const hasGear = !!gear && gear.telescopes.length + gear.eyepieces.length > 0;
  const previews = useMemo(() => files.map((f) => ({ f, url: URL.createObjectURL(f) })), [files]);
  useEffect(() => () => previews.forEach((p) => URL.revokeObjectURL(p.url)), [previews]);

  const gearSummary = useMemo(() => {
    const parts: string[] = [];
    const t = gear?.telescopes.find((x) => x.id === v.telescopeId);
    const e = gear?.eyepieces.find((x) => x.id === v.eyepieceId);
    const b = gear?.barlows.find((x) => x.id === v.barlowId);
    const f = gear?.filters.find((x) => x.id === v.filterId);
    if (t) parts.push(t.name);
    if (e) parts.push(e.name);
    if (b) parts.push(b.name);
    if (f) parts.push(f.name);
    return parts;
  }, [gear, v.telescopeId, v.eyepieceId, v.barlowId, v.filterId]);
  const shownMag = mag ?? (v.eyepieceId ? null : v.magnification);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.ref) {
      setLocalError("Choose what you observed first.");
      setPicking(true);
      return;
    }
    setLocalError(null);
    onSubmit(v, files);
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      const problem = photoProblem(f);
      if (problem) {
        setLocalError(problem);
        continue;
      }
      if (next.length < 6) next.push(f);
    }
    setFiles(next);
    if (fileInput.current) fileInput.current.value = "";
  }

  const shownError = localError ?? error;

  return (
    <form id={formId} onSubmit={submit} className="flex flex-col gap-6" noValidate>
      {/* What */}
      {picking ? (
        <div className="flex flex-col gap-2">
          <Label>What did you observe?</Label>
          <ObjectPicker
            autoFocus
            onPick={(o) => {
              setV((p) => ({ ...p, ref: o.ref, objectName: o.name, objectType: o.type }));
              setPicking(false);
              setLocalError(null);
            }}
          />
          {v.ref && (
            <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setPicking(false)}>
              Keep {v.objectName}
            </Button>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full border bg-surface-2 text-foreground/80">
            <TypeGlyph type={objectType ?? "galaxy"} id={v.ref?.toLowerCase()} className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[1.05rem] font-medium">{v.objectName}</div>
            <div className="text-xs text-muted-foreground">{typeLabel(objectType)}</div>
          </div>
          {pickObject && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setPicking(true)}>
              Change
            </Button>
          )}
        </div>
      )}

      {before}

      {/* How it looked */}
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${formId}-rating`}>How did it look?</Label>
        <StarRatingInput id={`${formId}-rating`} value={v.rating} onChange={(r) => set("rating", r)} />
      </div>

      {/* When */}
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${formId}-time`}>Time</Label>
        {v.time === null ? (
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 items-center gap-2 rounded-md border bg-surface-2/50 px-3 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              Now
              <span className="num text-muted-foreground">{formatTime(now, { tz, hour12 })}</span>
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={() => set("time", Date.now())} id={`${formId}-time`}>
              Change
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id={`${formId}-time`}
              type="datetime-local"
              className="h-10 w-auto min-w-[14rem]"
              value={toWallInput(v.time, tz)}
              onChange={(e) => {
                const ms = fromWallInput(e.target.value, tz);
                if (ms !== null) set("time", ms);
              }}
              required
            />
            {allowNow && (
              <Button type="button" variant="ghost" size="sm" onClick={() => set("time", null)}>
                Use now
              </Button>
            )}
          </div>
        )}
        {tz && tz !== Intl.DateTimeFormat().resolvedOptions().timeZone && <p className="text-xs text-muted-foreground">Times are in the site's zone ({tz.replace(/_/g, " ")}).</p>}
      </div>

      {/* Conditions */}
      <div className="grid gap-5 sm:grid-cols-2">
        <ScaleInput id={`${formId}-seeing`} label="Seeing" value={v.seeing} onChange={(x) => set("seeing", x)} labels={SEEING_LABEL} hints={SEEING_HINT} />
        <ScaleInput
          id={`${formId}-transparency`}
          label="Transparency"
          value={v.transparency}
          onChange={(x) => set("transparency", x)}
          labels={TRANSPARENCY_LABEL}
          hints={TRANSPARENCY_HINT}
        />
      </div>

      {/* Equipment */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">Equipment</span>
          {hasGear && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowGear((s) => !s)} aria-expanded={showGear}>
              {showGear ? "Done" : "Change"}
            </Button>
          )}
        </div>
        {hasGear && !showGear && (
          <button
            type="button"
            onClick={() => setShowGear(true)}
            className="flex min-h-11 items-center gap-3 rounded-md border bg-surface-2/50 px-3 py-2 text-left text-sm hover:bg-accent"
          >
            <Telescope className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{gearSummary.length ? gearSummary.join(" · ") : <span className="text-muted-foreground">No equipment recorded</span>}</span>
            {shownMag ? <span className="num shrink-0 text-muted-foreground">{Math.round(shownMag)}×</span> : null}
          </button>
        )}
        {hasGear && showGear && gear && (
          <div className="grid gap-3 sm:grid-cols-2">
            <GearSelect label="Telescope" id={`${formId}-scope`} value={v.telescopeId} onChange={(x) => set("telescopeId", x)} items={gear.telescopes} />
            <GearSelect label="Eyepiece" id={`${formId}-ep`} value={v.eyepieceId} onChange={(x) => set("eyepieceId", x)} items={gear.eyepieces} />
            {gear.barlows.length > 0 && (
              <GearSelect label="Barlow" id={`${formId}-barlow`} value={v.barlowId} onChange={(x) => set("barlowId", x)} items={gear.barlows} />
            )}
            {gear.filters.length > 0 && (
              <GearSelect label="Filter" id={`${formId}-filter`} value={v.filterId} onChange={(x) => set("filterId", x)} items={gear.filters} />
            )}
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              {mag ? (
                <p className="text-sm text-muted-foreground">
                  Magnification <span className="num text-foreground">{Math.round(mag)}×</span>
                </p>
              ) : (
                <ManualMagnification id={`${formId}-mag`} value={v.magnification} onChange={(x) => set("magnification", x)} disabled={!!v.eyepieceId} />
              )}
            </div>
          </div>
        )}
        {!hasGear && (
          <div className="flex flex-col gap-2">
            <ManualMagnification id={`${formId}-mag`} value={v.magnification} onChange={(x) => set("magnification", x)} />
            <p className="text-xs text-muted-foreground">
              <Link href="/gear" className="link">
                Add your telescope and eyepieces
              </Link>{" "}
              and AstroPilot fills this in for you.
            </p>
          </div>
        )}
      </div>

      {/* Notes */}
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${formId}-notes`}>Notes</Label>
        <Textarea
          id={`${formId}-notes`}
          value={v.notes}
          onChange={(e) => set("notes", e.target.value)}
          rows={3}
          maxLength={10_000}
          placeholder="Shape, brightness, detail, colour, averted vision…"
        />
      </div>

      {/* Photos (only where storage is configured) */}
      {photosEnabled && (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Photos</span>
          <div className="flex flex-wrap gap-2">
            {previews.map(({ f, url }) => (
              <div key={url} className="relative h-20 w-20 overflow-hidden rounded-md border">
                <img src={url} alt={f.name} className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => setFiles((list) => list.filter((x) => x !== f))}
                  className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-background/85 text-foreground"
                  aria-label={`Remove ${f.name}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {files.length < 6 && (
              <Button type="button" variant="outline" className="h-20 w-20 flex-col gap-1 text-xs" onClick={() => fileInput.current?.click()}>
                <ImagePlus className="!size-5" />
                Add
              </Button>
            )}
          </div>
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" multiple className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => addFiles(e.target.files)} />
        </div>
      )}

      {shownError && (
        <p role="alert" className={cn("rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive")}>
          {shownError}
        </p>
      )}
    </form>
  );
}

function GearSelect({
  label,
  id,
  value,
  onChange,
  items,
}: {
  label: string;
  id: string;
  value: number | null;
  onChange: (v: number | null) => void;
  items: { id: number; name: string }[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <NativeSelect id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
        <option value="">None</option>
        {items.map((i) => (
          <option key={i.id} value={i.id}>
            {i.name}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}

function ManualMagnification({ id, value, onChange, disabled }: { id: string; value: number | null; onChange: (v: number | null) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <Label htmlFor={id} className="shrink-0 text-xs text-muted-foreground">
        Magnification
      </Label>
      <div className="relative w-28">
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={1}
          max={3000}
          step={1}
          className="h-10 pr-7"
          value={value ?? ""}
          disabled={disabled}
          onChange={(e) => {
            const n = Number(e.target.value);
            onChange(e.target.value && Number.isFinite(n) && n > 0 ? n : null);
          }}
          placeholder="—"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground" aria-hidden="true">
          ×
        </span>
      </div>
      <span className="text-xs text-muted-foreground">optional</span>
    </div>
  );
}
