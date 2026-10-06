import { useMemo, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { Aperture, Camera, Check, Eye, Plus, Telescope, ZoomIn } from "lucide-react";
import type { ApiGear, GearKind } from "@shared/api";
import { normalizeTelescopeType, usesEyepieces } from "@shared/data/gear-presets";
import { EmptyState, ErrorState, PageHeader, Section, Skel, usePageTitle } from "@/components/common/Page";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { usePrefs } from "@/hooks/usePrefs";
import { SCOPE_PRESETS, useActiveScope, useGear } from "@/hooks/useScope";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { GearItemDialog, type PreviewScope } from "./GearItemDialog";
import { BarlowList, CameraList, DeleteConfirm, EyepieceTable, FilterList, ItemMenu, TelescopeCard } from "./GearParts";
import { stagger } from "@/lib/motion";
import { KitChart } from "./KitChart";
import { analyseKit, gapSentence, type KitAnalysis } from "./kit";
import { fmtFocal } from "./format";
import { useGearMutations, type GearItem } from "./useGearMutations";

const ADD_MENU: { kind: GearKind; label: string; icon: typeof Telescope }[] = [
  { kind: "telescopes", label: "Telescope or binoculars", icon: Telescope },
  { kind: "eyepieces", label: "Eyepiece", icon: Eye },
  { kind: "barlows", label: "Barlow, reducer or corrector", icon: ZoomIn },
  { kind: "filters", label: "Filter", icon: Aperture },
  { kind: "cameras", label: "Camera", icon: Camera },
];

export default function GearPage() {
  usePageTitle("Gear");
  const { user, isLoading } = useAuth();
  if (isLoading) return <GearSkeleton />;
  return user ? <MyGear /> : <GuestGear />;
}

function GearSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <Skel className="h-12 w-56" />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Skel className="h-44" />
        <Skel className="h-44" />
      </div>
      <Skel className="h-40" />
      <Skel className="h-56" />
    </div>
  );
}

/** Headline + chart + notes about how well an eyepiece kit covers a telescope's useful range. */
export function KitPanel({ analysis, footnote }: { analysis: KitAnalysis; footnote?: ReactNode }) {
  const first = analysis.missing[0];
  return (
    <div className="panel flex flex-col gap-4 p-4 sm:p-5">
      <div>
        <div className="eyebrow">Your magnification range</div>
        <p className="mt-1.5 text-[0.95rem] font-medium leading-snug">{analysis.headline}</p>
        {analysis.points.length > 0 && first && !first.outOfReach && (
          <p className="mt-1 text-sm text-muted-foreground">
            {first.band.label} is for {first.band.purpose}.
          </p>
        )}
        {analysis.points.length > 0 && analysis.missing.length > 1 && (
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {analysis.missing.slice(1).map((b) => (
              <li key={b.band.id}>{gapSentence(b)}</li>
            ))}
          </ul>
        )}
      </div>
      <KitChart analysis={analysis} />
      {analysis.notes.length > 0 && (
        <ul className="space-y-1.5 border-t pt-3 text-xs text-muted-foreground">
          {analysis.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      {footnote && <p className="text-2xs text-muted-foreground">{footnote}</p>}
    </div>
  );
}

function AddMenu({ onPick }: { onPick: (k: GearKind) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button>
          <Plus /> Add equipment
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {ADD_MENU.map(({ kind, label, icon: Icon }) => (
          <DropdownMenuItem key={kind} onSelect={() => onPick(kind)} className="py-2.5">
            <Icon className="text-muted-foreground" /> {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SmallEmpty({ children, action }: { children: ReactNode; action: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-dashed px-4 py-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <p className="max-w-xl">{children}</p>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

const DELETE_NOTE: Record<GearKind, string> = {
  telescopes: "Observations you logged with it stay in your journal; they just won't name this telescope any more.",
  eyepieces: "Observations you logged with it stay in your journal; they just won't name this eyepiece any more.",
  barlows: "Observations you logged with it stay in your journal; they just won't name it any more.",
  filters: "Observations you logged with it stay in your journal; they just won't name this filter any more.",
  cameras: "Observations and photos stay in your journal; they just won't name this camera any more.",
};

function MyGear() {
  const gear = useGear();
  const { prefs, setPrefs } = usePrefs();
  const active = useActiveScope();
  const { remove } = useGearMutations();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [dlg, setDlg] = useState<{ kind: GearKind; item: GearItem | null }>({ kind: "telescopes", item: null });
  const [dlgOpen, setDlgOpen] = useState(false);
  // Kept after closing so the confirm dialog doesn't blank out during its exit animation.
  const [del, setDelState] = useState<{ kind: GearKind; item: GearItem } | null>(null);
  const [delOpen, setDelOpen] = useState(false);
  const setDel = (v: { kind: GearKind; item: GearItem } | null) => {
    if (v) setDelState(v);
    setDelOpen(!!v);
  };

  const g: ApiGear | undefined = gear.data;
  const tels = g?.telescopes ?? [];
  const defaultId = tels.find((t) => t.id === prefs.defaultTelescopeId)?.id ?? tels[0]?.id ?? null;
  const selected = tels.find((t) => t.id === selectedId) ?? tels.find((t) => t.id === active.telescopeId) ?? tels.find((t) => t.id === defaultId) ?? null;
  const scope: PreviewScope | null = selected
    ? { name: selected.name, aperture: selected.aperture, focalLength: selected.focalLength, obstruction: selected.obstructionRatio, type: selected.type }
    : null;
  const eps = useMemo(() => (g?.eyepieces ?? []).map((e) => ({ id: e.id, name: e.name, focalLength: e.focalLength, afov: e.apparentFov })), [g]);
  const bars = useMemo(() => (g?.barlows ?? []).map((b) => ({ id: b.id, name: b.name, factor: b.factor })), [g]);
  const visualScope = scope && usesEyepieces(scope.type) ? scope : null;
  const analysis = useMemo(() => (visualScope ? analyseKit(visualScope, eps, bars) : null), [visualScope?.aperture, visualScope?.focalLength, visualScope?.type, eps, bars]); // eslint-disable-line react-hooks/exhaustive-deps

  const openAdd = (kind: GearKind) => {
    setDlg({ kind, item: null });
    setDlgOpen(true);
  };
  const openEdit = (kind: GearKind, item: GearItem) => {
    setDlg({ kind, item });
    setDlgOpen(true);
  };
  const makeDefault = (id: number, name: string) => {
    setPrefs({ defaultTelescopeId: id });
    active.setTelescope(id);
    setSelectedId(id);
    toast({ title: `${name} is your default`, description: "Tonight's suggestions and eyepiece advice now use it." });
  };
  const confirmDelete = () => {
    if (!del) return;
    const { kind, item } = del;
    remove.mutate(
      { kind, id: item.id },
      {
        onSuccess: () => {
          toast({ title: `Deleted ${item.name}` });
          if (kind === "telescopes" && item.id === selectedId) setSelectedId(null);
          setDel(null);
        },
        onError: (e) => toast({ title: `Couldn't delete ${item.name}`, description: e.message, variant: "destructive" }),
      },
    );
  };

  const header = (
    <PageHeader
      eyebrow="Equipment"
      title="Your gear"
      description="Magnification, exit pupil and what will show up tonight are worked out for the instruments you add here."
      actions={<AddMenu onPick={openAdd} />}
    />
  );

  if (gear.isLoading) return <GearSkeleton />;
  if (gear.isError || !g)
    return (
      <div className="flex flex-col gap-8">
        {header}
        <ErrorState message={gear.error?.message} onRetry={() => gear.refetch()} />
      </div>
    );

  const nothing = !tels.length && !g.eyepieces.length && !g.barlows.length && !g.filters.length && !g.cameras.length;

  return (
    <div className="flex flex-col gap-10">
      {header}

      <Section
        title="Telescopes"
        description={tels.length > 1 ? "Tap a telescope to see what your eyepieces, Barlows and cameras do on it." : undefined}
        action={
          tels.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => openAdd("telescopes")}>
              <Plus /> Add
            </Button>
          )
        }
      >
        {tels.length ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {tels.map((t, i) => (
              <div key={t.id} className="grid animate-rise grid-cols-1" style={stagger(i, 70)}>
                <TelescopeCard
                  t={t}
                  isDefault={t.id === defaultId}
                  onMakeDefault={() => makeDefault(t.id, t.name)}
                  selected={tels.length > 1 && t.id === selected?.id}
                  onSelect={tels.length > 1 ? () => setSelectedId(t.id) : undefined}
                  onEdit={() => openEdit("telescopes", t)}
                  onDelete={() => setDel({ kind: "telescopes", item: t })}
                />
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Telescope className="h-5 w-5" />}
            title={nothing ? "Start with your telescope" : "Add your telescope"}
            description="Its aperture and focal length unlock magnification, exit pupil, the faintest objects you can reach — and advice on every eyepiece."
            action={
              <Button onClick={() => openAdd("telescopes")}>
                <Plus /> Add telescope
              </Button>
            }
          />
        )}
      </Section>

      <Section
        title="Eyepieces"
        description={visualScope ? <>Magnifications on your {visualScope.name}</> : scope ? `${scope.name} doesn't take eyepieces — pick another telescope above to see eyepiece numbers.` : undefined}
        action={
          g.eyepieces.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => openAdd("eyepieces")}>
              <Plus /> Add
            </Button>
          )
        }
      >
        {analysis && <KitPanel analysis={analysis} />}
        {g.eyepieces.length > 0 ? (
          visualScope ? (
            <EyepieceTable
              scope={visualScope}
              eyepieces={eps}
              barlows={bars}
              onEdit={(id) => {
                const e = g.eyepieces.find((x) => x.id === id);
                if (e) openEdit("eyepieces", e);
              }}
              onDelete={(id) => {
                const e = g.eyepieces.find((x) => x.id === id);
                if (e) setDel({ kind: "eyepieces", item: e });
              }}
            />
          ) : (
            <ul className="panel divide-y">
              {g.eyepieces.map((e) => (
                <li key={e.id} className="flex animate-fade items-center gap-3 px-3 py-2.5 sm:px-4">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{e.name}</div>
                    <div className="num text-xs text-muted-foreground">
                      {fmtFocal(e.focalLength)}
                      {e.apparentFov ? ` · ${e.apparentFov}° apparent field` : ""}
                    </div>
                  </div>
                  <ItemMenu name={e.name} onEdit={() => openEdit("eyepieces", e)} onDelete={() => setDel({ kind: "eyepieces", item: e })} />
                </li>
              ))}
            </ul>
          )
        ) : (
          <SmallEmpty
            action={
              <Button variant="outline" onClick={() => openAdd("eyepieces")}>
                <Plus /> Add eyepieces
              </Button>
            }
          >
            Add the eyepieces you own to see the magnification, exit pupil and field each one gives — and which gap in your kit to fill first.
          </SmallEmpty>
        )}
      </Section>

      <Section
        title="Barlows, reducers & correctors"
        action={
          g.barlows.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => openAdd("barlows")}>
              <Plus /> Add
            </Button>
          )
        }
      >
        {g.barlows.length > 0 ? (
          <BarlowList items={g.barlows} scope={scope} onEdit={(b) => openEdit("barlows", b)} onDelete={(b) => setDel({ kind: "barlows", item: b })} />
        ) : (
          <SmallEmpty
            action={
              <Button variant="outline" onClick={() => openAdd("barlows")}>
                <Plus /> Add Barlow, reducer or corrector
              </Button>
            }
          >
            A 2× Barlow doubles every eyepiece's power; a focal reducer widens the view; a coma corrector (a Paracorr, say) sharpens the edge of the field. AstroPilot includes them when it picks an eyepiece.
          </SmallEmpty>
        )}
      </Section>

      <Section
        title="Filters"
        action={
          g.filters.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => openAdd("filters")}>
              <Plus /> Add
            </Button>
          )
        }
      >
        {g.filters.length > 0 ? (
          <FilterList items={g.filters} scope={scope} eyepieces={g.eyepieces} onEdit={(f) => openEdit("filters", f)} onDelete={(f) => setDel({ kind: "filters", item: f })} />
        ) : (
          <SmallEmpty
            action={
              <Button variant="outline" onClick={() => openAdd("filters")}>
                <Plus /> Add filter
              </Button>
            }
          >
            Nebula filters (UHC, OIII, H-beta) make emission and planetary nebulae stand out, even from the suburbs. Add yours and AstroPilot will say when to use them.
          </SmallEmpty>
        )}
      </Section>

      <Section
        title="Cameras"
        action={
          g.cameras.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => openAdd("cameras")}>
              <Plus /> Add
            </Button>
          )
        }
      >
        {g.cameras.length > 0 ? (
          <CameraList items={g.cameras} scope={scope} onEdit={(c) => openEdit("cameras", c)} onDelete={(c) => setDel({ kind: "cameras", item: c })} />
        ) : (
          <SmallEmpty
            action={
              <Button variant="outline" onClick={() => openAdd("cameras")}>
                <Plus /> Add camera
              </Button>
            }
          >
            Add a camera to see its field of view and image scale on each telescope.
          </SmallEmpty>
        )}
      </Section>

      <GearItemDialog
        kind={dlg.kind}
        item={dlg.item}
        open={dlgOpen}
        onOpenChange={setDlgOpen}
        scope={dlg.kind === "telescopes" ? null : scope}
        onAdded={(kind, item) => {
          if (kind === "telescopes") setSelectedId(item.id);
        }}
      />
      <DeleteConfirm
        open={delOpen}
        onOpenChange={(o) => !o && setDel(null)}
        title={del ? `Delete ${del.item.name}?` : ""}
        description={del ? DELETE_NOTE[del.kind] : ""}
        onConfirm={confirmDelete}
        pending={remove.isPending}
      />
    </div>
  );
}

// ------------------------------------------------------------------------------------
// Signed out
// ------------------------------------------------------------------------------------

function GuestGear() {
  const active = useActiveScope();
  const preset = SCOPE_PRESETS.find((p) => p.id === active.presetId) ?? SCOPE_PRESETS[4];
  const type = preset.kind === "eye" ? null : normalizeTelescopeType(preset.name);
  const scope: PreviewScope = { name: preset.name, aperture: preset.aperture, focalLength: preset.focalLength, type };
  const visual = preset.kind === "telescope";
  const analysis = useMemo(() => (visual ? analyseKit(scope, active.eyepieces, []) : null), [preset.id, visual]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col gap-10">
      <PageHeader eyebrow="Equipment" title="Gear" description="AstroPilot works out magnification, exit pupil and what you can see for the instrument you actually use." />

      <section className="panel grid gap-5 p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:p-6">
        <div>
          <h2 className="text-[1.05rem] font-semibold tracking-tight">Your gear powers personalised advice</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            {[
              "Which of your eyepieces to use on each object, with the magnification and field it gives",
              "What your aperture can reach tonight from your sky",
              "When a filter will help, and which gap in your eyepiece kit to fill first",
            ].map((t) => (
              <li key={t} className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-2 sm:w-48">
          <Button asChild>
            <Link href="/register">Create free account</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </section>

      <Section title="Which instrument do you use?" description="Until you add your own gear, suggestions are worked out for this one.">
        <div role="radiogroup" aria-label="Instrument" className="flex flex-wrap gap-2">
          {SCOPE_PRESETS.map((p) => {
            const on = p.id === preset.id;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => active.setPreset(p.id)}
                className={cn(
                  "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  on ? "border-primary/60 bg-primary/10 font-medium text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {on && <Check className="h-3.5 w-3.5 text-primary" aria-hidden="true" />}
                {p.name}
              </button>
            );
          })}
        </div>
        {preset.kind === "eye" ? (
          <div className="panel p-5 text-sm text-muted-foreground">
            <div className="font-medium text-foreground">Naked eye</div>
            <p className="mt-1 max-w-2xl">
              No optics needed: suggestions focus on planets, bright star clusters, the Milky Way, meteor showers and the Moon. From a dark site your eyes reach stars of about
              magnitude <span className="num text-foreground">6.5</span>.
            </p>
          </div>
        ) : (
          <TelescopeCard t={{ name: preset.name, aperture: preset.aperture, focalLength: preset.focalLength, type, obstructionRatio: null }} />
        )}
      </Section>

      {analysis && (
        <Section title="Eyepieces" description="Assuming a typical starter kit — sign up to use your own.">
          <KitPanel analysis={analysis} />
          <EyepieceTable scope={scope} eyepieces={active.eyepieces} barlows={[]} />
        </Section>
      )}

      <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed p-5 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>Save your telescopes, eyepieces, filters and cameras — free, and only you can see them.</p>
        <Button asChild>
          <Link href="/register">Create free account</Link>
        </Button>
      </div>
    </div>
  );
}
