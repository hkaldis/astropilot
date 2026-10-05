import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useAuth, useLogout, AUTH_KEY } from "@/hooks/useAuth";
import { usePrefs } from "@/hooks/usePrefs";
import { useTheme, type Theme } from "@/hooks/useTheme";
import { useSite } from "@/hooks/useSite";
import { useGear } from "@/hooks/useScope";
import { api, queryClient } from "@/lib/api";
import { PageHeader, Section, usePageTitle } from "@/components/common/Page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { toast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { clearOfflineApiCache } from "@/lib/offline";
import type { ApiUser } from "@shared/api";

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border bg-surface-2/50 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn("rounded-md px-3 py-1.5 text-sm transition-colors", value === o.value ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Row({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-b py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="text-sm font-medium">{title}</div>
        {description && <div className="text-xs text-muted-foreground">{description}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  usePageTitle("Settings");
  const { user } = useAuth();
  const { prefs, setPrefs } = usePrefs();
  const { theme, setTheme } = useTheme();
  const { locations } = useSite();
  const gear = useGear();
  const logout = useLogout();
  const [, navigate] = useLocation();
  const [minAlt, setMinAlt] = useState(prefs.minAltitude);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <PageHeader title="Settings" description="Make AstroPilot fit how and where you observe." />

      <Section title="Display">
        <div className="panel px-4">
          <Row title="Theme" description="Night vision turns the whole screen red to protect your dark adaptation.">
            <Segmented<Theme>
              label="Theme"
              value={theme}
              onChange={setTheme}
              options={[
                { value: "dark", label: "Dark" },
                { value: "night", label: "Night vision" },
                { value: "light", label: "Light" },
              ]}
            />
          </Row>
          <Row title="Units">
            <Segmented
              label="Units"
              value={prefs.units}
              onChange={(v) => setPrefs({ units: v })}
              options={[
                { value: "metric", label: "Metric" },
                { value: "imperial", label: "Imperial" },
              ]}
            />
          </Row>
          <Row title="Time format">
            <Segmented
              label="Time format"
              value={prefs.timeFormat}
              onChange={(v) => setPrefs({ timeFormat: v })}
              options={[
                { value: "24h", label: "24-hour" },
                { value: "12h", label: "12-hour" },
              ]}
            />
          </Row>
        </div>
      </Section>

      <Section title="Observing">
        <div className="panel px-4">
          <Row title="Minimum altitude" description="Objects lower than this are considered too low (thick air, trees, houses).">
            <div className="flex w-56 items-center gap-3">
              <Slider
                aria-label="Minimum altitude"
                value={[minAlt]}
                min={5}
                max={45}
                step={1}
                onValueChange={(v) => setMinAlt(v[0])}
                onValueCommit={(v) => setPrefs({ minAltitude: v[0] })}
              />
              <span className="num w-10 text-right text-sm">{minAlt}°</span>
            </div>
          </Row>
          {user && (
            <>
              <Row title="Default location">
                <select
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                  value={prefs.defaultLocationId ?? ""}
                  onChange={(e) => setPrefs({ defaultLocationId: e.target.value ? Number(e.target.value) : null })}
                  aria-label="Default location"
                >
                  <option value="">First saved location</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </Row>
              <Row title="Default telescope">
                <select
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                  value={prefs.defaultTelescopeId ?? ""}
                  onChange={(e) => setPrefs({ defaultTelescopeId: e.target.value ? Number(e.target.value) : null })}
                  aria-label="Default telescope"
                >
                  <option value="">First telescope</option>
                  {(gear.data?.telescopes ?? []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </Row>
            </>
          )}
        </div>
      </Section>

      {user ? (
        <>
          <ProfileSection user={user} />
          <PasswordSection user={user} />
          <Section title="Account">
            <div className="panel px-4">
              <Row title="Export your journal" description="All your observations as a spreadsheet (CSV).">
                <Button asChild variant="outline" size="sm">
                  <a href="/api/journal/export.csv">Download CSV</a>
                </Button>
              </Row>
              <Row title="Sign out">
                <Button variant="outline" size="sm" onClick={() => logout.mutate(undefined, { onSuccess: () => navigate("/") })}>
                  Sign out
                </Button>
              </Row>
              <Row title="Delete account" description="Permanently deletes your account, locations, gear and observing log.">
                <DeleteAccount />
              </Row>
            </div>
          </Section>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          <Link href="/register" className="link">
            Create a free account
          </Link>{" "}
          to keep these settings, your locations, gear and observing log on every device.
        </p>
      )}
    </div>
  );
}

function ProfileSection({ user }: { user: ApiUser }) {
  const [first, setFirst] = useState(user.firstName ?? "");
  const [last, setLast] = useState(user.lastName ?? "");
  const m = useMutation({
    mutationFn: () => api<{ user: ApiUser }>("PATCH", "/api/me", { firstName: first || null, lastName: last || null }),
    onSuccess: (r) => {
      queryClient.setQueryData(AUTH_KEY, { user: r.user });
      toast({ title: "Profile saved" });
    },
    onError: (e: any) => toast({ title: "Couldn't save", description: e.message, variant: "destructive" }),
  });
  return (
    <Section title="Profile">
      <form
        className="panel grid gap-4 p-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="first">First name</Label>
          <Input id="first" value={first} onChange={(e) => setFirst(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="last">Last name</Label>
          <Input id="last" value={last} onChange={(e) => setLast(e.target.value)} />
        </div>
        <div className="text-xs text-muted-foreground sm:col-span-2">Signed in as {user.email}</div>
        <div className="sm:col-span-2">
          <Button type="submit" size="sm" disabled={m.isPending}>
            {m.isPending && <Loader2 className="animate-spin" />}Save profile
          </Button>
        </div>
      </form>
    </Section>
  );
}

function PasswordSection({ user }: { user: ApiUser }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const m = useMutation({
    mutationFn: () => api("POST", "/api/me/password", { current: current || undefined, next }),
    onSuccess: () => {
      setCurrent("");
      setNext("");
      toast({ title: user.hasPassword ? "Password changed" : "Password set" });
    },
    onError: (e: any) => toast({ title: "Couldn't change password", description: e.message, variant: "destructive" }),
  });
  return (
    <Section title={user.hasPassword ? "Change password" : "Add a password"} description={user.hasPassword ? undefined : "Sign in with email as well as Google."}>
      <form
        className="panel grid gap-4 p-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
      >
        {user.hasPassword && (
          <div className="grid gap-1.5">
            <Label htmlFor="pw-current">Current password</Label>
            <Input id="pw-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </div>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor="pw-next">New password</Label>
          <Input id="pw-next" type="password" autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" size="sm" variant="outline" disabled={m.isPending || next.length < 8}>
            {m.isPending && <Loader2 className="animate-spin" />}
            {user.hasPassword ? "Change password" : "Set password"}
          </Button>
        </div>
      </form>
    </Section>
  );
}

function DeleteAccount() {
  const [, navigate] = useLocation();
  const m = useMutation({
    mutationFn: () => api("DELETE", "/api/me"),
    onSuccess: () => {
      clearOfflineApiCache();
      queryClient.clear();
      queryClient.setQueryData(AUTH_KEY, { user: null });
      navigate("/");
    },
    onError: (e: any) => toast({ title: "Couldn't delete account", description: e.message, variant: "destructive" }),
  });
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" className="border-destructive/40 text-destructive hover:bg-destructive/10">
          Delete account
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete your account?</AlertDialogTitle>
          <AlertDialogDescription>This permanently removes your account, saved locations, gear and every logged observation. It can't be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep my account</AlertDialogCancel>
          <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => m.mutate()}>
            Delete everything
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
