/** Create / edit a session's details: title, time range, place, conditions and notes. */
import { useState } from "react";
import type { ApiLocation, ApiSession, SessionConditions } from "@shared/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { browserTimeZone } from "@/hooks/useSite";
import { NativeSelect, ScaleInput } from "./controls";
import type { SessionInput } from "./api";
import { SEEING_HINT, SEEING_LABEL, TRANSPARENCY_HINT, TRANSPARENCY_LABEL, cToF, fToC, fromWallInput, toWallInput } from "./format";

export interface SessionValues {
  title: string;
  start: number;
  end: number | null;
  locationId: number | null;
  seeing: number | null;
  transparency: number | null;
  /** In the user's display unit (°C or °F). */
  temperature: string;
  sqm: string;
  notes: string;
}

export function sessionValues(s: ApiSession | null, defaults: { locationId: number | null; imperial: boolean }): SessionValues {
  const c = s?.conditions ?? {};
  const t = c.temperatureC ?? null;
  const now = Date.now();
  return {
    title: s?.title ?? "",
    start: s ? Date.parse(s.date) : now - (now % (5 * 60_000)),
    end: s?.endDate ? Date.parse(s.endDate) : null,
    locationId: s ? s.locationId : defaults.locationId,
    seeing: c.seeing ?? null,
    transparency: c.transparency ?? null,
    temperature: t === null ? "" : String(Math.round(defaults.imperial ? cToF(t) : t)),
    sqm: c.sqmReading != null ? String(c.sqmReading) : "",
    notes: s?.notes ?? "",
  };
}

/** Form values → API body. Returns an error message instead when something is off. */
export function toSessionInput(v: SessionValues, imperial: boolean): SessionInput | string {
  if (v.end !== null && v.end <= v.start) return "The end time must be after the start time.";
  if (v.end !== null && v.end - v.start > 24 * 3_600_000) return "A session can't be longer than 24 hours.";
  const temp = v.temperature.trim() === "" ? null : Number(v.temperature);
  if (temp !== null && !Number.isFinite(temp)) return "Temperature must be a number.";
  const sqm = v.sqm.trim() === "" ? null : Number(v.sqm.replace(",", "."));
  if (sqm !== null && (!Number.isFinite(sqm) || sqm < 10 || sqm > 23)) return "SQM readings range from 10 to 23 mag/arcsec².";
  const conditions: SessionConditions = {
    seeing: v.seeing,
    transparency: v.transparency,
    temperatureC: temp === null ? null : Math.round((imperial ? fToC(temp) : temp) * 10) / 10,
    sqmReading: sqm,
  };
  return {
    title: v.title.trim() || null,
    date: new Date(v.start).toISOString(),
    endDate: v.end === null ? null : new Date(v.end).toISOString(),
    locationId: v.locationId,
    notes: v.notes.trim() || null,
    conditions,
  };
}

export function SessionForm({
  formId,
  initial,
  locations,
  imperial,
  error,
  onSubmit,
}: {
  formId: string;
  initial: SessionValues;
  locations: ApiLocation[];
  imperial: boolean;
  error?: string | null;
  onSubmit: (v: SessionValues) => void;
}) {
  const [v, setV] = useState(initial);
  const set = <K extends keyof SessionValues>(k: K, value: SessionValues[K]) => setV((p) => ({ ...p, [k]: value }));
  const loc = locations.find((l) => l.id === v.locationId) ?? null;
  const tz = loc?.timezone ?? browserTimeZone() ?? undefined;

  return (
    <form
      id={formId}
      className="flex flex-col gap-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(v);
      }}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${formId}-title`}>Title</Label>
        <Input id={`${formId}-title`} value={v.title} maxLength={120} onChange={(e) => set("title", e.target.value)} placeholder="e.g. First light with the new eyepiece" className="h-10" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${formId}-start`}>Started</Label>
          <Input
            id={`${formId}-start`}
            type="datetime-local"
            className="h-10"
            value={toWallInput(v.start, tz)}
            onChange={(e) => {
              const ms = fromWallInput(e.target.value, tz);
              if (ms !== null) set("start", ms);
            }}
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${formId}-end`}>Ended <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <Input
            id={`${formId}-end`}
            type="datetime-local"
            className="h-10"
            value={v.end === null ? "" : toWallInput(v.end, tz)}
            onChange={(e) => set("end", e.target.value ? fromWallInput(e.target.value, tz) : null)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${formId}-loc`}>Location</Label>
        <NativeSelect id={`${formId}-loc`} value={v.locationId ?? ""} onChange={(e) => set("locationId", e.target.value ? Number(e.target.value) : null)}>
          <option value="">No location</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name} · Bortle {l.bortle}
            </option>
          ))}
        </NativeSelect>
        {tz && <p className="text-xs text-muted-foreground">Times in {tz.replace(/_/g, " ")}.</p>}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <ScaleInput id={`${formId}-seeing`} label="Seeing" value={v.seeing} onChange={(x) => set("seeing", x)} labels={SEEING_LABEL} hints={SEEING_HINT} />
        <ScaleInput id={`${formId}-transp`} label="Transparency" value={v.transparency} onChange={(x) => set("transparency", x)} labels={TRANSPARENCY_LABEL} hints={TRANSPARENCY_HINT} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${formId}-temp`}>Temperature ({imperial ? "°F" : "°C"})</Label>
          <Input id={`${formId}-temp`} type="number" inputMode="decimal" step="1" className="h-10" value={v.temperature} onChange={(e) => set("temperature", e.target.value)} placeholder="—" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${formId}-sqm`}>SQM reading</Label>
          <Input id={`${formId}-sqm`} type="number" inputMode="decimal" step="0.01" min={10} max={23} className="h-10" value={v.sqm} onChange={(e) => set("sqm", e.target.value)} placeholder="e.g. 20.8" />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${formId}-notes`}>Notes</Label>
        <Textarea id={`${formId}-notes`} rows={4} maxLength={10_000} value={v.notes} onChange={(e) => set("notes", e.target.value)} placeholder="How the night went: dew, wind, company, what you'd do differently…" />
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
