import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, Loader2, Plus, Search, SlidersHorizontal } from "lucide-react";
import type { GearKind } from "@shared/api";
import { cameraField, scopeLimits, setup, type ScopeSpec } from "@shared/astro/optics";
import {
  BARLOW_PRESETS,
  BINOCULAR_NOMINAL_EYEPIECE,
  CAMERA_PRESETS,
  CAMERA_TYPES,
  EYEPIECE_PRESETS,
  FILTER_PRESETS,
  FILTER_TYPES,
  GEAR_LIMITS as L,
  SENSOR_FORMATS,
  TELESCOPE_PRESETS,
  TELESCOPE_TYPES,
  barlowKind,
  binocularMagnification,
  cameraTypeLabel,
  filterTypeLabel,
  formatSensor,
  parseSensor,
  telescopeTypeLabel,
  usesEyepieces,
  zoomRange,
} from "@shared/data/gear-presets";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { fmtArcsec, fmtFRatio, fmtFactor, fmtField, fmtFieldPair, fmtInches, fmtLightGrasp, fmtMag, fmtPupil } from "./format";
import { KIND_LABEL, useGearMutations, type GearBody, type GearItem } from "./useGearMutations";

export type PreviewScope = ScopeSpec & { name: string; type?: string | null };

// ------------------------------------------------------------------------------------
// Draft (form state as strings) ⇄ API body
// ------------------------------------------------------------------------------------

interface Draft {
  name: string;
  type: string;
  aperture: string;
  focalLength: string;
  magnification: string; // binoculars
  obstruction: string;
  afov: string;
  factor: string;
  sensorW: string;
  sensorH: string;
  pixel: string;
}

const EMPTY: Draft = { name: "", type: "", aperture: "", focalLength: "", magnification: "", obstruction: "", afov: "", factor: "", sensorW: "", sensorH: "", pixel: "" };
const str = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));
const num = (s: string) => {
  const t = s.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
};

function draftFrom(kind: GearKind, item: GearBody | GearItem | null | undefined): Draft {
  if (!item) return { ...EMPTY, type: kind === "cameras" ? "dslr" : "" };
  const it = item as Record<string, any>;
  switch (kind) {
    case "telescopes": {
      const bino = it.type === "binoculars";
      return {
        ...EMPTY,
        name: it.name ?? "",
        type: it.type ?? "",
        aperture: str(it.aperture),
        focalLength: str(it.focalLength),
        magnification: bino ? str(binocularMagnification({ name: it.name ?? "", aperture: it.aperture, focalLength: it.focalLength })) : "",
        obstruction: str(it.obstructionRatio),
      };
    }
    case "eyepieces":
      return { ...EMPTY, name: it.name ?? "", focalLength: str(it.focalLength), afov: str(it.apparentFov) };
    case "barlows":
      return { ...EMPTY, name: it.name ?? "", factor: str(it.factor) };
    case "filters":
      return { ...EMPTY, name: it.name ?? "", type: it.type ?? "" };
    case "cameras": {
      const s = parseSensor(it.sensorSize);
      return { ...EMPTY, name: it.name ?? "", type: it.type ?? "dslr", sensorW: str(s?.w), sensorH: str(s?.h), pixel: str(s?.pixel) };
    }
  }
}

type Errors = Partial<Record<keyof Draft, string>>;

function range(v: number | null, min: number, max: number, label: string, unit: string, required = true): string | undefined {
  if (v === null) return required ? `${label} is required` : undefined;
  if (Number.isNaN(v)) return `${label} must be a number`;
  if (v < min || v > max) return `${label} must be between ${min} and ${max}${unit}`;
}

/** Validate a draft against the same limits the API uses; returns the body or field errors. */
function buildBody(kind: GearKind, d: Draft): { body: GearBody | null; errors: Errors; autoName: string } {
  const e: Errors = {};
  let body: GearBody | null = null;
  let autoName = "";
  switch (kind) {
    case "telescopes": {
      const bino = d.type === "binoculars";
      const ap = num(d.aperture);
      e.aperture =
        ap !== null && !Number.isNaN(ap) && ap > 0 && ap < 25
          ? `Aperture is in millimetres — ${Math.round(ap)} inches is ${Math.round(ap * 25.4)} mm`
          : range(ap, L.aperture.min, L.aperture.max, "Aperture", " mm");
      let fl = num(d.focalLength);
      if (bino) {
        const mag = num(d.magnification);
        e.magnification = range(mag, L.binocularMag.min, L.binocularMag.max, "Magnification", "×");
        fl = mag !== null && !Number.isNaN(mag) ? mag * BINOCULAR_NOMINAL_EYEPIECE : null;
        autoName = mag && ap ? `${mag}×${ap} binoculars` : "Binoculars";
      } else {
        e.focalLength = range(fl, L.focalLength.min, L.focalLength.max, "Focal length", " mm");
        autoName = ap ? `${Math.round(ap)} mm ${d.type ? telescopeTypeLabel(d.type).toLowerCase() : "telescope"}` : "My telescope";
      }
      const obs = bino || d.type === "refractor" || d.type === "smart" ? null : num(d.obstruction);
      e.obstruction = range(obs, L.obstruction.min, L.obstruction.max, "Central obstruction", "%", false);
      if (!e.aperture && !e.focalLength && !e.magnification && ap && fl) {
        const f = fl / ap;
        if (f < L.fRatio.min || f > L.fRatio.max) e.focalLength = `That's ${fmtFRatio(f)} — check both values are in millimetres`;
      }
      body = { name: d.name.trim() || autoName, type: d.type || null, aperture: ap, focalLength: fl, obstructionRatio: obs };
      break;
    }
    case "eyepieces": {
      const fl = num(d.focalLength);
      const afov = num(d.afov);
      e.focalLength = range(fl, L.eyepieceFocal.min, L.eyepieceFocal.max, "Focal length", " mm");
      e.afov = range(afov, L.afov.min, L.afov.max, "Apparent field", "°", false);
      autoName = fl ? `${fl} mm eyepiece` : "Eyepiece";
      body = { name: d.name.trim() || autoName, focalLength: fl, apparentFov: afov };
      break;
    }
    case "barlows": {
      const f = num(d.factor);
      e.factor = range(f, L.barlowFactor.min, L.barlowFactor.max, "Factor", "×");
      autoName = f ? `${fmtFactor(f)} ${barlowKind(f) === "barlow" ? "Barlow" : barlowKind(f) === "reducer" ? "reducer" : "corrector"}` : "Barlow";
      body = { name: d.name.trim() || autoName, factor: f };
      break;
    }
    case "filters": {
      if (!d.type) e.type = "Choose the kind of filter";
      autoName = d.type ? `${filterTypeLabel(d.type, true)} filter` : "Filter";
      body = { name: d.name.trim() || autoName, type: d.type };
      break;
    }
    case "cameras": {
      if (!d.type) e.type = "Choose the kind of camera";
      const w = num(d.sensorW);
      const h = num(d.sensorH);
      const px = num(d.pixel);
      let sensor: string | null = null;
      if (w !== null || h !== null) {
        e.sensorW = range(w, L.sensorMm.min, L.sensorMm.max, "Sensor width", " mm");
        e.sensorH = range(h, L.sensorMm.min, L.sensorMm.max, "Sensor height", " mm");
        e.pixel = range(px, L.pixelUm.min, L.pixelUm.max, "Pixel size", " µm", false);
        if (!e.sensorW && !e.sensorH && !e.pixel && w && h) sensor = formatSensor({ w, h, pixel: px });
      } else if (px !== null) e.sensorW = "Add the sensor size too";
      autoName = d.type ? cameraTypeLabel(d.type) : "Camera";
      body = { name: d.name.trim() || autoName, type: d.type, sensorSize: sensor };
      break;
    }
  }
  if (d.name.trim().length > L.name) e.name = `Keep the name under ${L.name} characters`;
  for (const k of Object.keys(e) as (keyof Draft)[]) if (!e[k]) delete e[k];
  return { body: Object.keys(e).length ? null : body, errors: e, autoName };
}

// ------------------------------------------------------------------------------------
// Presets
// ------------------------------------------------------------------------------------

interface PresetRow {
  key: string;
  group: string;
  title: string;
  detail: string;
  body: GearBody;
  /** Normalised words; a query matches when every query token starts one of them. */
  words: string[];
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "") // "Plössl" ≈ "plossl"
    .toLowerCase()
    .replace(/×/g, "x")
    .replace(/[″"]/g, "in")
    .replace(/[–—]/g, "-")
    .replace(/[^\p{L}\p{N}.\-/]+/gu, " ")
    .trim();

function onScope(scope: PreviewScope | null | undefined) {
  return scope && usesEyepieces(scope.type) ? scope : null;
}

function presetRows(kind: GearKind, scope: PreviewScope | null | undefined): PresetRow[] {
  const sc = onScope(scope);
  const row = (group: string, title: string, detail: string, body: GearBody, extra = ""): PresetRow => {
    const text = norm(`${title} ${group} ${extra}`);
    return { key: `${kind}:${title}`, group, title, detail, body, words: [...new Set([...text.split(/\s+/), ...text.split(/[\s\-/]+/)])] };
  };
  switch (kind) {
    case "telescopes":
      return TELESCOPE_PRESETS.map((p) =>
        row(
          p.type === "binoculars" ? "Binoculars" : p.type === "smart" ? "Smart telescopes" : telescopeTypeLabel(p.type) + "s",
          p.name,
          p.type === "binoculars"
            ? `${p.aperture} mm aperture · ${fmtMag(binocularMagnification({ name: p.name, aperture: p.aperture, focalLength: p.focalLength }))}`
            : `${p.aperture} mm (${fmtInches(p.aperture)}) · ${p.focalLength} mm · ${fmtFRatio(p.focalLength / p.aperture)}`,
          { name: p.name, type: p.type, aperture: p.aperture, focalLength: p.focalLength, obstructionRatio: p.obstruction ?? null },
          `${p.aperture}mm ${fmtInches(p.aperture)}`,
        ),
      );
    case "eyepieces":
      return EYEPIECE_PRESETS.map((p) => {
        const zoom = zoomRange(p.name);
        const fov = zoom ? `${p.afov}° at ${p.focalLength} mm` : `${p.afov}° field`;
        const on = sc ? (zoom ? ` · ${fmtMag(sc.focalLength / zoom[1])}–${fmtMag(sc.focalLength / zoom[0])}` : ` · ${fmtMag(sc.focalLength / p.focalLength)} on your scope`) : "";
        return row(p.series, p.name, fov + on, { name: p.name, focalLength: p.focalLength, apparentFov: p.afov }, `${p.focalLength}mm`);
      });
    case "barlows":
      return BARLOW_PRESETS.map((p) => {
        const k = barlowKind(p.factor);
        const on = sc && Math.abs(p.factor - 1) > 0.02 ? ` · ${Math.round(sc.focalLength)} → ${Math.round(sc.focalLength * p.factor)} mm` : "";
        return row(k === "barlow" ? "Barlows & focal extenders" : k === "reducer" ? "Focal reducers" : "Coma correctors", p.name, `${fmtFactor(p.factor)}${on}`, {
          name: p.name,
          factor: p.factor,
        });
      });
    case "filters":
      return FILTER_PRESETS.map((p) => row(filterTypeLabel(p.type), p.name, FILTER_USE[p.type] ?? filterTypeLabel(p.type), { name: p.name, type: p.type }));
    case "cameras":
      return CAMERA_PRESETS.map((p) => {
        const big = p.sensor && Math.hypot(p.sensor.w, p.sensor.h) >= 15;
        const group = p.type === "dslr" ? "DSLR & mirrorless" : p.type === "smartphone" ? "Smartphones" : big ? "Deep-sky cameras" : "Planetary & guide cameras";
        const sensor = p.sensor ? formatSensor(p.sensor) : "Through the eyepiece";
        const fov = sc && p.sensor ? ` · ${fmtFieldPair(cameraField(sc.focalLength, p.sensor.w, p.sensor.h).widthDeg, cameraField(sc.focalLength, p.sensor.w, p.sensor.h).heightDeg)}` : "";
        return row(group, p.name, sensor + fov, { name: p.name, type: p.type, sensorSize: p.sensor ? formatSensor(p.sensor) : null });
      });
  }
}

/** What each filter type is for, in a few words. */
export const FILTER_USE: Record<string, string> = {
  uhc: "Emission nebulae: Orion, Lagoon, Veil",
  oiii: "Planetary nebulae and the Veil",
  h_beta: "Horsehead, California Nebula",
  lps: "Mild sky-glow cut for photography",
  cls: "Mild sky-glow cut for photography",
  light_pollution: "Mild sky-glow cut for photography",
  moon: "Cuts glare around full Moon",
  nd: "Cuts glare around full Moon",
  variable_polarizer: "Adjustable dimming for the Moon",
  neodymium: "Lunar and planetary contrast",
  contrast_booster: "Reduces false colour in achromats",
  semi_apo: "Reduces false colour in achromats",
  fringe_killer: "Reduces false colour in achromats",
  color_red: "Mars surface markings",
  color_orange: "Mars and Jupiter's belts",
  color_yellow: "Mars, Jupiter, lunar contrast",
  color_green: "Jupiter's belts, Saturn's clouds",
  color_blue: "Jupiter's belts and festoons",
  color_violet: "Venus cloud markings",
  color: "Planetary detail",
  h_alpha: "Imaging emission nebulae",
  none: "",
};

// ------------------------------------------------------------------------------------
// Small form primitives
// ------------------------------------------------------------------------------------

function Field({ id, label, hint, error, children, className }: { id: string; label: ReactNode; hint?: ReactNode; error?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p id={`${id}-msg`} className="text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-msg`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function NumInput({ id, value, onChange, unit, placeholder, error, autoFocus }: { id: string; value: string; onChange: (v: string) => void; unit?: string; placeholder?: string; error?: string; autoFocus?: boolean }) {
  return (
    <div className="relative">
      <Input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error}
        aria-describedby={`${id}-msg`}
        className={cn("num h-10", unit && "pr-12", error && "border-destructive")}
        autoFocus={autoFocus}
      />
      {unit && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{unit}</span>}
    </div>
  );
}

// ------------------------------------------------------------------------------------
// Dialog
// ------------------------------------------------------------------------------------

export function GearItemDialog({
  kind,
  item,
  open,
  onOpenChange,
  scope,
  onAdded,
}: {
  kind: GearKind;
  item?: GearItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Telescope used for live previews (magnification, field…). */
  scope?: PreviewScope | null;
  onAdded?: (kind: GearKind, item: GearItem) => void;
}) {
  const editing = !!item;
  const [tab, setTab] = useState<"popular" | "custom">(editing ? "custom" : "popular");
  const [draft, setDraft] = useState<Draft>(() => draftFrom(kind, item));
  const [showErrors, setShowErrors] = useState(false);
  const [query, setQuery] = useState("");
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const { create, update } = useGearMutations();

  useEffect(() => {
    if (!open) return;
    setTab(item ? "custom" : "popular");
    setDraft(draftFrom(kind, item));
    setShowErrors(false);
    setQuery("");
    setAdded(new Set());
    create.reset();
    update.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, kind, item]);

  const multi = kind !== "telescopes" && kind !== "cameras";
  const label = KIND_LABEL[kind];
  const { body, errors, autoName } = buildBody(kind, draft);
  const err = showErrors ? errors : {};
  const set = (k: keyof Draft) => (v: string) => setDraft((d) => ({ ...d, [k]: v }));
  const saving = create.isPending || update.isPending;
  const serverError = (editing ? update.error : create.error)?.message;

  const quickAdd = (r: PresetRow) => {
    setPendingKey(r.key);
    create.mutate(
      { kind, body: r.body },
      {
        onSuccess: (created) => {
          setAdded((s) => new Set(s).add(r.key));
          toast({ title: `Added ${r.title}` });
          onAdded?.(kind, created);
          if (!multi) onOpenChange(false);
        },
        onError: (e) => toast({ title: `Couldn't add ${r.title}`, description: e.message, variant: "destructive" }),
        onSettled: () => setPendingKey(null),
      },
    );
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setShowErrors(true);
    if (!body) return;
    if (editing && item) {
      update.mutate(
        { kind, id: item.id, body },
        {
          onSuccess: () => {
            toast({ title: "Saved" });
            onOpenChange(false);
          },
        },
      );
    } else {
      create.mutate(
        { kind, body },
        {
          onSuccess: (created) => {
            toast({ title: `Added ${String(body.name)}` });
            onAdded?.(kind, created);
            onOpenChange(false);
          },
        },
      );
    }
  };

  const form = (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <KindFields kind={kind} draft={draft} set={set} err={err} autoName={autoName} autoFocus={!editing} />
      <Preview kind={kind} draft={draft} body={body} scope={scope} />
      {serverError && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {serverError}
        </p>
      )}
      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="animate-spin" />}
          {editing ? "Save changes" : `Add ${label.one}`}
        </Button>
      </div>
    </form>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl"
        onOpenAutoFocus={(e) => {
          // With a mouse/trackpad, start typing a model straight away; on touch screens don't pop the keyboard over the list.
          if (!editing && window.matchMedia?.("(pointer: fine)").matches) {
            e.preventDefault();
            document.getElementById("gear-preset-search")?.focus();
          }
        }}
      >
        <DialogHeader className="px-5 pb-3 pt-5 text-left">
          <DialogTitle>{editing ? `Edit ${label.one}` : label.add}</DialogTitle>
          <DialogDescription>
            {editing ? "Changes apply everywhere AstroPilot uses this item." : multi ? "Tap everything you own — you can add several at once." : "Pick a popular model or enter its specs."}
          </DialogDescription>
        </DialogHeader>
        {editing ? (
          <div className="overflow-y-auto px-5 pb-5 pt-1">{form}</div>
        ) : (
          <Tabs value={tab} onValueChange={(v) => setTab(v as "popular" | "custom")} className="flex min-h-0 flex-1 flex-col">
            <div className="px-5">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="popular">Popular models</TabsTrigger>
                <TabsTrigger value="custom">Enter specs</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="popular" className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
              <PresetList
                kind={kind}
                scope={scope}
                query={query}
                setQuery={setQuery}
                added={added}
                pendingKey={pendingKey}
                onAdd={quickAdd}
                onCustomise={(r) => {
                  setDraft(draftFrom(kind, r.body));
                  setShowErrors(false);
                  setTab("custom");
                }}
              />
              {multi && added.size > 0 && (
                <div className="flex items-center justify-between gap-3 border-t px-5 py-3">
                  <span className="text-sm text-muted-foreground">
                    Added <span className="num text-foreground">{added.size}</span> {added.size === 1 ? label.one : label.many.toLowerCase()}
                  </span>
                  <Button onClick={() => onOpenChange(false)}>Done</Button>
                </div>
              )}
            </TabsContent>
            <TabsContent value="custom" className="mt-0 min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4 data-[state=inactive]:hidden">
              {form}
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PresetList({
  kind,
  scope,
  query,
  setQuery,
  added,
  pendingKey,
  onAdd,
  onCustomise,
}: {
  kind: GearKind;
  scope?: PreviewScope | null;
  query: string;
  setQuery: (q: string) => void;
  added: Set<string>;
  pendingKey: string | null;
  onAdd: (r: PresetRow) => void;
  onCustomise: (r: PresetRow) => void;
}) {
  const rows = useMemo(() => presetRows(kind, scope), [kind, scope]);
  const filtered = useMemo(() => {
    // Word-prefix matching: "hyperion 5" finds the 5 mm, not the 3.5 mm; "200" finds "200P".
    const tokens = norm(query).split(/\s+/).filter(Boolean);
    return tokens.length ? rows.filter((r) => tokens.every((t) => r.words.some((w) => w.startsWith(t)))) : rows;
  }, [rows, query]);
  const groups = useMemo(() => {
    const m = new Map<string, PresetRow[]>();
    for (const r of filtered) m.set(r.group, [...(m.get(r.group) ?? []), r]);
    return [...m.entries()];
  }, [filtered]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-5 pb-2 pt-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="gear-preset-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={PLACEHOLDER[kind]}
            className="h-10 pl-9"
            aria-label={`Search popular ${KIND_LABEL[kind].many.toLowerCase()}`}
            autoComplete="off"
          />
        </div>
      </div>
      <div className="min-h-[12rem] flex-1 overflow-y-auto px-2 pb-3 sm:max-h-[26rem]">
        {groups.length === 0 && (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">
            Nothing matches “{query}”. Use <span className="font-medium text-foreground">Enter specs</span> to add it yourself.
          </p>
        )}
        {groups.map(([group, items]) => (
          <section key={group} aria-label={group} className="pb-1">
            <h3 className="eyebrow sticky top-0 z-10 bg-background px-3 pb-1 pt-3">{group}</h3>
            <ul>
              {items.map((r) => {
                const isAdded = added.has(r.key);
                const pending = pendingKey === r.key;
                return (
                  <li key={r.key} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onAdd(r)}
                      disabled={pending}
                      className="flex min-h-[44px] min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`Add ${r.title}`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{r.title}</span>
                        <span className="num block truncate text-xs text-muted-foreground">{r.detail}</span>
                      </span>
                      <span className={cn("flex shrink-0 items-center gap-1 text-xs", isAdded ? "text-q-excellent" : "text-primary")}>
                        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : isAdded ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                        {isAdded ? "Added" : "Add"}
                      </span>
                    </button>
                    <Button type="button" variant="ghost" size="icon" className="shrink-0 text-muted-foreground" onClick={() => onCustomise(r)} aria-label={`Adjust ${r.title} before adding`}>
                      <SlidersHorizontal />
                    </Button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

const PLACEHOLDER: Record<GearKind, string> = {
  telescopes: "Search, e.g. 200P, C8, ED80, Seestar",
  eyepieces: "Search, e.g. Hyperion 13, Plössl 25, zoom",
  barlows: "Search, e.g. 2×, Powermate, reducer",
  filters: "Search, e.g. OIII, UHC, moon",
  cameras: "Search, e.g. 533, 2600, Canon",
};

function KindFields({ kind, draft, set, err, autoName, autoFocus }: { kind: GearKind; draft: Draft; set: (k: keyof Draft) => (v: string) => void; err: Errors; autoName: string; autoFocus: boolean }) {
  const nameField = (
    <Field id="gear-name" label="Name" error={err.name} hint="Leave blank to use the suggested name.">
      <Input id="gear-name" value={draft.name} onChange={(e) => set("name")(e.target.value)} placeholder={autoName} maxLength={L.name} className="h-10" aria-describedby="gear-name-msg" />
    </Field>
  );
  switch (kind) {
    case "telescopes": {
      const bino = draft.type === "binoculars";
      const ap = num(draft.aperture);
      return (
        <>
          <Field id="gear-type" label="Type" error={err.type}>
            <Select value={draft.type || undefined} onValueChange={set("type")}>
              <SelectTrigger id="gear-type" className="h-10">
                <SelectValue placeholder="Choose a type" />
              </SelectTrigger>
              <SelectContent>
                {TELESCOPE_TYPES.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id="gear-aperture" label="Aperture" error={err.aperture} hint={ap && ap >= 25 ? `${fmtInches(ap)} diameter` : "Lens or mirror diameter"}>
              <NumInput id="gear-aperture" value={draft.aperture} onChange={set("aperture")} unit="mm" placeholder={bino ? "50" : "200"} error={err.aperture} autoFocus={autoFocus} />
            </Field>
            {bino ? (
              <Field id="gear-mag" label="Magnification" error={err.magnification} hint="The first number, e.g. 10 in 10×50">
                <NumInput id="gear-mag" value={draft.magnification} onChange={set("magnification")} unit="×" placeholder="10" error={err.magnification} />
              </Field>
            ) : (
              <Field id="gear-focal" label="Focal length" error={err.focalLength} hint="Printed on the tube">
                <NumInput id="gear-focal" value={draft.focalLength} onChange={set("focalLength")} unit="mm" placeholder="1200" error={err.focalLength} />
              </Field>
            )}
          </div>
          {!bino && draft.type !== "refractor" && draft.type !== "smart" && (
            <Field id="gear-obstruction" label="Central obstruction (optional)" error={err.obstruction} hint="Secondary mirror diameter as % of the aperture — typically 20–25% for Newtonians, 30–37% for SCTs.">
              <NumInput id="gear-obstruction" value={draft.obstruction} onChange={set("obstruction")} unit="%" placeholder="—" error={err.obstruction} />
            </Field>
          )}
          {nameField}
        </>
      );
    }
    case "eyepieces":
      return (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field id="gear-focal" label="Focal length" error={err.focalLength} hint="Printed on the barrel">
              <NumInput id="gear-focal" value={draft.focalLength} onChange={set("focalLength")} unit="mm" placeholder="25" error={err.focalLength} autoFocus={autoFocus} />
            </Field>
            <Field id="gear-afov" label="Apparent field" error={err.afov} hint="Plössls ~50°, wide-angles 68–82°">
              <NumInput id="gear-afov" value={draft.afov} onChange={set("afov")} unit="°" placeholder="52" error={err.afov} />
            </Field>
          </div>
          {nameField}
        </>
      );
    case "barlows":
      return (
        <>
          <Field id="gear-factor" label="Factor" error={err.factor} hint="2 for a 2× Barlow; below 1 for a focal reducer (e.g. 0.63).">
            <NumInput id="gear-factor" value={draft.factor} onChange={set("factor")} unit="×" placeholder="2" error={err.factor} autoFocus={autoFocus} />
          </Field>
          {nameField}
        </>
      );
    case "filters":
      return (
        <>
          <Field id="gear-type" label="Kind of filter" error={err.type} hint={draft.type ? FILTER_USE[draft.type] : undefined}>
            <Select value={draft.type || undefined} onValueChange={set("type")}>
              <SelectTrigger id="gear-type" className="h-10" aria-describedby="gear-type-msg">
                <SelectValue placeholder="Choose a kind" />
              </SelectTrigger>
              <SelectContent>
                {FILTER_TYPES.filter((f) => !("legacy" in f) || f.id === draft.type).map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {nameField}
        </>
      );
    case "cameras": {
      const fmt = SENSOR_FORMATS.find((f) => String(f.w) === draft.sensorW && String(f.h) === draft.sensorH);
      return (
        <>
          <Field id="gear-type" label="Kind of camera" error={err.type}>
            <Select value={draft.type || undefined} onValueChange={set("type")}>
              <SelectTrigger id="gear-type" className="h-10">
                <SelectValue placeholder="Choose a kind" />
              </SelectTrigger>
              <SelectContent>
                {CAMERA_TYPES.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {draft.type !== "smartphone" && (
            <>
              <Field id="gear-format" label="Sensor format" hint="Pick a common size, or type the exact dimensions below.">
                <Select
                  value={fmt?.id ?? ""}
                  onValueChange={(id) => {
                    const f = SENSOR_FORMATS.find((x) => x.id === id);
                    if (f) {
                      set("sensorW")(String(f.w));
                      set("sensorH")(String(f.h));
                    }
                  }}
                >
                  <SelectTrigger id="gear-format" className="h-10">
                    <SelectValue placeholder="Choose a format" />
                  </SelectTrigger>
                  <SelectContent>
                    {SENSOR_FORMATS.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.label} — {f.w} × {f.h} mm
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <div className="grid grid-cols-3 gap-3">
                <Field id="gear-sw" label="Width" error={err.sensorW}>
                  <NumInput id="gear-sw" value={draft.sensorW} onChange={set("sensorW")} unit="mm" placeholder="23.5" error={err.sensorW} />
                </Field>
                <Field id="gear-sh" label="Height" error={err.sensorH}>
                  <NumInput id="gear-sh" value={draft.sensorH} onChange={set("sensorH")} unit="mm" placeholder="15.6" error={err.sensorH} />
                </Field>
                <Field id="gear-px" label="Pixel" error={err.pixel}>
                  <NumInput id="gear-px" value={draft.pixel} onChange={set("pixel")} unit="µm" placeholder="3.76" error={err.pixel} />
                </Field>
              </div>
            </>
          )}
          {nameField}
        </>
      );
    }
  }
}

/** Live "what this gives you" line under the form. */
function Preview({ kind, draft, body, scope }: { kind: GearKind; draft: Draft; body: GearBody | null; scope?: PreviewScope | null }) {
  let text: ReactNode = null;
  const sc = onScope(scope);
  if (kind === "telescopes") {
    const ap = num(draft.aperture);
    const fl = draft.type === "binoculars" ? (num(draft.magnification) ?? 0) * BINOCULAR_NOMINAL_EYEPIECE : num(draft.focalLength);
    if (ap && fl && ap >= L.aperture.min && fl >= 1) {
      const lim = scopeLimits({ aperture: ap, focalLength: fl });
      text =
        draft.type === "binoculars" ? (
          <>
            <span className="num">{fmtLightGrasp(lim.lightGrasp)}</span> the light of your eye · <span className="num">{fmtPupil(ap / (fl / BINOCULAR_NOMINAL_EYEPIECE))}</span> exit pupil · stars to
            mag <span className="num">{lim.limitingMag.toFixed(1)}</span>
          </>
        ) : (
          <>
            <span className="num">{fmtFRatio(lim.fRatio)}</span> · gathers <span className="num">{fmtLightGrasp(lim.lightGrasp)}</span> the light of your eye · resolves{" "}
            <span className="num">{fmtArcsec(lim.dawes)}</span> · useful up to <span className="num">{fmtMag(lim.maxUsefulMag)}</span>
          </>
        );
    }
  } else if (kind === "eyepieces" && sc) {
    const fl = num(draft.focalLength);
    if (fl && fl >= L.eyepieceFocal.min) {
      const s = setup(sc, { focalLength: fl, afov: num(draft.afov) || null });
      text = (
        <>
          On your {sc.name}: <span className="num">{fmtMag(s.magnification)}</span> · <span className="num">{fmtPupil(s.exitPupil)}</span> exit pupil ·{" "}
          <span className="num">{fmtField(s.trueField)}</span> true field
        </>
      );
    }
  } else if (kind === "barlows" && sc) {
    const f = num(draft.factor);
    if (f && f >= L.barlowFactor.min && f <= L.barlowFactor.max)
      text = (
        <>
          On your {sc.name}: <span className="num">{Math.round(sc.focalLength)}</span> → <span className="num">{Math.round(sc.focalLength * f)} mm</span> ·{" "}
          <span className="num">{fmtFRatio(sc.focalLength / sc.aperture)}</span> → <span className="num">{fmtFRatio((sc.focalLength * f) / sc.aperture)}</span>
        </>
      );
  } else if (kind === "cameras" && sc && body?.sensorSize) {
    const s = parseSensor(String(body.sensorSize));
    if (s) {
      const fov = cameraField(sc.focalLength, s.w, s.h, s.pixel ?? undefined);
      text = (
        <>
          On your {sc.name}: <span className="num">{fmtFieldPair(fov.widthDeg, fov.heightDeg)}</span> field
          {fov.scale && (
            <>
              {" "}
              · <span className="num">{fov.scale.toFixed(2)}″</span> per pixel
            </>
          )}
        </>
      );
    }
  } else if (kind === "filters" && draft.type) {
    text = FILTER_USE[draft.type] ? `Best for: ${FILTER_USE[draft.type].charAt(0).toLowerCase()}${FILTER_USE[draft.type].slice(1)}` : null;
  }
  if (!text) return null;
  return <p className="rounded-lg bg-surface-2 px-3 py-2.5 text-sm text-muted-foreground">{text}</p>;
}
