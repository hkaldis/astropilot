import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Footer } from "@/components/Footer";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import PrivacyPolicy from "@/pages/PrivacyPolicy";
import TermsOfService from "@/pages/TermsOfService";
import Dashboard from "@/pages/Dashboard";
import Equipment from "@/pages/Equipment";
import Locations from "@/pages/Locations";
import Objects from "@/pages/Objects";
import WatchList from "@/pages/WatchList";
import Wizard from "@/pages/Wizard";
import Sessions from "@/pages/Sessions";
import EquipmentAnalyzer from "@/pages/EquipmentAnalyzer";
import SkyTonight from "@/pages/SkyTonight";
import Achievements from "@/pages/Achievements";
import Settings from "@/pages/Settings";
import DonationSuccess from "@/pages/DonationSuccess";
import DonationCancel from "@/pages/DonationCancel";

function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center justify-between gap-2 p-2 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
            <div className="flex items-center gap-1">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
              <Button variant="ghost" size="icon" asChild data-testid="button-goto-dashboard">
                <Link href="/">
                  <Home className="w-4 h-4" />
                </Link>
              </Button>
            </div>
            <ThemeToggle />
          </header>
          <main className="flex-1 overflow-auto flex flex-col">
            <div className="flex-1">
              {children}
            </div>
            <Footer />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Switch>
        <Route path="/login" component={Login} />
        <Route path="/register" component={Register} />
        <Route path="/privacy" component={PrivacyPolicy} />
        <Route path="/terms" component={TermsOfService} />
        <Route component={Landing} />
      </Switch>
    );
  }

  return (
    <Switch>
      <Route path="/privacy" component={PrivacyPolicy} />
      <Route path="/terms" component={TermsOfService} />
      <Route>
        <AuthenticatedLayout>
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/equipment" component={Equipment} />
            <Route path="/locations" component={Locations} />
            <Route path="/objects" component={Objects} />
            <Route path="/watchlist" component={WatchList} />
            <Route path="/wizard" component={Wizard} />
            <Route path="/sessions" component={Sessions} />
            <Route path="/equipment-analyzer" component={EquipmentAnalyzer} />
            <Route path="/sky-tonight" component={SkyTonight} />
            <Route path="/achievements" component={Achievements} />
            <Route path="/settings" component={Settings} />
            <Route path="/donation/success" component={DonationSuccess} />
            <Route path="/donation/cancel" component={DonationCancel} />
            <Route component={NotFound} />
          </Switch>
        </AuthenticatedLayout>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
