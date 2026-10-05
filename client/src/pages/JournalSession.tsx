import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { ChevronLeft, Loader2, MoreHorizontal, Pencil, Plus, Telescope, Trash2 } from "lucide-react";
import type { ApiGear, ApiObservation, ApiSession, ObservationInput } from "@shared/api";
import { EmptyState, ErrorState, PageHeader, Section, SignInPrompt, Skel, usePageTitle } from "@/components/common/Page";
import { TypeGlyph } from "@/components/common/Glyphs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAuth, useFeatures } from "@/hooks/useAuth";
import { useSite } from "@/hooks/useSite";
import { useActiveScope, useGear } from "@/hooks/useScope";
import { usePrefs } from "@/hooks/usePrefs";
import { toast } from "@/hooks/use-toast";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  uploadPhoto,
  useDeleteObservation,
  useDeleteSession,
  useJournalSession,
  useLogObservation,
  useUpdateObservation,
  useUpdateSession,
} from "@/features/journal/api";
import { ResponsiveModal, Stars } from "@/features/journal/controls";
import { ObservationForm, blankValues, type ObservationValues } from "@/features/journal/ObservationForm";
import { SessionForm, sessionValues, toSessionInput } from "@/features/journal/SessionForm";
import { AddPhotoButton, PhotoGrid } from "@/features/journal/photos";
import {
  RATING_LABEL,
  SEEING_HINT,
  SEEING_LABEL,
  TRANSPARENCY_HINT,
  TRANSPARENCY_LABEL,
  cToF,
  formatDuration,
  formatTime,
  nightLabel,
  placeOf,
  sessionNight,
  sessionTitle,
  timeRange,
  typeLabel,
} from "@/features/journal/format";

const HOUR = 3_600_000;
/** How long the journal's totals count a session without an end time (server/routes/journal.ts). */
const ESTIMATED_SESSION_H = 1.5;

export default function JournalSessionPage({ id }: { id: number }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <SessionSkeleton />;
  if (!user)
    return (
      <div className="flex flex-col gap-8">
        <BackLink />
        <SignInPrompt title="Sign in to see this session" description="Your observing journal is private to your account." />
      </div>
    );
  return <SessionView id={id} />;
}

function BackLink() {
  return (
    <Link href="/journal" className="inline-flex h-9 items-center gap-1 self-start rounded-md pr-2 text-sm text-muted-foreground hover:text-foreground">
      <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Journal
    </Link>
  );
}

function SessionView({ id }: { id: number }) {
  const q = useJournalSession(id);
  const { locations } = useSite();
  const gear = useGear();
  const features = useFeatures();
  const { hour12, prefs } = usePrefs();
  const s = q.data;
  usePageTitle(s ? sessionTitle(s) : "Session");

  const [editing, setEditing] = useState(false);
  const [editKey, setEditKey] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [adding, setAdding] = useState(0);
  const [addOpen, setAddOpen] = useState(false);

  const notFound = !Number.isInteger(id) || id <= 0 || (q.error instanceof ApiError && q.error.status === 404);
  if (notFound)
    return (
      <div className="flex flex-col gap-8">
        <BackLink />
        <EmptyState
          title="Session not found"
          description="It may have been deleted, or the link is wrong."
          action={
            <Button asChild variant="outline">
              <Link href="/journal">Back to your journal</Link>
            </Button>
          }
        />
      </div>
    );
  if (q.isLoading) return <SessionSkeleton />;
  if (q.error || !s)
    return (
      <div className="flex flex-col gap-8">
        <BackLink />
        <ErrorState message={q.error?.message} onRetry={() => void q.refetch()} />
      </div>
    );

  const place = placeOf(s, locations);
  const tz = place.tz;
  const night = sessionNight(s, locations);
  const observations = s.observations ?? [];
  const range = timeRange(s, { tz, hour12 });
  const c = s.conditions ?? {};
  const imperial = prefs.units === "imperial";
  const lastTime = observations.reduce((m, o) => Math.max(m, o.observedAt ? Date.parse(o.observedAt) : 0), 0);
  // Without an end time the journal counts the session as 1.5 h, or the span of its observations if that's longer.
  const span = !s.endDate && observations.length > 1 && lastTime - Date.parse(s.date) >= 60_000 ? lastTime - Date.parse(s.date) : null;
  const timeSub = range.hours
    ? formatDuration(range.hours)
    : span
      ? `Logged over ${formatDuration(span / HOUR)}${span < ESTIMATED_SESSION_H * HOUR ? ` · counts as ≈${ESTIMATED_SESSION_H} h` : ""}`
      : `No end time · counts as ≈${ESTIMATED_SESSION_H} h`;

  return (
    <div className="flex flex-col gap-8">
      <BackLink />
      <PageHeader
        className="-mt-4"
        eyebrow={`Night of ${nightLabel(night, "long")}`}
        title={sessionTitle(s)}
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setEditKey((k) => k + 1);
                setEditing(true);
              }}
            >
              <Pencil /> Edit details
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="More session actions">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() => {
                    setEditKey((k) => k + 1);
                    setEditing(true);
                  }}
                >
                  <Pencil className="mr-2 h-4 w-4" /> Edit details
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleting(true)}>
                  <Trash2 className="mr-2 h-4 w-4" /> Delete session
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border lg:grid-cols-4">
        <Fact label="Time" value={range.text} sub={timeSub} />
        <Fact
          label="Place"
          value={s.locationName ?? "No location"}
          sub={
            <>
              Bortle <span className="num">{s.bortle}</span>
            </>
          }
        />
        <Fact label="Seeing" value={c.seeing ? SEEING_LABEL[c.seeing] : "—"} sub={c.seeing ? SEEING_HINT[c.seeing] : "Not recorded"} />
        <Fact label="Transparency" value={c.transparency ? TRANSPARENCY_LABEL[c.transparency] : "—"} sub={c.transparency ? TRANSPARENCY_HINT[c.transparency] : "Not recorded"} />
      </dl>

      {(c.moonIllumination != null || c.temperatureC != null || c.sqmReading != null) && (
        <div className="-mt-4 flex flex-wrap gap-1.5">
          {c.moonIllumination != null && <Badge variant="outline">Moon {Math.round(c.moonIllumination * 100)}% lit</Badge>}
          {c.temperatureC != null && (
            <Badge variant="outline">
              <span className="num">{Math.round(imperial ? cToF(c.temperatureC) : c.temperatureC)}</span> {imperial ? "°F" : "°C"}
            </Badge>
          )}
          {c.sqmReading != null && (
            <Badge variant="outline">
              SQM <span className="num">{c.sqmReading.toFixed(2)}</span>
            </Badge>
          )}
        </div>
      )}

      {s.notes && (
        <section aria-label="Session notes" className="max-w-3xl whitespace-pre-wrap border-l-2 border-primary/40 pl-4 text-[0.95rem] leading-relaxed">
          {s.notes}
        </section>
      )}

      <Section
        title={`Observations${observations.length ? ` · ${observations.length}` : ""}`}
        action={
          observations.length > 0 && (
            <Button
              onClick={() => {
                setAdding((n) => n + 1);
                setAddOpen(true);
              }}
            >
              <Plus /> Add observation
            </Button>
          )
        }
      >
        {observations.length ? (
          <ul className="flex flex-col divide-y divide-border/70 border-y border-border/70">
            {observations.map((o) => (
              <ObservationItem key={o.id} o={o} session={s} gear={gear.data} tz={tz} hour12={hour12} photosEnabled={features.photos} />
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={<Telescope className="h-5 w-5" />}
            title="Nothing logged in this session yet"
            description="Add what you observed — just the object is enough; the rest is optional."
            action={
              <Button
                onClick={() => {
                  setAdding((n) => n + 1);
                  setAddOpen(true);
                }}
              >
                <Plus /> Add observation
              </Button>
            }
          />
        )}
      </Section>

      {editKey > 0 && <EditSessionModal key={editKey} open={editing} onOpenChange={setEditing} session={s} imperial={imperial} />}
      {adding > 0 && <AddObservationModal key={adding} open={addOpen} onOpenChange={setAddOpen} session={s} tz={tz} hour12={hour12} photosEnabled={features.photos} />}
      <DeleteSessionDialog open={deleting} onOpenChange={setDeleting} session={s} />
    </div>
  );
}

function Fact({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="min-w-0 bg-background px-4 py-3.5 sm:px-5">
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-1 truncate text-[0.95rem] font-medium">{value}</dd>
      {sub && <dd className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{sub}</dd>}
    </div>
  );
}

/* ---------------------------------------- Observation row ---------------------------------------- */

function ObservationItem({
  o,
  session,
  gear,
  tz,
  hour12,
  photosEnabled,
}: {
  o: ApiObservation;
  session: ApiSession;
  gear: ApiGear | undefined;
  tz?: string;
  hour12: boolean;
  photosEnabled: boolean;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [editKey, setEditKey] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const del = useDeleteObservation(session.id);
  const t = o.observedAt ? Date.parse(o.observedAt) : null;
  const equipment = [
    gear?.telescopes.find((x) => x.id === o.telescopeId)?.name,
    gear?.eyepieces.find((x) => x.id === o.eyepieceId)?.name,
    gear?.barlows.find((x) => x.id === o.barlowId)?.name,
    gear?.filters.find((x) => x.id === o.filterId)?.name,
    gear?.cameras.find((x) => x.id === o.cameraId)?.name,
  ].filter(Boolean) as string[];

  return (
    <li className="flex animate-rise gap-3 py-4 sm:gap-4">
      <div className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full border bg-surface-2 text-foreground/80" aria-hidden="true">
        <TypeGlyph type={o.objectType ?? "galaxy"} id={o.ref ?? undefined} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            {o.ref ? (
              <Link href={`/object/${encodeURIComponent(o.ref)}`} className="font-medium underline-offset-4 hover:text-primary hover:underline">
                {o.objectName}
              </Link>
            ) : (
              <span className="font-medium">{o.objectName}</span>
            )}
            <div className="text-xs text-muted-foreground">
              {typeLabel(o.objectType)}
              {t ? (
                <>
                  {" · "}
                  <time className="num" dateTime={o.observedAt!}>
                    {formatTime(t, { tz, hour12 })}
                  </time>
                </>
              ) : null}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="-mr-2 -mt-1 shrink-0" aria-label={`Actions for ${o.objectName}`}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() => {
                  setEditKey((k) => k + 1);
                  setEditOpen(true);
                }}
              >
                <Pencil className="mr-2 h-4 w-4" /> Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setConfirm(true)}>
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {(o.rating || o.seeing || o.transparency) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {o.rating ? (
              <span className="inline-flex items-center gap-1.5">
                <Stars value={o.rating} />
                {RATING_LABEL[o.rating]}
              </span>
            ) : null}
            {o.seeing ? (
              <span>
                Seeing <span className="text-foreground">{SEEING_LABEL[o.seeing].toLowerCase()}</span>
              </span>
            ) : null}
            {o.transparency ? (
              <span>
                Transparency <span className="text-foreground">{TRANSPARENCY_LABEL[o.transparency].toLowerCase()}</span>
              </span>
            ) : null}
          </div>
        )}

        {(equipment.length > 0 || o.magnification) && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Telescope className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 truncate">{equipment.join(" · ")}</span>
            {o.magnification ? <span className="num shrink-0 text-foreground">{Math.round(o.magnification)}×</span> : null}
          </div>
        )}

        {o.notes && <p className="max-w-3xl whitespace-pre-wrap text-sm leading-relaxed">{o.notes}</p>}

        {photosEnabled && (
          <div className="flex flex-col items-start gap-2">
            <PhotoGrid photos={o.photos} sessionId={session.id} observationName={o.objectName} />
            <AddPhotoButton observationId={o.id} sessionId={session.id} count={o.photos.length} />
          </div>
        )}
      </div>

      {editKey > 0 && <EditObservationModal key={editKey} open={editOpen} onOpenChange={setEditOpen} o={o} session={session} tz={tz} hour12={hour12} />}
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this observation of {o.objectName}?</AlertDialogTitle>
            <AlertDialogDescription>
              {o.photos.length ? `Its ${o.photos.length} photo${o.photos.length > 1 ? "s" : ""} will be deleted too. ` : ""}This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                del.mutate(o.id, {
                  onSuccess: () => toast({ title: `Deleted ${o.objectName}` }),
                  onError: (e: any) => toast({ title: "Couldn't delete", description: e.message, variant: "destructive" }),
                })
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

/* ---------------------------------------- Modals ---------------------------------------- */

function EditSessionModal({ open, onOpenChange, session, imperial }: { open: boolean; onOpenChange: (o: boolean) => void; session: ApiSession; imperial: boolean }) {
  const { locations } = useSite();
  const update = useUpdateSession(session.id);
  const [error, setError] = useState<string | null>(null);
  const initial = useMemo(() => sessionValues(session, { locationId: session.locationId, imperial }), [session, imperial]);
  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(o) => !update.isPending && onOpenChange(o)}
      title="Session details"
      footer={
        <div className="flex gap-2 sm:justify-end">
          <Button variant="outline" size="lg" className="flex-1 sm:flex-none" onClick={() => onOpenChange(false)} disabled={update.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="edit-session" size="lg" className="flex-[2] sm:flex-none" disabled={update.isPending}>
            {update.isPending && <Loader2 className="animate-spin" />}
            Save
          </Button>
        </div>
      }
    >
      <SessionForm
        formId="edit-session"
        initial={initial}
        locations={locations}
        imperial={imperial}
        error={error}
        onSubmit={(v) => {
          const input = toSessionInput(v, imperial);
          if (typeof input === "string") return setError(input);
          setError(null);
          update.mutate(input, {
            onSuccess: () => {
              onOpenChange(false);
              toast({ title: "Session updated" });
            },
            onError: (e: any) => setError(e.message),
          });
        }}
      />
    </ResponsiveModal>
  );
}

function valuesFromObservation(o: ApiObservation): ObservationValues {
  return blankValues({
    ref: o.ref,
    objectName: o.objectName,
    objectType: o.objectType,
    time: o.observedAt ? Date.parse(o.observedAt) : null,
    telescopeId: o.telescopeId,
    eyepieceId: o.eyepieceId,
    barlowId: o.barlowId,
    filterId: o.filterId,
    magnification: o.eyepieceId ? null : o.magnification,
    rating: o.rating,
    seeing: o.seeing,
    transparency: o.transparency,
    notes: o.notes ?? "",
  });
}

function EditObservationModal({
  open,
  onOpenChange,
  o,
  session,
  tz,
  hour12,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  o: ApiObservation;
  session: ApiSession;
  tz?: string;
  hour12: boolean;
}) {
  const gear = useGear();
  const update = useUpdateObservation(session.id);
  const [error, setError] = useState<string | null>(null);
  const initial = useMemo(() => {
    const v = valuesFromObservation(o);
    return v.time === null ? { ...v, time: Date.parse(session.date) } : v;
  }, [o, session.date]);
  const formId = `edit-obs-${o.id}`;
  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(x) => !update.isPending && onOpenChange(x)}
      title={`Edit ${o.objectName}`}
      footer={
        <div className="flex gap-2 sm:justify-end">
          <Button variant="outline" size="lg" className="flex-1 sm:flex-none" onClick={() => onOpenChange(false)} disabled={update.isPending}>
            Cancel
          </Button>
          <Button type="submit" form={formId} size="lg" className="flex-[2] sm:flex-none" disabled={update.isPending}>
            {update.isPending && <Loader2 className="animate-spin" />}
            Save changes
          </Button>
        </div>
      }
    >
      <ObservationForm
        formId={formId}
        initial={initial}
        gear={gear.data}
        pickObject
        allowNow={false}
        tz={tz}
        hour12={hour12}
        photosEnabled={false}
        error={error}
        onSubmit={(v) => {
          setError(null);
          update.mutate(
            {
              id: o.id,
              patch: {
                ...(v.ref && v.ref !== o.ref ? { ref: v.ref } : {}),
                observedAt: v.time !== null ? new Date(v.time).toISOString() : undefined,
                telescopeId: v.telescopeId,
                eyepieceId: v.eyepieceId,
                barlowId: v.barlowId,
                filterId: v.filterId,
                magnification: v.eyepieceId ? undefined : v.magnification,
                rating: v.rating,
                seeing: v.seeing,
                transparency: v.transparency,
                notes: v.notes.trim() || null,
              },
            },
            {
              onSuccess: () => {
                onOpenChange(false);
                toast({ title: "Observation updated" });
              },
              onError: (e: any) => setError(e.message),
            },
          );
        }}
      />
    </ResponsiveModal>
  );
}

function AddObservationModal({
  open,
  onOpenChange,
  session,
  tz,
  hour12,
  photosEnabled,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  session: ApiSession;
  tz?: string;
  hour12: boolean;
  photosEnabled: boolean;
}) {
  const gear = useGear();
  const active = useActiveScope();
  const log = useLogObservation();
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const busy = log.isPending || uploading;

  const initial = useMemo(() => {
    const obs = session.observations ?? [];
    const last = obs[obs.length - 1];
    const start = Date.parse(session.date);
    const now = Date.now();
    // Logging live (session started within the last ~14 h)? Default to now; otherwise to the session's last time.
    const live = now >= start - HOUR && now - start < 14 * HOUR;
    const lastTime = last?.observedAt ? Date.parse(last.observedAt) : start;
    return blankValues({
      time: live ? null : lastTime,
      telescopeId: last?.telescopeId ?? (active.source === "gear" ? active.telescopeId : null) ?? gear.data?.telescopes[0]?.id ?? null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gear.isLoading]);

  const formId = `add-obs-${session.id}`;
  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(o) => !busy && onOpenChange(o)}
      title="Add observation"
      description={`To ${sessionTitle(session)}.`}
      footer={
        <div className="flex gap-2 sm:justify-end">
          <Button variant="outline" size="lg" className="flex-1 sm:flex-none" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form={formId} size="lg" className="flex-[2] sm:flex-none" disabled={busy || gear.isLoading}>
            {busy && <Loader2 className="animate-spin" />}
            {uploading ? "Uploading photos…" : "Add to session"}
          </Button>
        </div>
      }
    >
      {gear.isLoading ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skel className="h-11 w-full" />
          <Skel className="h-48 w-full" />
        </div>
      ) : (
        <ObservationForm
          formId={formId}
          initial={initial}
          gear={gear.data}
          pickObject
          allowNow={initial.time === null}
          tz={tz}
          hour12={hour12}
          photosEnabled={photosEnabled}
          error={error}
          onSubmit={async (v, files) => {
            setError(null);
            const input: ObservationInput = {
              sessionId: session.id,
              ref: v.ref!,
              observedAt: v.time === null ? undefined : new Date(v.time).toISOString(),
              telescopeId: v.telescopeId,
              eyepieceId: v.eyepieceId,
              barlowId: v.barlowId,
              filterId: v.filterId,
              magnification: v.eyepieceId ? undefined : v.magnification,
              rating: v.rating,
              seeing: v.seeing,
              transparency: v.transparency,
              notes: v.notes.trim() || null,
            };
            try {
              const r = await log.mutateAsync(input);
              let failed = 0;
              if (files.length) {
                setUploading(true);
                for (const f of files) await uploadPhoto(r.observation.id, f).catch(() => failed++);
                setUploading(false);
              }
              toast({
                title: `Added ${v.objectName}`,
                description: failed ? `${failed} photo${failed > 1 ? "s" : ""} didn't upload — try again from the observation.` : r.firstTime ? "First time you've logged it!" : undefined,
              });
              onOpenChange(false);
            } catch (e: any) {
              setUploading(false);
              setError(e?.message ?? "Couldn't save this observation.");
            }
          }}
        />
      )}
    </ResponsiveModal>
  );
}

function DeleteSessionDialog({ open, onOpenChange, session }: { open: boolean; onOpenChange: (o: boolean) => void; session: ApiSession }) {
  const del = useDeleteSession();
  const [, navigate] = useLocation();
  const n = session.observations?.length ?? session.observationCount;
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this session?</AlertDialogTitle>
          <AlertDialogDescription>
            {n > 0 ? `“${sessionTitle(session)}” and its ${n} observation${n > 1 ? "s" : ""} (including any photos) will be removed. ` : `“${sessionTitle(session)}” will be removed. `}
            This can't be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={del.isPending}>Keep it</AlertDialogCancel>
          <AlertDialogAction
            className={cn("bg-destructive text-destructive-foreground hover:bg-destructive/90")}
            disabled={del.isPending}
            onClick={(e) => {
              e.preventDefault();
              del.mutate(session.id, {
                onSuccess: () => {
                  onOpenChange(false);
                  toast({ title: "Session deleted" });
                  navigate("/journal");
                },
                onError: (err: any) => toast({ title: "Couldn't delete the session", description: err.message, variant: "destructive" }),
              });
            }}
          >
            {del.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Delete session
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function SessionSkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-busy="true" aria-label="Loading session">
      <Skel className="h-5 w-24" />
      <Skel className="h-12 w-72" />
      <Skel className="h-20 w-full" />
      <div className="flex flex-col gap-3">
        <Skel className="h-24 w-full" />
        <Skel className="h-24 w-full" />
      </div>
    </div>
  );
}
