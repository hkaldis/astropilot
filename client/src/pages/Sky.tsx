import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "wouter";
import { MapPin, MousePointerClick, Sunrise } from "lucide-react";
import {
  HOUR_MS,
  PLANET_BY_ID,
  compassPoint,
  currentNightDate,
  formatDate,
  formatTime,
  nightFrames,
  nightOf,
  type NightFrames,
  type Site,
  type SolarSystemId,
} from "@shared/astro";
import type { ApiTarget, ObservingSite } from "@shared/api";
import { EmptyState, PageHeader, usePageTitle } from "@/components/common/Page";
import { PlacePicker, placeLabel } from "@/components/common/PlacePicker";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useCatalog } from "@/hooks/useCatalog";
import { useNow } from "@/hooks/useNow";
import { usePrefs } from "@/hooks/usePrefs";
import { siteTz, useSite } from "@/hooks/useSite";
import { useTheme } from "@/hooks/useTheme";
import { toast } from "@/hooks/use-toast";
import { api, queryClient } from "@/lib/api";
import { store } from "@/lib/storage";
import { prepDsos, useSkyData } from "@/features/sky/data";
import { computeScene } from "@/features/sky/engine";
import { buildSearchIndex, positionOf, refForFocus, resolveRef, type ObjectContext } from "@/features/sky/objects";
import { InfoPanel, LayerChips, Legend, UpNow } from "@/features/sky/Panels";
import { DEFAULT_LAYERS, type Layers } from "@/features/sky/render";
import { SkyCanvas, type SkyCanvasHandle } from "@/features/sky/SkyCanvas";
import { SkySearch } from "@/features/sky/SkySearch";
import { TimeBar, nightSpan } from "@/features/sky/TimeBar";

function skyState(sunAlt: number): { key: "day" | "civil" | "nautical" | "astro" | "dark"; label: string } {
  if (sunAlt > -0.833) return { key: "day", label: "Daylight" };
  if (sunAlt > -6) return { key: "civil", label: "Civil twilight" };
  if (sunAlt > -12) return { key: "nautical", label: "Nautical twilight" };
  if (sunAlt > -18) return { key: "astro", label: "Astronomical twilight" };
  return { key: "dark", label: "Astronomical darkness" };
}

export default function SkyPage() {
  usePageTitle("Sky chart");
  const { site, setGuestSite } = useSite();
  if (!site)
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Sky chart" description="Where to point, for your exact location and time." />
        <EmptyState
          icon={<MapPin className="h-5 w-5" />}
          title="Where are you observing from?"
          description="The chart is drawn for your horizon, so it needs a place. Search for a town or use your current position."
          action={
            <div className="w-full max-w-sm text-left">
              <PlacePicker
                onPick={(p) =>
                  setGuestSite({
                    name: placeLabel(p).split(",")[0],
                    lat: p.latitude,
                    lon: p.longitude,
                    elevation: p.elevation,
                    timezone: p.timezone,
                    bortle: 5,
                    sqm: null,
                  })
                }
              />
            </div>
          }
        />
      </div>
    );
  return <SkyChart site={site} />;
}

function SkyChart({ site: obsSite }: { site: ObservingSite }) {
  const tz = siteTz(obsSite);
  const { hour12 } = usePrefs();
  const { theme } = useTheme();
  const { isAuthenticated } = useAuth();
  const siteKey = `${obsSite.lat.toFixed(5)},${obsSite.lon.toFixed(5)},${obsSite.elevation ?? 0}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const site: Site = useMemo(() => ({ lat: obsSite.lat, lon: obsSite.lon, elevation: obsSite.elevation ?? 0 }), [siteKey]);

  // ---- Time --------------------------------------------------------------------------------------
  const now = useNow(60_000);
  const [manualTime, setManualTime] = useState<number | null>(null);
  const live = manualTime === null;
  const time = manualTime ?? now;
  const nightDate = useMemo(() => currentNightDate(now, site), [Math.floor(now / 600_000), site]); // eslint-disable-line react-hooks/exhaustive-deps
  const night = useMemo(() => nightOf(nightDate, site), [nightDate, site]);
  const scene = useMemo(() => computeScene(time, site), [time, site]);
  const state = skyState(scene.sun.alt);

  const framesRef = useRef<{ key: string; nf: NightFrames } | null>(null);
  const getFrames = useCallback(() => {
    const key = `${night.date}|${siteKey}`;
    if (!framesRef.current || framesRef.current.key !== key) framesRef.current = { key, nf: nightFrames(night, site, 10) };
    return framesRef.current.nf;
  }, [night, site, siteKey]);

  // ---- Data --------------------------------------------------------------------------------------
  const data = useSkyData();
  const catalog = useCatalog();
  const dsos = useMemo(() => prepDsos(catalog.objects), [catalog.objects]);
  const dsoById = useMemo(() => new Map(dsos.map((d) => [d.o.id.toUpperCase(), d])), [dsos]);
  const ctx: ObjectContext = useMemo(() => ({ data, dsoById }), [data.stars, data.names, data.labels, dsoById]); // eslint-disable-line react-hooks/exhaustive-deps
  const searchIndex = useMemo(() => buildSearchIndex(dsos, data), [dsos, data.names, data.labels]); // eslint-disable-line react-hooks/exhaustive-deps

  const targetsQ = useQuery<ApiTarget[]>({ queryKey: ["/api/targets"], enabled: isAuthenticated });
  const targetRefs = useMemo(() => {
    const s = new Set<string>();
    for (const t of targetsQ.data ?? []) {
      if (t.status === "dismissed") continue;
      const id = t.ref.toLowerCase();
      if (PLANET_BY_ID[id as SolarSystemId]) s.add(`body:${id}`);
      else {
        const d = dsoById.get(t.ref.toUpperCase());
        if (d) s.add(`dso:${d.o.id}`);
      }
    }
    return s;
  }, [targetsQ.data, dsoById]);

  const saveTarget = useMutation({
    mutationFn: (ref: string) => api<ApiTarget[]>("POST", "/api/targets", { ref }),
    onSuccess: (list) => {
      queryClient.setQueryData(["/api/targets"], list);
      toast({ title: "Added to your targets" });
    },
    onError: (e: Error) => toast({ title: "Couldn't save that target", description: e.message, variant: "destructive" }),
  });

  // ---- Layers ------------------------------------------------------------------------------------
  const [layers, setLayers] = useState<Layers>(() => ({ ...DEFAULT_LAYERS, ...store.get<Partial<Layers>>("ap.sky.layers", {}) }));
  const toggleLayer = (k: keyof Layers) =>
    setLayers((l) => {
      const next = { ...l, [k]: !l[k] };
      store.set("ap.sky.layers", next);
      return next;
    });

  // ---- Selection ---------------------------------------------------------------------------------
  const canvasRef = useRef<SkyCanvasHandle>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const selectedObj = useMemo(() => resolveRef(selected, ctx), [selected, ctx]);

  const centreOnRef = useCallback(
    (ref: string) => {
      const obj = resolveRef(ref, ctx);
      const pos = obj && positionOf(obj, scene);
      if (obj && pos) canvasRef.current?.centreOn(pos.alt, pos.az, obj.kind === "con" ? 1.8 : 2.6);
    },
    [ctx, scene],
  );

  const chartRef = useRef<HTMLDivElement>(null);
  const pickAndCentre = useCallback(
    (ref: string) => {
      setSelected(ref);
      centreOnRef(ref);
      // On phones the details card covers the lower screen: bring the chart to the top so the target stays visible.
      const el = chartRef.current;
      if (el && window.innerWidth < 1024) {
        const top = el.getBoundingClientRect().top + window.scrollY - 60;
        if (Math.abs(window.scrollY - top) > 24) window.scrollTo({ top, behavior: "smooth" });
      }
    },
    [centreOnRef],
  );

  // ?focus=M31 (links from object pages)
  const [params] = useSearchParams();
  const focus = params.get("focus");
  const focusDone = useRef<string | null>(null);
  const catalogReady = catalog.objects.length > 0 || !!catalog.error;
  const namesReady = data.names !== null || !data.starsLoading;
  useEffect(() => {
    if (!focus || focusDone.current === focus) return;
    const ref = refForFocus(focus, ctx);
    const obj = ref ? resolveRef(ref, ctx) : null;
    // Wait until the object's data (catalog, names or labels) is loaded and it has a position.
    if (ref && obj && positionOf(obj, scene)) {
      focusDone.current = focus;
      // Let the canvas measure itself first.
      requestAnimationFrame(() => pickAndCentre(ref));
    } else if (catalogReady && namesReady && data.labels) {
      focusDone.current = focus;
      if (ref) setSelected(ref);
      else toast({ title: `Couldn't find “${focus}” on the chart` });
    }
  }, [focus, ctx, scene, catalogReady, namesReady, data.labels, pickAndCentre]);

  // ---- Copy --------------------------------------------------------------------------------------
  const timeStr = formatTime(time, { tz, hour12 });
  const upList = scene.bodies.filter((b) => b.alt > 0).map((b) => `${b.name} ${Math.round(b.alt)}° ${compassPoint(b.az)}`);
  const ariaLabel = `Sky chart for ${obsSite.name} at ${timeStr}, ${state.label.toLowerCase()}. ${
    upList.length ? `Above the horizon: ${upList.join(", ")}.` : "No planets above the horizon."
  } Use the search box or the planet list to select objects.`;
  const [spanStart] = nightSpan(night);
  const tonightAt = night.darkStart ?? (night.sunset ? night.sunset + 1.5 * HOUR_MS : spanStart);
  const showDayHint = live && scene.sun.alt > -6 && tonightAt > now;

  return (
    <div className="flex flex-col gap-5 lg:gap-6">
      <PageHeader
        eyebrow={formatDate(time, { tz, style: "long" })}
        title="Sky chart"
        description={
          <>
            {obsSite.name} · <span className="num">{timeStr}</span> · {state.label}
          </>
        }
        actions={<SkySearch className="w-full sm:w-80" index={searchIndex} positionOf={(r) => {
          const o = resolveRef(r, ctx);
          return o ? positionOf(o, scene) : null;
        }} onPick={pickAndCentre} />}
        className="sm:items-end"
      />

      {showDayHint && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-surface-2/50 px-4 py-3 text-sm">
          <Sunrise className="h-4 w-4 shrink-0 text-gold" />
          <span className="min-w-0 flex-1 text-muted-foreground">
            {state.key === "day" ? "The Sun is up" : "It's still twilight"} in {obsSite.name}, so this is the sky right now — most stars aren't visible yet.
          </span>
          <Button size="sm" variant="subtle" onClick={() => setManualTime(tonightAt)}>
            Show tonight at {formatTime(tonightAt, { tz, hour12 })}
          </Button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-5">
          <div className="-mx-4 sm:mx-0" ref={chartRef}>
            <div className="mx-auto overflow-hidden sm:rounded-2xl sm:border" style={{ width: "min(100%, max(330px, calc(100dvh - 14.5rem)))" }}>
              <SkyCanvas
                ref={canvasRef}
                scene={scene}
                data={data}
                dsos={dsos}
                layers={layers}
                selected={selected}
                targets={targetRefs}
                themeKey={theme}
                onSelect={setSelected}
                ariaLabel={ariaLabel}
              />
            </div>
          </div>
          <TimeBar
            time={time}
            live={live}
            night={night}
            site={site}
            tz={tz}
            hour12={hour12}
            onChange={(t) => setManualTime(t)}
            onLive={() => setManualTime(null)}
          />
          <LayerChips layers={layers} onToggle={toggleLayer} showTargets={isAuthenticated} />
          {data.starsError && <p className="text-sm text-q-poor">Star data couldn't be loaded — showing planets and deep-sky objects only.</p>}
        </div>

        <aside className="flex flex-col gap-6">
          {selectedObj ? (
            <InfoPanel
              key={selectedObj.ref}
              obj={selectedObj}
              scene={scene}
              night={night}
              frames={getFrames}
              site={site}
              tz={tz}
              hour12={hour12}
              isTarget={targetRefs.has(selectedObj.ref)}
              canSaveTarget={selectedObj.kind === "dso" || (selectedObj.kind === "body" && selectedObj.bodyId !== "sun")}
              signedIn={isAuthenticated}
              savingTarget={saveTarget.isPending}
              onSaveTarget={() => saveTarget.mutate(selectedObj.dso ? selectedObj.dso.id : String(selectedObj.bodyId))}
              onCentre={() => centreOnRef(selectedObj.ref)}
              onClose={() => setSelected(null)}
              className="fixed inset-x-3 bottom-[calc(4.6rem+env(safe-area-inset-bottom,0px))] z-30 max-h-[52dvh] overflow-y-auto animate-fade-in lg:static lg:inset-auto lg:z-auto lg:max-h-none lg:overflow-visible"
            />
          ) : (
            <div className="hidden items-start gap-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground lg:flex">
              <MousePointerClick className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p>
                Click any star, planet or deep-sky object for where to look and when it's highest. Drag to pan, scroll to zoom, double-click to zoom in.
              </p>
            </div>
          )}
          <UpNow scene={scene} night={night} site={site} tz={tz} hour12={hour12} selected={selected} onPick={pickAndCentre} />
          <Legend />
          <p className="text-2xs leading-relaxed text-muted-foreground lg:hidden">
            Tap an object for details · pinch or use + / − to zoom · double-tap to zoom in.
          </p>
        </aside>
      </div>
    </div>
  );
}
