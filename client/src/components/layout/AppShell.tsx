import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  Moon,
  Telescope,
  Compass,
  BookOpen,
  ListChecks,
  MapPin,
  Settings,
  Sparkles,
  MoreHorizontal,
  LogIn,
  LogOut,
  Eye,
  Sun,
  Heart,
  Trophy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/common/Glyphs";
import { SiteSwitcher } from "./SiteSwitcher";
import { AchievementWatcher } from "@/features/achievements/Watcher";
import { useAuth, useLogout, displayName, useFeatures } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { withViewTransition } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface NavItem {
  href: string;
  label: string;
  icon: typeof Moon;
  match?: (p: string) => boolean;
}

export const NAV: NavItem[] = [
  { href: "/", label: "Tonight", icon: Sparkles, match: (p) => p === "/" },
  { href: "/sky", label: "Sky chart", icon: Compass },
  { href: "/explore", label: "Explore", icon: Telescope, match: (p) => p.startsWith("/explore") || p.startsWith("/object") },
  { href: "/plan", label: "Plan", icon: ListChecks },
  { href: "/journal", label: "Journal", icon: BookOpen },
];

export const NAV_SECONDARY: NavItem[] = [
  { href: "/achievements", label: "Achievements", icon: Trophy },
  { href: "/gear", label: "My gear", icon: Telescope },
  { href: "/locations", label: "Locations", icon: MapPin },
  { href: "/settings", label: "Settings", icon: Settings },
];

function isActive(item: NavItem, path: string) {
  return item.match ? item.match(path) : path === item.href || path.startsWith(item.href + "/");
}

function NightToggle({ compact }: { compact?: boolean }) {
  const { theme, toggleNight } = useTheme();
  const on = theme === "night";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={on ? "subtle" : "ghost"}
          size={compact ? "icon-sm" : "icon"}
          onClick={() => withViewTransition(toggleNight)}
          aria-pressed={on}
          aria-label={on ? "Turn off night vision" : "Turn on night vision (red light)"}
          className={cn(on && "text-red-500")}
        >
          <Eye key={String(on)} className="animate-spin-in" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{on ? "Night vision on" : "Night vision (red light)"}</TooltipContent>
    </Tooltip>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const light = theme === "light";
  return (
    <Button variant="ghost" size="icon-sm" onClick={() => withViewTransition(() => setTheme(light ? "dark" : "light"))} aria-label={light ? "Switch to dark theme" : "Switch to light theme"}>
      {light ? <Moon key="moon" className="animate-spin-in" /> : <Sun key="sun" className="animate-spin-in" />}
    </Button>
  );
}

function AccountBlock() {
  const { user, isLoading } = useAuth();
  const logout = useLogout();
  const [, navigate] = useLocation();
  if (isLoading) return <div className="h-11" />;
  if (!user)
    return (
      <div className="flex flex-col gap-2 rounded-xl border bg-surface-2/50 p-3">
        <p className="text-xs text-muted-foreground">Save locations, gear and your observing log.</p>
        <div className="flex gap-2">
          <Button asChild size="sm" className="flex-1">
            <Link href="/register">Sign up</Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="flex-1">
            <Link href="/login">
              <LogIn /> Sign in
            </Link>
          </Button>
        </div>
      </div>
    );
  const initials = displayName(user)
    .split(/\s+/)
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="flex items-center gap-3 rounded-xl px-2 py-1.5">
      {user.profileImageUrl ? (
        <img src={user.profileImageUrl} alt="" className="h-8 w-8 rounded-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        <div className="grid h-8 w-8 place-items-center rounded-full bg-primary/15 text-xs font-semibold text-primary">{initials}</div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{displayName(user)}</div>
        <div className="truncate text-2xs text-muted-foreground">{user.email}</div>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Sign out"
        onClick={() => logout.mutate(undefined, { onSuccess: () => navigate("/") })}
      >
        <LogOut />
      </Button>
    </div>
  );
}

function SideNav() {
  const [path] = useLocation();
  const features = useFeatures();
  return (
    <aside className="sticky top-0 hidden h-dvh w-[15.5rem] shrink-0 flex-col border-r bg-surface/60 px-3 py-5 lg:flex">
      <Link href="/" className="mb-7 px-2">
        <Logo />
      </Link>
      <nav className="flex flex-col gap-0.5" aria-label="Main">
        {NAV.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item, path)} />
        ))}
      </nav>
      <div className="my-4 h-px bg-border" />
      <nav className="flex flex-col gap-0.5" aria-label="Your stuff">
        {NAV_SECONDARY.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item, path)} />
        ))}
        {features.donations && <NavLink item={{ href: "/support", label: "Support AstroPilot", icon: Heart }} active={path.startsWith("/support")} />}
      </nav>
      <div className="mt-auto flex flex-col gap-3">
        <div className="flex items-center justify-between px-2">
          <span className="eyebrow">Display</span>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <NightToggle compact />
          </div>
        </div>
        <AccountBlock />
      </div>
    </aside>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={cn(
        "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
        active ? "bg-primary/10 font-medium text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
      aria-current={active ? "page" : undefined}
    >
      <Icon key={String(active)} className={cn("h-[1.05rem] w-[1.05rem] transition-colors", active ? "animate-pop text-primary" : "text-muted-foreground group-hover:text-foreground")} />
      {item.label}
    </Link>
  );
}

function MobileTabs() {
  const [path] = useLocation();
  const [more, setMore] = useState(false);
  const features = useFeatures();
  const tabs = NAV.filter((n) => n.href !== "/plan");
  const moreActive = [...NAV_SECONDARY, NAV[3]].some((n) => isActive(n, path));
  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/90 backdrop-blur-xl lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        aria-label="Main"
      >
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {tabs.map((item) => {
            const active = isActive(item, path);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn("relative flex flex-col items-center gap-1 py-2.5 text-[0.75rem] transition-colors", active ? "text-primary" : "text-muted-foreground")}
                aria-current={active ? "page" : undefined}
              >
                {active && <span className="absolute inset-x-0 top-0 mx-auto h-0.5 w-8 origin-center animate-grow-x rounded-full bg-primary" aria-hidden="true" />}
                <Icon key={String(active)} className={cn("h-5 w-5", active && "animate-pop")} />
                {item.label.replace(" chart", "")}
              </Link>
            );
          })}
          <button onClick={() => setMore(true)} className={cn("flex flex-col items-center gap-1 py-2.5 text-[0.75rem]", moreActive ? "text-primary" : "text-muted-foreground")}>
            <MoreHorizontal className="h-5 w-5" />
            More
          </button>
        </div>
      </nav>
      <Sheet open={more} onOpenChange={setMore}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
          <SheetHeader>
            <SheetTitle className="text-left">More</SheetTitle>
          </SheetHeader>
          <div className="mt-3 grid gap-1" onClick={() => setMore(false)}>
            {[NAV[3], ...NAV_SECONDARY].map((item) => (
              <NavLink key={item.href} item={item} active={isActive(item, path)} />
            ))}
            {features.donations && <NavLink item={{ href: "/support", label: "Support AstroPilot", icon: Heart }} active={path.startsWith("/support")} />}
          </div>
          <div className="mt-4 border-t pt-4">
            <AccountBlock />
          </div>
          <div className="mt-3 flex gap-4 px-2 text-xs text-muted-foreground" onClick={() => setMore(false)}>
            <Link href="/about" className="hover:text-foreground">About</Link>
            <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
            <Link href="/terms" className="hover:text-foreground">Terms</Link>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function TopBar() {
  return (
    <div
      className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur-xl"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <div className="mx-auto flex h-14 max-w-[1240px] items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="lg:hidden">
          <Logo withText={false} />
        </Link>
        <SiteSwitcher />
        <div className="ml-auto flex items-center gap-1">
          <div className="lg:hidden">
            <NightToggle compact />
          </div>
        </div>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <SideNav />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="mx-auto w-full max-w-[1240px] flex-1 px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-16 lg:pt-8">{children}</main>
        <AchievementWatcher />
        <footer className="mx-auto hidden w-full max-w-[1240px] items-center justify-between gap-4 px-8 pb-8 text-xs text-muted-foreground lg:flex">
          <span>AstroPilot · Ephemerides by astronomy-engine · Weather by Open-Meteo · Catalog by OpenNGC · Light pollution by D. J. Lorenz (2025 atlas)</span>
          <span className="flex gap-4">
            <Link href="/about" className="hover:text-foreground">About</Link>
            <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
            <Link href="/terms" className="hover:text-foreground">Terms</Link>
          </span>
        </footer>
      </div>
      <MobileTabs />
    </div>
  );
}
