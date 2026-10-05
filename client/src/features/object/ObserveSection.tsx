import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Filter, Info } from "lucide-react";
import { filterAdvice, formatMag, formatTime, idealMagnification, rankEyepieces, scopeLimits, type EyepieceChoice } from "@shared/astro";
import { useGear } from "@/hooks/useScope";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ActiveScopeState } from "@/features/explore/InstrumentBar";
import type { NightContext } from "@/features/explore/sky";
import { FieldView, angleLabel } from "./FieldView";
import { binocularSpec, fieldShape, opticsTarget, planetFilterAdvice, planetNotes } from "./observing";
import type { Subject, Tonight } from "./model";

const VERDICT_TONE = { ideal: "excellent", good: "good", usable: "fair", poor: "poor" } as const;

function fieldText(deg: number) {
  return deg >= 1 ? `${deg.toFixed(2)}°` : `${Math.round(deg * 60)}′`;
}

function ChoiceName({ c }: { c: EyepieceChoice }) {
  return (
    <>
      {c.eyepiece.name ?? `${c.eyepiece.focalLength} mm`}
      {c.barlow && <span className="text-muted-foreground"> + {c.barlow.name ?? `${c.barlow.factor}× Barlow`}</span>}
    </>
  );
}

function SetupNumbers({ c, large }: { c: EyepieceChoice; large?: boolean }) {
  const items = [
    { v: `${Math.round(c.setup.magnification)}×`, l: "power" },
    { v: `${c.setup.exitPupil.toFixed(1)} mm`, l: "exit pupil" },
    { v: fieldText(c.setup.trueField), l: "true field" },
  ];
  if (!large)
    return (
      <span className="num text-xs text-muted-foreground">
        {items.map((i) => i.v).join(" · ")}
      </span>
    );
  return (
    <div className="mt-3 grid grid-cols-3 gap-3">
      {items.map((i) => (
        <div key={i.l}>
          <div className="num text-xl font-medium leading-tight">{i.v}</div>
          <div className="eyebrow mt-0.5">{i.l}</div>
        </div>
      ))}
    </div>
  );
}

/** Which of the user's filters matches the advice, if any. */
function ownedFilterName(kind: string, filters: { name: string; type: string }[]): string | null {
  const pat: Record<string, RegExp> = {
    uhc: /uhc|narrow|ultra ?high/i,
    oiii: /o-?iii|o3|oxygen/i,
    h_beta: /h-?b(eta)?|hβ/i,
    moon: /moon|nd|neutral/i,
    color: /colou?r|#\s?\d+|wratten/i,
  };
  const re = pat[kind];
  if (!re) return null;
  return filters.find((f) => re.test(f.type) || re.test(f.name))?.name ?? null;
}

export function ObserveSection({ subject, tonight, ctx, scope }: { subject: Subject; tonight: Tonight; ctx: NightContext; scope: ActiveScopeState }) {
  const { user } = useAuth();
  const gear = useGear();
  const { target, sizeArcmin } = useMemo(() => opticsTarget(subject, tonight), [subject, tonight]);
  const choices = useMemo(
    () => rankEyepieces(scope.scope, scope.eyepieces, scope.barlows, target, { sizeArcmin }),
    [scope.scope, scope.eyepieces, scope.barlows, target, sizeArcmin],
  );
  const ideal = useMemo(() => idealMagnification(scope.scope, target, { sizeArcmin }), [scope.scope, target, sizeArcmin]);
  const limits = scopeLimits(scope.scope);
  const options = choices.filter((c, i) => i === 0 || c.verdict !== "poor").slice(0, 3);
  const [sel, setSel] = useState(0);
  const chosen = options[Math.min(sel, options.length - 1)];
  const at = tonight.bestTime ?? ctx.now;
  const shape = useMemo(() => fieldShape(subject, tonight, ctx.night, at), [subject, tonight, ctx.night, at]);
  const advice =
    target.type === "double_star"
      ? { best: "none" as const, label: "No filter", why: "Filters only dim the stars and shift their colours — enjoy the pair unfiltered." }
      : ((subject.kind === "body" ? planetFilterAdvice(subject.id) : null) ?? filterAdvice(target));
  const owned = user && gear.data ? ownedFilterName(advice.best, gear.data.filters) : null;
  const isDouble = subject.kind === "deep" && subject.obj.type === "double_star";
  const isBino = scope.kind === "binoculars";
  const isEye = scope.kind === "eye";
  const bino = isBino ? binocularSpec(scope.scope.name) : null;

  const fieldDeg = chosen ? chosen.setup.trueField : bino ? bino.fieldDeg : null;
  const objSizeArcmin = subject.kind === "deep" ? subject.obj.size?.[0] : (tonight.body?.state.diameter ?? 0) / 60;
  const name = subject.kind === "body" && subject.id === "moon" ? "The Moon" : subject.name;

  let framing: string | null = null;
  if (fieldDeg && objSizeArcmin && !isDouble) {
    const fill = objSizeArcmin / (fieldDeg * 60);
    framing =
      fill > 1.05
        ? `${name} is ${angleLabel(objSizeArcmin * 60)} across — bigger than this ${fieldText(fieldDeg)} field, so you'll see part of it at a time.`
        : fill > 0.6
          ? `${name} fills most of the field — a snug fit.`
          : fill > 0.15
            ? `${name} sits comfortably in the field with dark sky around it.`
            : `${name} is small in this field — ${subject.kind === "body" ? "more power shows more detail if the air is steady" : "look for it near the centre"}.`;
  }

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0">
        {isEye ? (
          <div>
            <div className="eyebrow">Naked eye</div>
            <p className="mt-2 text-sm text-muted-foreground">
              {subject.kind === "body"
                ? subject.id === "moon"
                  ? "Bright and obvious — the naked eye shows the maria; binoculars already reveal the largest craters along the terminator."
                  : !tonight.detect || tonight.detect.difficulty === "out of reach"
                    ? `${subject.name} is beyond naked-eye reach from this sky. Binoculars show it as a star-like point.`
                    : tonight.detect.difficulty === "easy" || tonight.detect.difficulty === "moderate"
                      ? `${subject.name} looks like a bright, steady star. Binoculars or a telescope show its disk — switch the instrument above to see how.`
                      : `${subject.name} is at the edge of naked-eye visibility from this sky — binoculars show it easily.`
                : tonight.detect && tonight.detect.difficulty !== "out of reach" && !tonight.track.neverUp
                  ? "Visible without optics from this sky — look with averted vision once your eyes are dark-adapted (20 minutes, no white light)."
                  : "Beyond naked-eye reach from this sky. Binoculars or a telescope will show it — switch the instrument above to see how."}
            </p>
          </div>
        ) : isBino && bino ? (
          <div>
            <div className="eyebrow">Binoculars</div>
            <div className="mt-1 text-lg font-medium">{scope.scope.name}</div>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <div>
                <div className="num text-xl font-medium">{bino.magnification}×</div>
                <div className="eyebrow mt-0.5">power</div>
              </div>
              <div>
                <div className="num text-xl font-medium">{(bino.aperture / bino.magnification).toFixed(1)} mm</div>
                <div className="eyebrow mt-0.5">exit pupil</div>
              </div>
              <div>
                <div className="num text-xl font-medium">≈{bino.fieldDeg.toFixed(1)}°</div>
                <div className="eyebrow mt-0.5">true field</div>
              </div>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">Brace your elbows or use a tripod — held steady, binoculars show noticeably fainter detail.</p>
          </div>
        ) : chosen ? (
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="eyebrow">{sel === 0 ? "Best eyepiece" : "Alternative"}</span>
              <Badge variant={VERDICT_TONE[chosen.verdict]}>{chosen.verdict}</Badge>
            </div>
            <div className="mt-1 text-lg font-medium">
              <ChoiceName c={chosen} />
            </div>
            <SetupNumbers c={chosen} large />
            {(() => {
              // reasons[0] repeats the numbers shown above; keep only its "why" part.
              const rs = chosen.reasons
                .map((r, i) => (i === 0 ? (r.includes(" — ") ? r.split(" — ").slice(1).join(" — ") : null) : r))
                .filter((r): r is string => !!r);
              return rs.length > 0 ? (
                <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                  {rs.map((r, i) => (
                    <li key={i}>{r.charAt(0).toUpperCase() + r.slice(1)}.</li>
                  ))}
                </ul>
              ) : null;
            })()}
            {options.length > 1 && (
              <div className="mt-4">
                <div className="eyebrow mb-1.5">Compare</div>
                <div className="flex flex-col gap-1" role="group" aria-label="Eyepiece options">
                  {options.map((c, i) => (
                    <button
                      key={i}
                      type="button"
                      aria-pressed={i === sel}
                      onClick={() => setSel(i)}
                      className={cn(
                        "flex min-h-[2.75rem] items-center justify-between gap-3 rounded-lg border px-3 py-1.5 text-left text-sm transition-colors",
                        i === sel ? "border-primary/50 bg-primary/10" : "hover:bg-accent",
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate">
                          <ChoiceName c={c} />
                        </span>
                        <span className="block">
                          <SetupNumbers c={c} />
                        </span>
                      </span>
                      <Badge variant={VERDICT_TONE[c.verdict]} className="shrink-0">
                        {c.verdict}
                      </Badge>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {scope.source === "preset" && (
              <p className="mt-3 text-2xs text-muted-foreground">
                Assumes a typical eyepiece kit (32, 25, 10 and 6 mm). Ideal for this object: about{" "}
                <span className="num">{Math.round(ideal.magnification)}×</span> — a{" "}
                <span className="num">{Math.round(ideal.eyepieceFocalLength)} mm</span> eyepiece on this scope.{" "}
                {user ? (
                  <Link href="/gear" className="link">
                    Add your eyepieces
                  </Link>
                ) : (
                  <Link href="/register" className="link">
                    Sign up to add your own eyepieces
                  </Link>
                )}{" "}
                for exact advice.
              </p>
            )}
          </div>
        ) : (
          <div>
            <div className="eyebrow">Ideal magnification</div>
            <div className="num mt-1 text-xl font-medium">≈{Math.round(ideal.magnification)}×</div>
            <p className="mt-1 text-sm text-muted-foreground">
              A <span className="num">{Math.round(ideal.eyepieceFocalLength)} mm</span> eyepiece on your {scope.scope.name} — {ideal.why}.{" "}
              <Link href="/gear" className="link">
                Add your eyepieces
              </Link>{" "}
              to see which of yours fits best.
            </p>
          </div>
        )}

        {/* Doubles */}
        {isDouble && subject.kind === "deep" && subject.obj.sep !== undefined && (
          <div className="mt-5 border-t pt-4">
            <div className="eyebrow">Splitting the pair</div>
            <p className="mt-1.5 text-sm">
              <span className="num">{subject.obj.sep}″</span> apart
              {subject.obj.pa !== undefined && (
                <>
                  , companion at position angle <span className="num">{subject.obj.pa}°</span>
                </>
              )}
              {subject.obj.mag !== undefined && subject.obj.mag2 !== undefined && (
                <>
                  {" "}
                  (mag <span className="num">{formatMag(subject.obj.mag)}</span> and <span className="num">{formatMag(subject.obj.mag2)}</span>)
                </>
              )}
              .{" "}
              {subject.obj.sep < limits.dawes ? (
                <span className="text-q-poor">
                  That's below your scope's resolution limit of <span className="num">{limits.dawes.toFixed(2)}″</span> (Dawes) — it won't split.
                </span>
              ) : (
                <>
                  Splits cleanly from about <span className="num font-medium">{Math.max(Math.ceil(240 / subject.obj.sep), 1)}×</span>
                  {240 / subject.obj.sep < 8 ? " — even binoculars may do it" : ""}; your scope resolves down to{" "}
                  <span className="num">{limits.dawes.toFixed(2)}″</span>.
                </>
              )}
            </p>
          </div>
        )}

        {/* Planets: what to look for */}
        {subject.kind === "body" && tonight.body && (
          <div className="mt-5 border-t pt-4">
            <div className="eyebrow">What to look for</div>
            <p className="mt-1.5 text-sm">{subject.meta.blurb}</p>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {planetNotes(subject.id, tonight.body.state, ctx.night).map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Filters */}
        <div className="mt-5 flex gap-3 border-t pt-4">
          <Filter className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0">
            <div className="text-sm">
              <span className="font-medium">{advice.label}</span>
              {owned && <span className="text-muted-foreground"> · you have one: {owned}</span>}
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">{advice.why}</p>
          </div>
        </div>
      </div>

      {/* Framing preview */}
      {!isEye && (
        <div className="flex flex-col items-center md:w-[17rem]">
          {isDouble && subject.kind === "deep" && subject.obj.sep !== undefined ? (
            <PairView sep={subject.obj.sep} pa={subject.obj.pa} mag1={subject.obj.mag} mag2={subject.obj.mag2} />
          ) : fieldDeg ? (
            <>
              {/* A new eyepiece or scope "re-focuses": the field zooms gently into place. */}
              <FieldView key={fieldDeg.toFixed(4)} className="animate-zoom-fade" fieldDeg={fieldDeg} shape={shape} label={`Framing of ${subject.name} in a ${fieldText(fieldDeg)} field`} />
              <figcaption className="mt-1 max-w-[17rem] text-center text-2xs leading-relaxed text-muted-foreground">
                {framing && <span className="block text-xs text-foreground/90">{framing}</span>}
                True field {fieldText(fieldDeg)}
                {chosen ? ` with the ${chosen.eyepiece.name ?? chosen.eyepiece.focalLength + " mm"}` : ""}.{" "}
                {scope.kind === "telescope" ? "North up, east left — your scope may flip or rotate the view." : "North up, east left, as on a star chart."}
                {shape.kind === "extended" && " Dashed outline: catalog size; the visible extent is usually smaller under bright skies."}
                {shape.kind === "extended" && (shape.pa === null || shape.pa === undefined) && shape.minor !== shape.major && " Orientation not shown."}
                {shape.kind === "disk" && shape.moons && ` The moons are placed for ${formatTime(at, { tz: ctx.tz, hour12: ctx.hour12 })}.`}
              </figcaption>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** Schematic of a double star: companion direction (position angle) and relative brightness. Not to scale. */
function PairView({ sep, pa, mag1, mag2 }: { sep: number; pa?: number; mag1?: number; mag2?: number }) {
  const S = 200;
  const c = S / 2;
  const d = 52;
  const ang = ((pa ?? 90) * Math.PI) / 180;
  const x2 = c - Math.sin(ang) * d;
  const y2 = c - Math.cos(ang) * d;
  const r = (m?: number) => Math.max(2.2, Math.min(9, 9 - 0.9 * ((m ?? 6) - Math.min(mag1 ?? 6, mag2 ?? 6))));
  return (
    <figure className="flex flex-col items-center">
      <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} role="img" aria-label={`Companion ${sep} arcseconds away at position angle ${pa ?? "unknown"} degrees`}>
        <circle cx={c} cy={c} r={c - 8} className="fill-surface-2 stroke-border dark:fill-sky-night" strokeWidth={1.5} />
        <line x1={c} y1={c} x2={c} y2={18} className="stroke-muted-foreground/30" strokeDasharray="2 3" />
        {pa !== undefined && (
          <path
            d={`M ${c} ${c - 26} A 26 26 0 ${pa > 180 ? 1 : 0} 0 ${c - Math.sin(ang) * 26} ${c - Math.cos(ang) * 26}`}
            fill="none"
            className="stroke-primary/60"
            strokeWidth={1}
          />
        )}
        <circle cx={c} cy={c} r={r(mag1)} className="fill-gold" />
        <circle cx={x2} cy={y2} r={r(mag2)} className="fill-foreground" />
        <text x={c} y={14} textAnchor="middle" className="fill-muted-foreground text-[9px] font-medium">
          N
        </text>
        <text x={12} y={c} dy="0.32em" className="fill-muted-foreground text-[9px] font-medium">
          E
        </text>
      </svg>
      <figcaption className="mt-1 max-w-[16rem] text-center text-2xs text-muted-foreground">
        Schematic, not to scale: the companion lies <span className="num">{sep}″</span> from the primary
        {pa !== undefined ? <> at position angle <span className="num">{pa}°</span> (measured from north through east)</> : null}. Star sizes show relative
        brightness.
      </figcaption>
    </figure>
  );
}

export function OpticsFootnote({ scope }: { scope: ActiveScopeState }) {
  const l = scopeLimits(scope.scope);
  if (scope.kind !== "telescope") return null;
  return (
    <p className="flex items-start gap-1.5 text-2xs text-muted-foreground">
      <Info className="mt-px h-3 w-3 shrink-0" aria-hidden="true" />
      <span>
        {scope.scope.name}: <span className="num">{scope.scope.aperture} mm</span>, f/<span className="num">{l.fRatio.toFixed(1)}</span> · useful power{" "}
        <span className="num">
          {Math.round(l.minUsefulMag)}–{Math.round(l.maxUsefulMag)}×
        </span>{" "}
        · resolves <span className="num">{l.dawes.toFixed(2)}″</span> · Exit pupils follow standard visual practice: large for faint nebulae, small for planets
        and doubles.
      </span>
    </p>
  );
}
