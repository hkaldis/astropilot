/**
 * "Log observation" — the fastest path into the journal, used across the app.
 * Contract (other pages import it): a button that opens a dialog (bottom sheet on phones) to log
 * an observation of `refId` (catalog id like "M31" or solar-system id like "jupiter"). Works when
 * signed in; explains and links to sign-up otherwise.
 *
 * At the eyepiece this takes a few seconds: the object is preset, time is "now", the site and the
 * equipment are pre-filled, and everything else is optional — open, tap the stars, save.
 */
import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Loader2, MapPin, NotebookPen } from "lucide-react";
import type { ApiLocation, ObservationInput } from "@shared/api";
import { Button, type ButtonProps } from "@/components/ui/button";
import { ToastAction } from "@/components/ui/toast";
import { Skel } from "@/components/common/Page";
import { toast } from "@/hooks/use-toast";
import { useAuth, useFeatures } from "@/hooks/useAuth";
import { siteTz, useSite } from "@/hooks/useSite";
import { useActiveScope, useGear } from "@/hooks/useScope";
import { usePrefs } from "@/hooks/usePrefs";
import { api, queryClient } from "@/lib/api";
import { ResponsiveModal } from "./controls";
import { ObservationForm, blankValues, type ObservationValues } from "./ObservationForm";
import { uploadPhoto, useLogObservation } from "./api";
import { shortName } from "./format";

export interface LogObservationButtonProps {
  refId: string;
  name: string;
  /**
   * Pre-fill the eyepiece AstroPilot recommended for that telescope; the power is then worked out from the optics
   * (`magnification` is informational and never logged on its own).
   */
  suggestion?: { telescopeId?: number | null; eyepieceId?: number | null; barlowId?: number | null; magnification?: number | null };
  label?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
  onLogged?: () => void;
}

export function LogObservationButton({ refId, name, suggestion, label = "Log observation", variant = "outline", size, className, onLogged }: LogObservationButtonProps) {
  const [open, setOpen] = useState(false);
  // Remount the form on every open so it starts fresh (time = now, cleared rating).
  const [instance, setInstance] = useState(0);
  const iconOnly = size === "icon" || size === "icon-sm";
  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        onClick={() => {
          setInstance((n) => n + 1);
          setOpen(true);
        }}
        aria-label={iconOnly ? `${label}: ${name}` : undefined}
        aria-haspopup="dialog"
      >
        <NotebookPen />
        {!iconOnly && label}
      </Button>
      {instance > 0 && <LogObservationModal key={instance} open={open} onOpenChange={setOpen} refId={refId} name={name} suggestion={suggestion} onLogged={onLogged} />}
    </>
  );
}

function LogObservationModal({
  open,
  onOpenChange,
  refId,
  name,
  suggestion,
  onLogged,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  refId: string;
  name: string;
  suggestion?: LogObservationButtonProps["suggestion"];
  onLogged?: () => void;
}) {
  const { isAuthenticated, isLoading } = useAuth();
  if (!isLoading && !isAuthenticated) return <SignedOutModal open={open} onOpenChange={onOpenChange} name={name} />;
  return <SignedInModal open={open} onOpenChange={onOpenChange} refId={refId} name={name} suggestion={suggestion} onLogged={onLogged} />;
}

function SignedOutModal({ open, onOpenChange, name }: { open: boolean; onOpenChange: (o: boolean) => void; name: string }) {
  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Keep an observing journal"
      description={`Create a free account to log ${name} and everything else you see.`}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button asChild variant="outline" size="lg">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild size="lg">
            <Link href="/register">Create free account</Link>
          </Button>
        </div>
      }
    >
      <ul className="flex flex-col gap-3 text-sm text-muted-foreground">
        <li>
          <span className="font-medium text-foreground">Log in seconds at the eyepiece.</span> Time, place and your telescope and eyepiece are filled in for you.
        </li>
        <li>
          <span className="font-medium text-foreground">Track your progress.</span> Messier and Caldwell completion, planets, streaks and hours under the sky.
        </li>
        <li>
          <span className="font-medium text-foreground">Remember every night.</span> Seeing, transparency, notes and photos, exportable to CSV any time.
        </li>
      </ul>
    </ResponsiveModal>
  );
}

function SignedInModal({
  open,
  onOpenChange,
  refId,
  name,
  suggestion,
  onLogged,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  refId: string;
  name: string;
  suggestion?: LogObservationButtonProps["suggestion"];
  onLogged?: () => void;
}) {
  const { site, selectSite, clearGuestSite } = useSite();
  const gear = useGear();
  const active = useActiveScope();
  const { hour12 } = usePrefs();
  const features = useFeatures();
  const log = useLogObservation();
  const [, navigate] = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [savedLocation, setSavedLocation] = useState<ApiLocation | null>(null);
  const [uploading, setUploading] = useState(false);
  const tz = siteTz(site);
  const formId = `log-${refId}`;

  const saveSite = useMutation({
    mutationFn: () =>
      api<ApiLocation>("POST", "/api/locations", {
        name: site!.name,
        latitude: site!.lat,
        longitude: site!.lon,
        bortle: site!.bortle,
        elevation: site!.elevation,
        timezone: site!.timezone,
      }),
    onSuccess: (loc) => {
      setSavedLocation(loc);
      void queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      if (loc?.id) selectSite(`loc:${loc.id}`);
      clearGuestSite();
    },
  });

  const initial = useMemo<ObservationValues | null>(() => {
    if (gear.isLoading) return null;
    const g = gear.data;
    const own = <T extends { id: number }>(list: T[] | undefined, id: number | null | undefined) => (id && list?.some((x) => x.id === id) ? id : null);
    const suggestedScope = own(g?.telescopes, suggestion?.telescopeId);
    const telescopeId = suggestedScope ?? (active.source === "gear" ? active.telescopeId : null) ?? g?.telescopes[0]?.id ?? null;
    // The recommended eyepiece only fits the telescope it was worked out for — never a preset's kit on a real scope.
    const sameScope = suggestedScope !== null && suggestedScope === telescopeId;
    const eyepieceId = sameScope ? own(g?.eyepieces, suggestion?.eyepieceId) : null;
    return blankValues({
      ref: refId,
      objectName: name,
      objectType: null,
      telescopeId,
      eyepieceId,
      barlowId: eyepieceId ? own(g?.barlows, suggestion?.barlowId) : null,
      // The power is worked out from the chosen telescope, eyepiece and Barlow; without an eyepiece there's no power to assume.
      magnification: null,
    });
    // Only once gear is known; later changes must not reset what the user typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gear.isLoading]);

  const locationId = savedLocation?.id ?? site?.locationId ?? null;
  const isGuest = !!site && !site.locationId && !savedLocation;
  const busy = log.isPending || uploading;

  async function submit(v: ObservationValues, files: File[]) {
    setError(null);
    const input: ObservationInput = {
      ref: v.ref ?? refId,
      locationId,
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
    let result;
    try {
      result = await log.mutateAsync(input);
    } catch (e: any) {
      setError(e?.message ?? "Couldn't save this observation. Please try again.");
      return;
    }
    let photoNote = "";
    if (files.length) {
      setUploading(true);
      let failed = 0;
      for (const f of files) {
        try {
          await uploadPhoto(result.observation.id, f);
        } catch {
          failed++;
        }
      }
      setUploading(false);
      if (failed) photoNote = ` ${failed} photo${failed > 1 ? "s" : ""} didn't upload — add ${failed > 1 ? "them" : "it"} from the session page.`;
    }
    const n = result.objectsThisYear;
    const sessionId = result.observation.sessionId;
    toast({
      title: `Logged ${shortName(refId, name)}`,
      description: `${result.firstTime ? "First time — nice! " : ""}${n} object${n === 1 ? "" : "s"} this year.${photoNote}`,
      action: (
        <ToastAction altText="Open the session in your journal" onClick={() => navigate(`/journal/${sessionId}`)}>
          View
        </ToastAction>
      ),
    });
    onLogged?.();
    onOpenChange(false);
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(o) => !busy && onOpenChange(o)}
      title={`Log ${shortName(refId, name)}`}
      description="Everything but the object is optional."
      footer={
        <div className="flex gap-2 sm:justify-end">
          <Button type="button" variant="outline" size="lg" className="flex-1 sm:flex-none" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form={formId} size="lg" className="flex-[2] sm:flex-none" disabled={busy || !initial}>
            {busy && <Loader2 className="animate-spin" />}
            {uploading ? "Uploading photos…" : log.isPending ? "Saving…" : "Save to journal"}
          </Button>
        </div>
      }
    >
      {!initial ? (
        <div className="flex flex-col gap-4" aria-busy="true">
          <Skel className="h-11 w-2/3" />
          <Skel className="h-16 w-full" />
          <Skel className="h-24 w-full" />
        </div>
      ) : (
        <ObservationForm
          formId={formId}
          initial={initial}
          gear={gear.data}
          tz={tz}
          hour12={hour12}
          photosEnabled={features.photos}
          error={error}
          onSubmit={submit}
          before={
            <LocationNote
              site={site}
              savedName={savedLocation?.name ?? null}
              isGuest={isGuest}
              saving={saveSite.isPending}
              saveError={saveSite.error ? (saveSite.error as Error).message : null}
              onSave={() => saveSite.mutate()}
            />
          }
        />
      )}
    </ResponsiveModal>
  );
}

function LocationNote({
  site,
  savedName,
  isGuest,
  saving,
  saveError,
  onSave,
}: {
  site: ReturnType<typeof useSite>["site"];
  savedName: string | null;
  isGuest: boolean;
  saving: boolean;
  saveError: string | null;
  onSave: () => void;
}) {
  if (!site)
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
        No location set — this is logged without one.
      </p>
    );
  if (!isGuest)
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          At <span className="text-foreground">{savedName ?? site.name}</span> · Bortle <span className="num">{site.bortle}</span>
        </span>
      </p>
    );
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-surface-2/50 p-3 text-sm sm:flex-row sm:items-center">
      <MapPin className="hidden h-4 w-4 shrink-0 text-primary sm:block" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-muted-foreground">
        <span className="text-foreground">{site.name}</span> isn't saved yet. Save it so your journal remembers where you were — or just log without a location.
        {saveError && <span className="mt-1 block text-destructive">{saveError}</span>}
      </p>
      <Button type="button" variant="subtle" size="sm" onClick={onSave} disabled={saving} className="h-9 shrink-0">
        {saving && <Loader2 className="animate-spin" />}
        Save location
      </Button>
    </div>
  );
}
