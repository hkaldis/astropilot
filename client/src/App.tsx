import { lazy, Suspense, Component, useEffect, useRef, type ReactNode } from "react";
import { Switch, Route, Redirect, useLocation } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/api";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SiteProvider } from "@/hooks/useSite";
import { AppShell } from "@/components/layout/AppShell";
import { Skel } from "@/components/common/Page";
import { Button } from "@/components/ui/button";

const Tonight = lazy(() => import("@/pages/Tonight"));
const Sky = lazy(() => import("@/pages/Sky"));
const Explore = lazy(() => import("@/pages/Explore"));
const ObjectPage = lazy(() => import("@/pages/ObjectPage"));
const Plan = lazy(() => import("@/pages/Plan"));
const Journal = lazy(() => import("@/pages/Journal"));
const JournalSession = lazy(() => import("@/pages/JournalSession"));
const Achievements = lazy(() => import("@/pages/Achievements"));
const Gear = lazy(() => import("@/pages/Gear"));
const Locations = lazy(() => import("@/pages/Locations"));
const Settings = lazy(() => import("@/pages/Settings"));
const Auth = lazy(() => import("@/pages/Auth"));
const Legal = lazy(() => import("@/pages/Legal"));
const Support = lazy(() => import("@/pages/Support"));
const NotFound = lazy(() => import("@/pages/NotFound"));

function PageFallback() {
  return (
    <div className="flex flex-col gap-4">
      <Skel className="h-10 w-64" />
      <Skel className="h-48 w-full" />
      <Skel className="h-32 w-full" />
    </div>
  );
}

/**
 * Catches render errors below it. `fullPage` is the last line of defence around the whole app (top bar,
 * navigation, providers); the one inside the shell keeps a broken page from taking the navigation with it,
 * and clears itself when you navigate elsewhere (`resetKey`).
 */
class ErrorBoundary extends Component<{ children: ReactNode; fullPage?: boolean; resetKey?: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error(error);
  }
  componentDidUpdate(prev: { resetKey?: string }) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }
  render() {
    if (!this.state.error) return this.props.children;
    const message = (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="font-display text-3xl">Something went sideways</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {this.props.fullPage ? "An unexpected error stopped AstroPilot." : "An unexpected error stopped this page."} Reloading usually fixes it.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Button onClick={() => location.reload()}>Reload</Button>
          {this.props.fullPage && (
            <Button asChild variant="outline">
              <a href="/">Go to Tonight</a>
            </Button>
          )}
        </div>
      </div>
    );
    return this.props.fullPage ? <main className="min-h-dvh bg-background text-foreground">{message}</main> : message;
  }
}

/**
 * A new page starts at the top (browsers keep the old scroll position on in-app navigation), except
 * when going back or forward, where the browser restores where you were.
 */
function useScrollToTopOnNavigate(path: string) {
  const popped = useRef(false);
  useEffect(() => {
    const onPop = () => {
      popped.current = true;
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => {
    if (popped.current) popped.current = false;
    else window.scrollTo({ top: 0 });
  }, [path]);
}

function Routes() {
  const [path] = useLocation();
  useScrollToTopOnNavigate(path);
  return (
    <Switch>
      <Route path="/login">{() => <Auth mode="login" />}</Route>
      <Route path="/register">{() => <Auth mode="register" />}</Route>
      <Route>
        {() => (
          <AppShell>
            <ErrorBoundary resetKey={path}>
              <Suspense fallback={<PageFallback />}>
                {/* Each page fades in as it arrives. */}
                <div key={path} className="animate-page">
                  <Switch>
                    <Route path="/" component={Tonight} />
                    <Route path="/sky" component={Sky} />
                    <Route path="/explore" component={Explore} />
                    <Route path="/object/:id">{(p) => <ObjectPage id={decodeURIComponent(p.id)} />}</Route>
                    <Route path="/plan" component={Plan} />
                    <Route path="/journal" component={Journal} />
                    <Route path="/journal/:id">{(p) => <JournalSession id={Number(p.id)} />}</Route>
                    <Route path="/achievements" component={Achievements} />
                    <Route path="/gear" component={Gear} />
                    <Route path="/locations" component={Locations} />
                    <Route path="/settings" component={Settings} />
                    <Route path="/privacy">{() => <Legal page="privacy" />}</Route>
                    <Route path="/terms">{() => <Legal page="terms" />}</Route>
                    <Route path="/about">{() => <Legal page="about" />}</Route>
                    <Route path="/support" component={Support} />
                    <Route path="/support/thanks" component={Support} />
                    {/* AstroPilot 1 addresses → their new homes */}
                    <Route path="/donation/success">{() => <Redirect to={`/support/thanks${location.search}`} replace />}</Route>
                    <Route path="/donation/cancel">{() => <Redirect to="/support" replace />}</Route>
                    <Route path="/sky-tonight">{() => <Redirect to="/sky" replace />}</Route>
                    <Route path="/objects">{() => <Redirect to="/explore" replace />}</Route>
                    <Route path="/recommendations">{() => <Redirect to="/explore" replace />}</Route>
                    <Route path="/wizard">{() => <Redirect to="/plan" replace />}</Route>
                    <Route path="/watchlist">{() => <Redirect to="/plan" replace />}</Route>
                    <Route path="/sessions">{() => <Redirect to="/journal" replace />}</Route>
                    <Route path="/achievements">{() => <Redirect to="/journal" replace />}</Route>
                    <Route path="/equipment">{() => <Redirect to="/gear" replace />}</Route>
                    <Route path="/equipment-analyzer">{() => <Redirect to="/gear" replace />}</Route>
                    <Route path="/help">{() => <Redirect to="/about" replace />}</Route>
                    <Route component={NotFound} />
                  </Switch>
                </div>
              </Suspense>
            </ErrorBoundary>
          </AppShell>
        )}
      </Route>
    </Switch>
  );
}

export default function App() {
  return (
    <ErrorBoundary fullPage>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={250}>
          <SiteProvider>
            <Suspense fallback={null}>
              <Routes />
            </Suspense>
            <Toaster />
          </SiteProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
