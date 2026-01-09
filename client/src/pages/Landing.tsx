import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useTheme } from "@/components/ThemeProvider";
import { Star, Moon, Eye, Wand2, ClipboardList, Telescope } from "lucide-react";
import astroPilotLogo from "@assets/Dark_mode_logo_1764867508003.png";
import starboardDarkLogo from "@assets/darkmode-starboard_1764868891632.png";
import starboardLightLogo from "@assets/lightmode-starboard_1764868894879.png";

const features = [
  {
    icon: Telescope,
    title: "Equipment Management",
    description: "Track your telescopes, eyepieces, barlows, filters, and cameras in one place.",
  },
  {
    icon: Eye,
    title: "Night Scoring",
    description: "Calculate observation quality based on clouds, seeing, jetstream, humidity, and moon phase.",
  },
  {
    icon: Star,
    title: "Object Catalog",
    description: "Browse Messier, NGC, and planetary objects with optimal viewing recommendations.",
  },
  {
    icon: Wand2,
    title: "Smart Recommendations",
    description: "Get personalized eyepiece, filter, and imaging suggestions for each observation.",
  },
  {
    icon: Moon,
    title: "Location Tracking",
    description: "Manage your observing sites with Bortle scale ratings for light pollution.",
  },
  {
    icon: ClipboardList,
    title: "Observation Logging",
    description: "Record your sessions with equipment used, conditions, and personal notes.",
  },
];

export default function Landing() {
  const { theme } = useTheme();
  
  return (
    <div className="min-h-screen bg-background">
      <header className="fixed top-0 inset-x-0 z-50 border-b bg-background/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center p-1.5 overflow-hidden">
              <img src={astroPilotLogo} alt="AstroPilot" className="w-full h-full object-contain" />
            </div>
            <span className="font-semibold text-lg">AstroPilot</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button asChild data-testid="button-login">
              <Link href="/login">Log in</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="pt-16">
        <section className="py-20 md:py-32">
          <div className="max-w-7xl mx-auto px-4 md:px-6">
            <div className="max-w-3xl mx-auto text-center">
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
                Plan Your Perfect
                <span className="text-primary block mt-2">Observing Night</span>
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
                An intelligent astronomy companion that helps you plan, optimize, and log telescope observations 
                based on your equipment, location, and real-time night conditions.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button size="lg" asChild data-testid="button-get-started">
                  <Link href="/register">Get Started</Link>
                </Button>
                <Button variant="outline" size="lg" asChild data-testid="button-learn-more">
                  <a href="#features">Learn More</a>
                </Button>
              </div>
            </div>

            <div className="mt-16 md:mt-24 relative">
              <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent z-10" />
              <Card className="max-w-5xl mx-auto overflow-hidden">
                <div className="bg-sidebar p-4 md:p-8">
                  <div className="grid grid-cols-3 gap-4 md:gap-8">
                    <div className="text-center p-4 rounded-lg bg-background/50">
                      <div className="font-mono text-3xl md:text-5xl font-bold text-emerald-400 mb-2">8.5</div>
                      <div className="text-[10px] md:text-xs uppercase tracking-wider text-muted-foreground">Total Score</div>
                    </div>
                    <div className="text-center p-4 rounded-lg bg-background/50">
                      <div className="font-mono text-3xl md:text-5xl font-bold text-chart-4 mb-2">4.2</div>
                      <div className="text-[10px] md:text-xs uppercase tracking-wider text-muted-foreground">Planet Score</div>
                    </div>
                    <div className="text-center p-4 rounded-lg bg-background/50">
                      <div className="font-mono text-3xl md:text-5xl font-bold text-chart-1 mb-2">6.1</div>
                      <div className="text-[10px] md:text-xs uppercase tracking-wider text-muted-foreground">DSO Score</div>
                    </div>
                  </div>
                  <div className="mt-6 text-center text-sm text-muted-foreground">
                    Tonight's observing conditions at your location
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </section>

        <section id="features" className="py-20 bg-card/50">
          <div className="max-w-7xl mx-auto px-4 md:px-6">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Everything You Need for Observing
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                Comprehensive tools to plan and document your astronomical observations.
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {features.map((feature) => (
                <Card key={feature.title} className="hover-elevate transition-shadow">
                  <CardHeader>
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                      <feature.icon className="w-5 h-5 text-primary" />
                    </div>
                    <CardTitle className="text-lg">{feature.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-sm">{feature.description}</CardDescription>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="py-20">
          <div className="max-w-7xl mx-auto px-4 md:px-6 text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Ready to Start Observing?
            </h2>
            <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
              Join astronomers who use AstroPilot to make the most of every clear night.
            </p>
            <Button size="lg" asChild data-testid="button-join-now">
              <Link href="/register">Join Now</Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t py-8">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <div className="flex flex-col items-center gap-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 w-full">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-primary flex items-center justify-center p-1 overflow-hidden">
                  <img src={astroPilotLogo} alt="AstroPilot" className="w-full h-full object-contain" />
                </div>
                <span className="text-sm font-medium">AstroPilot</span>
              </div>
              <div className="flex items-center gap-4">
                <Link href="/privacy" className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-footer-privacy">
                  Privacy Policy
                </Link>
                <Link href="/terms" className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-footer-terms">
                  Terms of Service
                </Link>
              </div>
              <p className="text-sm text-muted-foreground">
                Plan smarter. Observe better.
              </p>
            </div>
            <a 
              href="https://starboardstudio.com" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex flex-col items-center gap-2 transition-opacity hover:opacity-80"
              data-testid="link-starboard-studio"
            >
              <span className="text-xs text-muted-foreground">Developed by</span>
              <img 
                src={theme === "dark" ? starboardDarkLogo : starboardLightLogo}
                alt="Starboard Studio"
                className="h-8 object-contain"
              />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
