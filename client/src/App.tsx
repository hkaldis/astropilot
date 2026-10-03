import { lazy, Suspense, Component, type ReactNode } from "react";
import { Switch, Route, Redirect } from "wouter";
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

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error(error);
  }
  render() {
    if (this.state.error)
      return (
        <div className="mx-auto max-w-md py-24 text-center">
          <h1 className="font-display text-3xl">Something went sideways</h1>
          <p className="mt-2 text-sm text-muted-foreground">An unexpected error stopped this page. Reloading usually fixes it.</p>
          <Button className="mt-6" onClick={() => location.reload()}>
            Reload
          </Button>
        </div>
      );
    return this.props.children;
  }
}

function Routes() {
  return (
    <Switch>
      <Route path="/login">{() => <Auth mode="login" />}</Route>
      <Route path="/register">{() => <Auth mode="register" />}</Route>
      <Route>
        {() => (
          <AppShell>
            <ErrorBoundary>
              <Suspense fallback={<PageFallback />}>
                <Switch>
                  <Route path="/" component={Tonight} />
                  <Route path="/sky" component={Sky} />
                  <Route path="/explore" component={Explore} />
                  <Route path="/object/:id">{(p) => <ObjectPage id={decodeURIComponent(p.id)} />}</Route>
                  <Route path="/plan" component={Plan} />
                  <Route path="/journal" component={Journal} />
                  <Route path="/journal/:id">{(p) => <JournalSession id={Number(p.id)} />}</Route>
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
  );
}
