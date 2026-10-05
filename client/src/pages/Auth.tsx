import { useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { useFeatures, useLogin, useRegister } from "@/hooks/useAuth";
import { useSite } from "@/hooks/useSite";
import { stagger } from "@/lib/motion";
import { Logo } from "@/components/common/Glyphs";
import { usePageTitle } from "@/components/common/Page";
import { SkyBackdrop } from "@/components/common/SkyBackdrop";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h6c-.3 1.4-1.1 2.5-2.2 3.3v2.7h3.6c2.1-1.9 3.2-4.8 3.2-8z" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.4-2.7l-3.6-2.8c-1 .7-2.3 1.1-3.8 1.1-2.9 0-5.4-2-6.3-4.6H2v2.9C3.8 20.5 7.6 23 12 23z" />
      <path fill="#FBBC05" d="M5.7 14c-.2-.7-.4-1.4-.4-2.1s.1-1.5.4-2.1V6.9H2C1.3 8.4.9 10.1.9 11.9s.4 3.5 1.1 5L5.7 14z" />
      <path fill="#EA4335" d="M12 5.3c1.6 0 3.1.6 4.2 1.7l3.2-3.2C17.5 2 15 1 12 1 7.6 1 3.8 3.5 2 7l3.7 2.9C6.6 7.3 9.1 5.3 12 5.3z" />
    </svg>
  );
}

export default function AuthPage({ mode }: { mode: "login" | "register" }) {
  usePageTitle(mode === "login" ? "Sign in" : "Create account");
  const [, navigate] = useLocation();
  const features = useFeatures();
  const login = useLogin();
  const register = useRegister();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const { site } = useSite();
  const south = !!site && site.lat < 0;
  const isLogin = mode === "login";
  const pending = login.isPending || register.isPending;
  const googleError = typeof location !== "undefined" && new URLSearchParams(location.search).get("error") === "google";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      if (isLogin) await login.mutateAsync({ email, password });
      else await register.mutateAsync({ email, password, firstName: name || undefined });
      navigate("/");
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong. Please try again.");
      setAttempt((n) => n + 1);
    }
  };

  // The form arrives in sequence: heading, intro, Google, fields, button.
  const step = (i: number) => ({ className: "animate-rise", style: stagger(i, 60) });
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="relative hidden overflow-hidden border-r bg-surface lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(60%_55%_at_68%_32%,hsl(var(--primary)/0.14),transparent)]" aria-hidden="true" />
        <SkyBackdrop hemisphere={south ? "south" : "north"} lon={site?.lon} className="absolute inset-0" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-surface via-surface/75 to-transparent" aria-hidden="true" />
        <div className="relative flex h-full flex-col justify-between p-10">
          <Link href="/" className="self-start">
            <Logo intro glow />
          </Link>
          <blockquote className="max-w-md animate-rise" style={{ animationDelay: "0.6s" }}>
            <p className="font-display text-[2.2rem] leading-tight">“The best telescope is the one you take out on a clear night.”</p>
            <p className="mt-3 text-sm text-muted-foreground">AstroPilot tells you which nights those are — and what to point it at.</p>
            <p className="mt-8 text-2xs uppercase tracking-[0.16em] text-muted-foreground/70">
              {south ? "Tonight's southern sky, turning around the south celestial pole" : "Tonight's northern sky, turning around Polaris"}
            </p>
          </blockquote>
        </div>
      </div>
      <div className="relative flex items-center justify-center overflow-hidden px-5 py-12">
        <div className="fade-bottom pointer-events-none absolute inset-x-0 top-0 h-[46vh] lg:hidden" aria-hidden="true">
          <SkyBackdrop hemisphere={south ? "south" : "north"} lon={site?.lon} pole={[0.8, 0.12]} span={72} />
        </div>
        <div className="relative w-full max-w-sm">
          <Link href="/" className="mb-10 inline-block lg:hidden">
            <Logo intro glow />
          </Link>
          <h1 className="animate-rise font-display text-[2.3rem] leading-tight" style={stagger(1, 60)}>
            {isLogin ? "Welcome back" : "Create your account"}
          </h1>
          <p className="mt-1.5 animate-rise text-sm text-muted-foreground" style={stagger(2, 60)}>
            {isLogin ? "Sign in to your observing log, gear and locations." : "Free. Save your sites, gear and observing log across devices."}
          </p>
          {features.google && (
            <div {...step(3)}>
              <Button asChild variant="outline" className="mt-7 w-full">
                <a href="/api/auth/google">
                  <GoogleMark /> Continue with Google
                </a>
              </Button>
              <div className="my-5 flex items-center gap-3 text-2xs uppercase tracking-widest text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                or
                <span className="h-px flex-1 bg-border" />
              </div>
            </div>
          )}
          <form onSubmit={submit} className={features.google ? "flex flex-col gap-4" : "mt-7 flex flex-col gap-4"} noValidate>
            {!isLogin && (
              <div className="grid gap-1.5 animate-rise" style={stagger(4, 60)}>
                <Label htmlFor="name">First name (optional)</Label>
                <Input id="name" autoComplete="given-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
            )}
            <div className="grid gap-1.5 animate-rise" style={stagger(5, 60)}>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="grid gap-1.5 animate-rise" style={stagger(6, 60)}>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete={isLogin ? "current-password" : "new-password"}
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {!isLogin && <p className="text-2xs text-muted-foreground">At least 8 characters.</p>}
            </div>
            {(error || googleError) && (
              // Re-keyed on each failed attempt, so the message gives a small shake every time.
              <p key={attempt} role="alert" className="animate-nudge rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error ?? "Google sign-in didn't complete. Please try again."}
              </p>
            )}
            <Button type="submit" size="lg" disabled={pending} className="mt-1 animate-rise" style={stagger(7, 60)}>
              {pending && <Loader2 className="animate-spin" />}
              {isLogin ? "Sign in" : "Create account"}
            </Button>
          </form>
          <p className="mt-6 animate-fade text-sm text-muted-foreground" style={{ animationDelay: "0.55s" }}>
            {isLogin ? "New to AstroPilot? " : "Already have an account? "}
            <Link href={isLogin ? "/register" : "/login"} className="link">
              {isLogin ? "Create an account" : "Sign in"}
            </Link>
          </p>
          <p className="mt-10 text-2xs text-muted-foreground">
            By continuing you agree to the{" "}
            <Link href="/terms" className="underline">
              terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline">
              privacy policy
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
