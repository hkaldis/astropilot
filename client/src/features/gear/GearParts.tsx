import { useMemo, useState, type ReactNode } from "react";
import { MoreHorizontal, Pencil, Star, Trash2 } from "lucide-react";
import type { ApiBarlow, ApiCamera, ApiEyepiece, ApiFilter, ApiTelescope } from "@shared/api";
import { cameraField, scopeLimits, setup, type BarlowSpec, type EyepieceSpec } from "@shared/astro/optics";
import {
  barlowKind,
  binocularMagnification,
  cameraTypeLabel,
  filterFamily,
  filterTypeLabel,
  parseSensor,
  telescopeTypeLabel,
  usesEyepieces,
  zoomRange,
} from "@shared/data/gear-presets";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { fmtArcsec, fmtFRatio, fmtFactor, fmtField, fmtFieldPair, fmtFocal, fmtInches, fmtLightGrasp, fmtMag, fmtPupil } from "./format";
import { pupilUse } from "./kit";
import { FILTER_USE, type PreviewScope } from "./GearItemDialog";

export type ScopeLike = Pick<ApiTelescope, "name" | "aperture" | "focalLength" | "type" | "obstructionRatio">;

// ------------------------------------------------------------------------------------
// Shared bits
// ------------------------------------------------------------------------------------

export function ItemMenu({ name, onEdit, onDelete }: { name: string; onEdit?: () => void; onDelete?: () => void }) {
  if (!onEdit && !onDelete) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground" aria-label={`Options for ${name}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {onEdit && (
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil /> Edit
          </DropdownMenuItem>
        )}
        {onDelete && (
          <DropdownMenuItem onSelect={onDelete} className="text-destructive focus:text-destructive">
            <Trash2 /> Delete
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function DeleteConfirm({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  pending,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description: ReactNode;
  onConfirm: () => void;
  pending?: boolean;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function MiniStat({ label, value, sub, hint }: { label: string; value: ReactNode; sub?: ReactNode; hint?: string }) {
  const body = (
    <div className="min-w-0">
      <div className="eyebrow">{label}</div>
      <div className="num mt-1 text-lg font-medium leading-tight">{value}</div>
      {sub && <div className="mt-0.5 truncate text-2xs text-muted-foreground">{sub}</div>}
    </div>
  );
  if (!hint) return body;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div tabIndex={0} className="pointer-events-auto cursor-help rounded-md outline-offset-4">
          {body}
        </div>
      </TooltipTrigger>
      <TooltipContent className="max-w-64 text-xs">{hint}</TooltipContent>
    </Tooltip>
  );
}

// ------------------------------------------------------------------------------------
// Telescope card
// ------------------------------------------------------------------------------------

export function scopeSubtitle(t: ScopeLike) {
  if (t.type === "binoculars") {
    const mag = binocularMagnification(t);
    return `${fmtMag(mag)} · ${fmtFocal(t.aperture)} aperture`;
  }
  return `${fmtFocal(t.aperture)} (${fmtInches(t.aperture)}) · ${fmtFocal(t.focalLength)} · ${fmtFRatio(t.focalLength / t.aperture)}`;
}

export function TelescopeCard({
  t,
  isDefault,
  onMakeDefault,
  selected,
  onSelect,
  onEdit,
  onDelete,
}: {
  t: ScopeLike;
  isDefault?: boolean;
  onMakeDefault?: () => void;
  selected?: boolean;
  onSelect?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const lim = scopeLimits({ aperture: t.aperture, focalLength: t.focalLength });
  const bino = t.type === "binoculars";
  const smart = t.type === "smart";
  const capped = lim.maxTheoreticalMag > lim.maxUsefulMag + 1;

  let stats: ReactNode;
  if (bino) {
    const mag = binocularMagnification(t);
    stats = (
      <>
        <MiniStat label="Exit pupil" value={fmtPupil(t.aperture / mag)} sub={t.aperture / mag >= 5 ? "bright, relaxed views" : "steady, high contrast"} />
        <MiniStat label="Light grasp" value={fmtLightGrasp(lim.lightGrasp)} sub="× your eye" hint="How much more light than a dark-adapted 7 mm pupil." />
        <MiniStat label="Limiting mag" value={lim.limitingMag.toFixed(1)} sub="stars, dark sky" hint="Faintest star visible from a dark site (naked-eye limit 6.5)." />
      </>
    );
  } else {
    stats = (
      <>
        <MiniStat label="Light grasp" value={fmtLightGrasp(lim.lightGrasp)} sub="× your eye" hint="How much more light than a dark-adapted 7 mm pupil: (aperture ÷ 7 mm)²." />
        <MiniStat label="Resolution" value={fmtArcsec(lim.dawes)} sub="Dawes limit" hint="The closest equal double star it can split in steady air: 116″ ÷ aperture in mm." />
        {smart ? (
          <MiniStat label="Focal ratio" value={fmtFRatio(lim.fRatio)} sub={lim.fRatio <= 5 ? "fast — short exposures" : "slower — longer exposures"} />
        ) : (
          <MiniStat
            label="Max useful"
            value={fmtMag(lim.maxUsefulMag)}
            sub={capped ? `${fmtMag(lim.maxTheoreticalMag)} in perfect air` : "2× aperture in mm"}
            hint={capped ? "Twice the aperture in mm is the optical limit, but the atmosphere rarely allows more than about 350×." : "About twice the aperture in millimetres; beyond that the view gets dim and soft."}
          />
        )}
        <MiniStat label="Limiting mag" value={lim.limitingMag.toFixed(1)} sub="stars, dark sky" hint="Faintest star visible from a dark site where the naked-eye limit is 6.5." />
      </>
    );
  }

  return (
    <div className={cn("panel relative flex flex-col p-4 transition-colors sm:p-5", selected && "border-primary/60 ring-1 ring-primary/30")}>
      {onSelect && (
        <button
          type="button"
          className="absolute inset-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onSelect}
          aria-pressed={!!selected}
          aria-label={`Show eyepiece numbers for ${t.name}`}
        />
      )}
      <div className="pointer-events-none relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="eyebrow flex items-center gap-2">
            {telescopeTypeLabel(t.type)}
            {selected && onSelect && <span className="text-primary">· shown below</span>}
          </div>
          <h3 className="mt-1 truncate text-base font-semibold leading-snug">{t.name}</h3>
          <p className="num mt-0.5 text-sm text-muted-foreground">
            {scopeSubtitle(t)}
            {t.obstructionRatio ? ` · ${Math.round(t.obstructionRatio)}% obstruction` : ""}
          </p>
        </div>
        <div className="pointer-events-auto -mr-2 -mt-1 flex shrink-0 items-center">
          {onMakeDefault &&
            (isDefault ? (
              <span className="mr-1 inline-flex h-8 items-center gap-1 rounded-full bg-gold/10 px-2.5 text-xs font-medium text-gold">
                <Star className="h-3.5 w-3.5 fill-current" aria-hidden="true" /> Default
              </span>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-muted-foreground" onClick={onMakeDefault} aria-label={`Make ${t.name} your default telescope`}>
                    <Star />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Make default</TooltipContent>
              </Tooltip>
            ))}
          <ItemMenu name={t.name} onEdit={onEdit} onDelete={onDelete} />
        </div>
      </div>
      <div className={cn("pointer-events-none relative mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-4", bino ? "sm:grid-cols-3" : "sm:grid-cols-4")}>{stats}</div>
    </div>
  );
}

// ------------------------------------------------------------------------------------
// Eyepieces on a telescope
// ------------------------------------------------------------------------------------

export function EyepieceTable({
  scope,
  eyepieces,
  barlows,
  onEdit,
  onDelete,
}: {
  scope: PreviewScope;
  eyepieces: (EyepieceSpec & { id?: number; name?: string })[];
  barlows: BarlowSpec[];
  onEdit?: (id: number) => void;
  onDelete?: (id: number) => void;
}) {
  const [withId, setWithId] = useState<string>("none");
  const barlow = barlows.find((b) => String(b.id ?? b.name) === withId) ?? null;
  const lim = scopeLimits(scope);
  const rows = useMemo(
    () =>
      [...eyepieces]
        .map((e) => {
          const zoom = zoomRange(e.name ?? "");
          const wide = setup(scope, { ...e, focalLength: zoom ? zoom[1] : e.focalLength }, barlow);
          const tight = zoom ? setup(scope, { ...e, focalLength: zoom[0] }, barlow) : wide;
          const use = pupilUse(tight.exitPupil, tight.magnification, lim.maxUsefulMag);
          const wideUse = pupilUse(wide.exitPupil, wide.magnification, lim.maxUsefulMag);
          const shown = wideUse.tone ? wideUse : use;
          return {
            e,
            key: String(e.id ?? e.name),
            name: e.name ?? fmtFocal(e.focalLength),
            useLabel: zoom ? `Zoom · ${wideUse.label.split(" · ")[0]} to ${use.label.split(" · ")[0].toLowerCase()}` : shown.label,
            tone: shown.tone,
            mag: zoom ? `${Math.round(wide.magnification)}–${fmtMag(tight.magnification)}` : fmtMag(wide.magnification),
            pupil: zoom ? `${wide.exitPupil.toFixed(1)}–${tight.exitPupil.toFixed(1)}` : wide.exitPupil.toFixed(1),
            field: zoom ? `${fmtField(tight.trueField)}–${fmtField(wide.trueField)}` : fmtField(wide.trueField),
            sortMag: wide.magnification,
          };
        })
        .sort((a, b) => a.sortMag - b.sortMag),
    [eyepieces, barlow, scope, lim.maxUsefulMag],
  );
  const hasActions = !!(onEdit || onDelete);
  const menu = (e: (typeof rows)[number]["e"]) =>
    hasActions && e.id !== undefined ? (
      <ItemMenu name={e.name ?? "eyepiece"} onEdit={onEdit ? () => onEdit(e.id!) : undefined} onDelete={onDelete ? () => onDelete(e.id!) : undefined} />
    ) : null;
  const toneClass = (t: "poor" | "fair" | null) => (t === "poor" ? "text-q-poor" : t === "fair" ? "text-q-fair" : "text-muted-foreground");

  return (
    <div className="flex flex-col gap-3">
      {barlows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground" id="with-barlow">
            Numbers for
          </span>
          <ToggleGroup type="single" value={withId} onValueChange={(v) => v && setWithId(v)} aria-labelledby="with-barlow" className="flex-wrap justify-start">
            <ToggleGroupItem value="none" size="sm" className="h-9 rounded-full border px-3 text-xs data-[state=on]:border-primary/50 data-[state=on]:bg-primary/10 data-[state=on]:text-foreground">
              Eyepiece alone
            </ToggleGroupItem>
            {barlows.map((b) => (
              <ToggleGroupItem
                key={String(b.id ?? b.name)}
                value={String(b.id ?? b.name)}
                size="sm"
                className="h-9 rounded-full border px-3 text-xs data-[state=on]:border-primary/50 data-[state=on]:bg-primary/10 data-[state=on]:text-foreground"
              >
                + {b.name ?? `${fmtFactor(b.factor)}`}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      )}
      <div className="panel overflow-hidden">
        {/* Phones: one stacked row per eyepiece (only one of list/table is ever displayed). */}
        <ul className="divide-y sm:hidden" aria-label={`Eyepieces on ${scope.name}${barlow ? ` with ${barlow.name}` : ""}`}>
          {rows.map((r) => (
            <li key={r.key} className="flex items-start gap-2 py-3 pl-3 pr-1">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium leading-snug">{r.name}</div>
                <div className={cn("text-xs", toneClass(r.tone))}>{r.useLabel}</div>
                <div className="num mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-sm">
                  <span>{r.mag}</span>
                  <span className="text-muted-foreground">{r.pupil} mm pupil</span>
                  <span className="text-muted-foreground">{r.field} field</span>
                </div>
              </div>
              {menu(r.e)}
            </li>
          ))}
        </ul>
        <table className="hidden w-full table-fixed text-sm sm:table">
          <caption className="sr-only">
            Magnification, exit pupil and true field of each eyepiece on {scope.name}
            {barlow ? ` with ${barlow.name}` : ""}
          </caption>
          <thead>
            <tr className="border-b text-left">
              <th scope="col" className="eyebrow px-4 py-2.5 font-medium">
                Eyepiece
              </th>
              <th scope="col" className="eyebrow w-28 px-2 py-2.5 text-right font-medium">
                Power
              </th>
              <th scope="col" className="eyebrow w-28 px-2 py-2.5 text-right font-medium">
                Exit pupil
              </th>
              <th scope="col" className="eyebrow w-28 px-2 py-2.5 text-right font-medium">
                True field
              </th>
              {hasActions && (
                <th scope="col" className="w-12 px-1">
                  <span className="sr-only">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.key} className="align-middle">
                <td className="px-4 py-2.5">
                  <div className="truncate font-medium">{r.name}</div>
                  <div className={cn("truncate text-xs", toneClass(r.tone))}>
                    {r.useLabel}
                    {r.e.afov ? ` · ${r.e.afov}° AFOV` : ""}
                  </div>
                </td>
                <td className="num whitespace-nowrap px-2 py-2.5 text-right">{r.mag}</td>
                <td className="num whitespace-nowrap px-2 py-2.5 text-right text-muted-foreground">{r.pupil} mm</td>
                <td className="num whitespace-nowrap px-2 py-2.5 text-right text-muted-foreground">{r.field}</td>
                {hasActions && <td className="px-1 py-1 text-right">{menu(r.e)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.some((r) => !r.e.afov) && <p className="text-2xs text-muted-foreground">Fields assume a 52° apparent field where the eyepiece's isn't set.</p>}
    </div>
  );
}

// ------------------------------------------------------------------------------------
// Barlows, filters, cameras
// ------------------------------------------------------------------------------------

function Row({ title, detail, extra, menu }: { title: ReactNode; detail?: ReactNode; extra?: ReactNode; menu?: ReactNode }) {
  return (
    <li className="flex items-start gap-3 px-3 py-3 sm:px-4">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{title}</div>
        {detail && <div className="mt-0.5 text-xs text-muted-foreground">{detail}</div>}
        {extra && <div className="mt-1 text-xs text-muted-foreground">{extra}</div>}
      </div>
      {menu && <div className="-my-1 -mr-1">{menu}</div>}
    </li>
  );
}

export function BarlowList({ items, scope, onEdit, onDelete }: { items: ApiBarlow[]; scope: PreviewScope | null; onEdit: (b: ApiBarlow) => void; onDelete: (b: ApiBarlow) => void }) {
  const sc = scope && usesEyepieces(scope.type) ? scope : null;
  return (
    <ul className="panel divide-y">
      {items.map((b) => {
        const kind = barlowKind(b.factor);
        return (
          <Row
            key={b.id}
            title={b.name}
            detail={
              <span className="num">
                {fmtFactor(b.factor)} {kind === "barlow" ? "Barlow" : kind === "reducer" ? "focal reducer" : "coma corrector"}
              </span>
            }
            extra={
              sc && Math.abs(b.factor - 1) > 0.02 ? (
                <span className="num">
                  On {sc.name}: {Math.round(sc.focalLength)} → {Math.round(sc.focalLength * b.factor)} mm, {fmtFRatio(sc.focalLength / sc.aperture)} →{" "}
                  {fmtFRatio((sc.focalLength * b.factor) / sc.aperture)}
                </span>
              ) : null
            }
            menu={<ItemMenu name={b.name} onEdit={() => onEdit(b)} onDelete={() => onDelete(b)} />}
          />
        );
      })}
    </ul>
  );
}

/** Narrowband filters work best at 3–6 mm exit pupil (H-beta: 5–7 mm). Which of your eyepieces fits? */
function filterPairing(type: string, scope: PreviewScope | null, eyepieces: ApiEyepiece[]): string | null {
  const fam = filterFamily(type);
  if (!scope || !usesEyepieces(scope.type) || !["uhc", "oiii", "h_beta"].includes(fam)) return null;
  const [lo, hi, ideal] = fam === "h_beta" ? [4.5, 7.2, 6] : [3, 6.5, 4.5];
  if (!eyepieces.length) return `Works best at ${lo}–${fam === "h_beta" ? 7 : 6} mm exit pupil.`;
  const opts = eyepieces
    .filter((e) => !zoomRange(e.name))
    .map((e) => ({ e, p: setup(scope, { focalLength: e.focalLength, afov: e.apparentFov }).exitPupil }))
    .sort((a, b) => Math.abs(a.p - ideal) - Math.abs(b.p - ideal));
  const best = opts[0];
  if (best && best.p >= lo && best.p <= hi) return `Pairs best with your ${best.e.name} — ${fmtPupil(best.p)} exit pupil.`;
  const fe = Math.round(ideal * (scope.focalLength / scope.aperture));
  return `Works best at a ${lo}–${fam === "h_beta" ? 7 : 6} mm exit pupil — about a ${fe} mm eyepiece on this telescope.`;
}

export function FilterList({
  items,
  scope,
  eyepieces,
  onEdit,
  onDelete,
}: {
  items: ApiFilter[];
  scope: PreviewScope | null;
  eyepieces: ApiEyepiece[];
  onEdit: (f: ApiFilter) => void;
  onDelete: (f: ApiFilter) => void;
}) {
  return (
    <ul className="panel divide-y">
      {items.map((f) => (
        <Row
          key={f.id}
          title={f.name}
          detail={
            <>
              {filterTypeLabel(f.type, true)}
              {FILTER_USE[f.type] ? ` · ${FILTER_USE[f.type]}` : ""}
            </>
          }
          extra={filterPairing(f.type, scope, eyepieces)}
          menu={<ItemMenu name={f.name} onEdit={() => onEdit(f)} onDelete={() => onDelete(f)} />}
        />
      ))}
    </ul>
  );
}

function cameraNotes(c: ApiCamera, scope: PreviewScope | null): ReactNode {
  if (c.type === "smartphone") return "Held to the eyepiece (afocal): what you capture is the eyepiece's field.";
  const s = parseSensor(c.sensorSize);
  if (!s) return c.sensorSize ? null : "Add the sensor size to see its field of view.";
  // Binoculars and smart telescopes (built-in camera) don't take a camera at prime focus.
  if (!scope || !usesEyepieces(scope.type)) return null;
  const f = cameraField(scope.focalLength, s.w, s.h, s.pixel ?? undefined);
  const parts: string[] = [`On ${scope.name}: ${fmtFieldPair(f.widthDeg, f.heightDeg)} field`];
  if (f.scale && s.pixel) {
    const planetary = Math.hypot(s.w, s.h) < 9; // small sensors: lucky imaging of planets, Moon, Sun
    if (planetary) {
      // Planetary rule of thumb: f-ratio ≈ 5 × pixel size (µm) samples the telescope's resolution fully.
      const targetF = 5 * s.pixel;
      const factor = targetF / (scope.focalLength / scope.aperture);
      parts.push(`${f.scale.toFixed(2)}″ per pixel`);
      if (factor > 1.3) parts.push(`for planets aim for about ${fmtFRatio(targetF)}: a ${fmtFactor(Math.round(factor * 2) / 2)} Barlow`);
    } else {
      // Deep sky: about 1–2″ per pixel suits typical 2–3″ seeing.
      const verdict = f.scale < 0.67 ? "finer than typical 2–3″ seeing needs (bin 2×2)" : f.scale <= 2 ? "well matched to typical seeing" : "coarse — fine for wide fields";
      parts.push(`${f.scale.toFixed(2)}″ per pixel, ${verdict}`);
    }
  }
  return <span className="num">{parts.join(" · ")}</span>;
}

export function CameraList({ items, scope, onEdit, onDelete }: { items: ApiCamera[]; scope: PreviewScope | null; onEdit: (c: ApiCamera) => void; onDelete: (c: ApiCamera) => void }) {
  return (
    <ul className="panel divide-y">
      {items.map((c) => (
        <Row
          key={c.id}
          title={c.name}
          detail={
            <>
              {cameraTypeLabel(c.type)}
              {c.sensorSize ? <span className="num"> · {c.sensorSize}</span> : null}
            </>
          }
          extra={cameraNotes(c, scope)}
          menu={<ItemMenu name={c.name} onEdit={() => onEdit(c)} onDelete={() => onDelete(c)} />}
        />
      ))}
    </ul>
  );
}
