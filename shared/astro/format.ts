/** Formatting helpers that respect the observing site's time zone. */

export interface TimeFormatOptions {
  tz?: string | null; // IANA zone of the site; falls back to the viewer's zone
  hour12?: boolean;
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(key: string, make: () => Intl.DateTimeFormat) {
  let f = fmtCache.get(key);
  if (!f) {
    f = make();
    fmtCache.set(key, f);
  }
  return f;
}

function safeTz(tz?: string | null) {
  if (!tz) return undefined;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return undefined;
  }
}

export function formatTime(ms: number | null | undefined, o: TimeFormatOptions = {}): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "—";
  const tz = safeTz(o.tz);
  const key = `t|${tz}|${o.hour12}`;
  // 24-hour clocks read "03:45"; 12-hour ones "3:45 AM" (no leading zero, as the server's text writes them).
  return fmt(key, () => new Intl.DateTimeFormat(undefined, { hour: o.hour12 ? "numeric" : "2-digit", minute: "2-digit", hour12: o.hour12 ?? false, timeZone: tz })).format(ms);
}

export function formatDate(ms: number | null | undefined, o: TimeFormatOptions & { style?: "short" | "long" | "weekday" } = {}): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "—";
  const tz = safeTz(o.tz);
  const style = o.style ?? "short";
  const key = `d|${tz}|${style}`;
  const opts: Intl.DateTimeFormatOptions =
    style === "long"
      ? { weekday: "long", day: "numeric", month: "long", timeZone: tz }
      : style === "weekday"
        ? { weekday: "short", timeZone: tz }
        : { day: "numeric", month: "short", timeZone: tz };
  return fmt(key, () => new Intl.DateTimeFormat(undefined, opts)).format(ms);
}

/** "Sat 4 Oct" style label for a YYYY-MM-DD night date (no time zone shift). */
export function formatNightDate(dateStr: string, style: "short" | "long" | "weekday" = "short"): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  const opts: Intl.DateTimeFormatOptions =
    style === "long"
      ? { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }
      : style === "weekday"
        ? { weekday: "short", timeZone: "UTC" }
        : { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" };
  return new Intl.DateTimeFormat(undefined, opts).format(dt);
}

export function formatDuration(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return "0 h";
  // Round to whole minutes first, then split, so 0.999 h reads "1 h" rather than "60 min".
  const total = Math.round(hours * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m.toString().padStart(2, "0")} m`;
}

export function formatRA(hours: number): string {
  const h = ((hours % 24) + 24) % 24;
  let hh = Math.floor(h);
  let mm = Math.floor((h - hh) * 60);
  let ss = Math.round(((h - hh) * 60 - mm) * 60);
  if (ss === 60) { ss = 0; mm += 1; }
  if (mm === 60) { mm = 0; hh = (hh + 1) % 24; }
  return `${hh.toString().padStart(2, "0")}h ${mm.toString().padStart(2, "0")}m ${ss.toString().padStart(2, "0")}s`;
}

export function formatDec(deg: number): string {
  // Work in whole arcseconds so rounding can't produce "−00° 00′ 00″" or 60″.
  const total = Math.round(Math.abs(deg) * 3600);
  const sign = deg < 0 && total > 0 ? "−" : "+";
  const d = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${sign}${d.toString().padStart(2, "0")}° ${m.toString().padStart(2, "0")}′ ${s.toString().padStart(2, "0")}″`;
}

export function formatAngleSize(arcmin?: number[] | null): string {
  if (!arcmin || !arcmin.length) return "—";
  const f = (x: number) => {
    // Decide the unit after rounding, so 59.97′ reads "1.0°" and 0.999′ reads "1.0′" (not "60′" / "60″").
    if (x >= 59.95) return `${(x / 60).toFixed(1)}°`;
    if (x >= 0.995) return x < 9.95 ? `${x.toFixed(1)}′` : `${Math.round(x)}′`;
    return `${Math.round(x * 60)}″`;
  };
  return arcmin.length > 1 && arcmin[1] ? `${f(arcmin[0])} × ${f(arcmin[1])}` : f(arcmin[0]);
}

export function formatMag(m?: number | null): string {
  if (m === undefined || m === null || !Number.isFinite(m)) return "—";
  const r = Math.abs(m).toFixed(1);
  return (m < 0 && r !== "0.0" ? "−" : "") + r;
}

/** Relative "in 2 h 10 m" / "45 min ago". */
export function relativeTime(ms: number, now = Date.now()): string {
  const diff = ms - now;
  const abs = Math.abs(diff) / 3_600_000;
  const s = formatDuration(abs);
  return diff >= 0 ? `in ${s}` : `${s} ago`;
}
