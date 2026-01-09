import { useState } from "react";
import { Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { OnboardingTutorial } from "@/components/OnboardingTutorial";
import { useTheme } from "@/components/ThemeProvider";
import starboardDarkLogo from "@assets/darkmode-starboard_1764868891632.png";
import starboardLightLogo from "@assets/lightmode-starboard_1764868894879.png";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { 
  Cloud, 
  Eye, 
  Wind, 
  Droplets, 
  Moon, 
  Zap, 
  Telescope,
  Target,
  Sparkles,
  Star,
  Trophy,
  Camera,
  Filter,
  MapPin,
  Sun,
  Calculator,
  BookOpen,
  Info,
  RefreshCw,
  Loader2,
  User,
  LogOut,
  Shield,
  FileText,
  ExternalLink,
  Rocket
} from "lucide-react";

export default function Settings() {
  const { toast } = useToast();
  const { user, logout, isLoggingOut } = useAuth();
  const { theme } = useTheme();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);

  const handleRestartTutorial = () => {
    localStorage.removeItem("astropilot_tutorial_completed");
    setShowTutorial(true);
  };

  const handleLogout = async () => {
    try {
      await logout();
      window.location.href = "/";
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to log out. Please try again.",
        variant: "destructive",
      });
    }
  };

  const resetMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/user/reset-achievements');
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/user/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user/messier-progress'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user/achievements'] });
      toast({
        title: "Statistics recalculated",
        description: `Stats updated: ${data.stats.totalObservations} observations, ${data.messierProgress.count}/110 Messier objects. Badges preserved.`,
      });
      setIsDialogOpen(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to recalculate statistics. Please try again.",
        variant: "destructive",
      });
    },
  });

  return (
    <ScrollArea className="h-full">
      <div className="container max-w-4xl py-6 px-4 space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-settings-title">
            Settings
          </h1>
          <p className="text-muted-foreground">
            Manage your account and view the reference guide
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                Account
              </CardTitle>
              <CardDescription>Your account information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">Email</div>
                <div className="font-medium" data-testid="text-user-email">{user?.email || "Not available"}</div>
              </div>
              
              <Separator />
              
              <AlertDialog open={isLogoutDialogOpen} onOpenChange={setIsLogoutDialogOpen}>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="w-full" data-testid="button-logout">
                    <LogOut className="w-4 h-4 mr-2" />
                    Sign out
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Sign out?</AlertDialogTitle>
                    <AlertDialogDescription>
                      You'll need to sign in again to access your observations and equipment.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleLogout} disabled={isLoggingOut}>
                      {isLoggingOut ? "Signing out..." : "Sign out"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                Legal
              </CardTitle>
              <CardDescription>Privacy and terms</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Link href="/privacy">
                <Button variant="ghost" className="w-full justify-start" data-testid="link-privacy-policy">
                  <FileText className="w-4 h-4 mr-2" />
                  Privacy Policy
                  <ExternalLink className="w-3 h-3 ml-auto opacity-50" />
                </Button>
              </Link>
              <Link href="/terms">
                <Button variant="ghost" className="w-full justify-start" data-testid="link-terms-of-service">
                  <FileText className="w-4 h-4 mr-2" />
                  Terms of Service
                  <ExternalLink className="w-3 h-3 ml-auto opacity-50" />
                </Button>
              </Link>
              <Separator />
              <p className="text-xs text-muted-foreground">
                We respect your privacy and do not share your data with third parties.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Rocket className="w-5 h-5" />
                Getting Started
              </CardTitle>
              <CardDescription>Learn how to use AstroPilot</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                New to AstroPilot? Take the quick tutorial to learn about locations, conditions, and planning observations.
              </p>
              <Button 
                variant="outline" 
                className="w-full"
                onClick={handleRestartTutorial}
                data-testid="button-restart-tutorial"
              >
                <Rocket className="w-4 h-4 mr-2" />
                Start Tutorial
              </Button>
            </CardContent>
          </Card>
        </div>

        <Separator />

        <div className="space-y-2">
          <h2 className="text-xl font-semibold tracking-tight">Reference Guide</h2>
          <p className="text-sm text-muted-foreground">
            Complete glossary of calculations, scoring systems, and categorizations used in AstroPilot
          </p>
        </div>

        <Accordion type="multiple" defaultValue={["night-scoring", "power-class", "bortle"]} className="space-y-4">
          
          <AccordionItem value="night-scoring" className="border rounded-lg px-4">
            <AccordionTrigger className="hover:no-underline" data-testid="accordion-night-scoring">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-primary/10">
                  <Moon className="w-5 h-5 text-primary" />
                </div>
                <div className="text-left">
                  <div className="font-semibold">Night Condition Scoring</div>
                  <div className="text-sm text-muted-foreground font-normal">How atmospheric conditions are evaluated</div>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4 space-y-6">
              <p className="text-sm text-muted-foreground">
                Night conditions are scored based on real-time weather data from Open-Meteo API. Each factor contributes to an overall observing quality score.
              </p>

              <div className="space-y-4">
                <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                  <Cloud className="w-5 h-5 text-blue-500 mt-0.5" />
                  <div className="flex-1">
                    <div className="font-medium flex items-center gap-2">
                      Cloud Score
                      <Badge variant="outline" className="text-xs">0-4 points</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Based on maximum cloud coverage across low, mid, and high altitude layers.
                    </p>
                    <Table className="mt-2">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[120px]">Cloud Cover</TableHead>
                          <TableHead>Score</TableHead>
                          <TableHead>Description</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow><TableCell>≤10%</TableCell><TableCell className="font-medium text-green-600 dark:text-green-400">4</TableCell><TableCell>Crystal clear</TableCell></TableRow>
                        <TableRow><TableCell>11-30%</TableCell><TableCell className="font-medium text-emerald-600 dark:text-emerald-400">3</TableCell><TableCell>Mostly clear</TableCell></TableRow>
                        <TableRow><TableCell>31-60%</TableCell><TableCell className="font-medium text-yellow-600 dark:text-yellow-400">1</TableCell><TableCell>Partly cloudy</TableCell></TableRow>
                        <TableRow><TableCell>&gt;60%</TableCell><TableCell className="font-medium text-red-600 dark:text-red-400">0</TableCell><TableCell>Overcast</TableCell></TableRow>
                      </TableBody>
                    </Table>
                    <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                      <Info className="w-3 h-3" />
                      Source: Open-Meteo cloud cover forecast at low, mid, and high levels
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                  <Eye className="w-5 h-5 text-purple-500 mt-0.5" />
                  <div className="flex-1">
                    <div className="font-medium flex items-center gap-2">
                      Seeing Score
                      <Badge variant="outline" className="text-xs">0-3 points</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Measures atmospheric stability in arcseconds. Lower values mean sharper planetary views.
                    </p>
                    <Table className="mt-2">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[120px]">Arcseconds</TableHead>
                          <TableHead>Score</TableHead>
                          <TableHead>Description</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow><TableCell>≤1.2"</TableCell><TableCell className="font-medium text-green-600 dark:text-green-400">3</TableCell><TableCell>Excellent - planetary detail visible</TableCell></TableRow>
                        <TableRow><TableCell>1.3-1.7"</TableCell><TableCell className="font-medium text-emerald-600 dark:text-emerald-400">2</TableCell><TableCell>Good - steady images</TableCell></TableRow>
                        <TableRow><TableCell>1.8-2.2"</TableCell><TableCell className="font-medium text-yellow-600 dark:text-yellow-400">1</TableCell><TableCell>Fair - some turbulence</TableCell></TableRow>
                        <TableRow><TableCell>&gt;2.2"</TableCell><TableCell className="font-medium text-red-600 dark:text-red-400">0</TableCell><TableCell>Poor - images shimmer</TableCell></TableRow>
                      </TableBody>
                    </Table>
                    <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                      <Info className="w-3 h-3" />
                      Source: Calculated from boundary layer stability and wind shear
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                  <Wind className="w-5 h-5 text-cyan-500 mt-0.5" />
                  <div className="flex-1">
                    <div className="font-medium flex items-center gap-2">
                      Jet Stream Score
                      <Badge variant="outline" className="text-xs">0-2 points</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Index from 1-100 measuring high-altitude turbulence. Lower values mean calmer skies.
                    </p>
                    <Table className="mt-2">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[120px]">Index</TableHead>
                          <TableHead>Score</TableHead>
                          <TableHead>Description</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow><TableCell>≤25</TableCell><TableCell className="font-medium text-green-600 dark:text-green-400">2</TableCell><TableCell>Calm - minimal disturbance</TableCell></TableRow>
                        <TableRow><TableCell>26-40</TableCell><TableCell className="font-medium text-yellow-600 dark:text-yellow-400">1</TableCell><TableCell>Moderate - some disturbance</TableCell></TableRow>
                        <TableRow><TableCell>&gt;40</TableCell><TableCell className="font-medium text-red-600 dark:text-red-400">0</TableCell><TableCell>Turbulent - poor for high power</TableCell></TableRow>
                      </TableBody>
                    </Table>
                    <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                      <Info className="w-3 h-3" />
                      Source: Derived from upper atmosphere wind speeds
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                  <Droplets className="w-5 h-5 text-blue-400 mt-0.5" />
                  <div className="flex-1">
                    <div className="font-medium flex items-center gap-2">
                      Humidity Penalty
                      <Badge variant="outline" className="text-xs">0 to -1 points</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      High humidity causes dew formation on optics and reduces contrast.
                    </p>
                    <Table className="mt-2">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[120px]">Humidity</TableHead>
                          <TableHead>Penalty</TableHead>
                          <TableHead>Description</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow><TableCell>&lt;80%</TableCell><TableCell className="font-medium text-green-600 dark:text-green-400">0</TableCell><TableCell>No impact</TableCell></TableRow>
                        <TableRow><TableCell>80-89%</TableCell><TableCell className="font-medium text-yellow-600 dark:text-yellow-400">-0.5</TableCell><TableCell>Dew risk, use heaters</TableCell></TableRow>
                        <TableRow><TableCell>≥90%</TableCell><TableCell className="font-medium text-red-600 dark:text-red-400">-1</TableCell><TableCell>High dew risk, poor transparency</TableCell></TableRow>
                      </TableBody>
                    </Table>
                    <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                      <Info className="w-3 h-3" />
                      Source: Open-Meteo relative humidity forecast
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                  <Moon className="w-5 h-5 text-amber-500 mt-0.5" />
                  <div className="flex-1">
                    <div className="font-medium flex items-center gap-2">
                      Moon DSO Score
                      <Badge variant="outline" className="text-xs">0-2 points</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Measures moon's impact on deep sky object visibility based on illumination.
                    </p>
                    <Table className="mt-2">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[120px]">Illumination</TableHead>
                          <TableHead>Score</TableHead>
                          <TableHead>Description</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow><TableCell>≤40%</TableCell><TableCell className="font-medium text-green-600 dark:text-green-400">2</TableCell><TableCell>Minimal impact - great for DSOs</TableCell></TableRow>
                        <TableRow><TableCell>41-70%</TableCell><TableCell className="font-medium text-yellow-600 dark:text-yellow-400">1</TableCell><TableCell>Moderate - stick to brighter DSOs</TableCell></TableRow>
                        <TableRow><TableCell>&gt;70%</TableCell><TableCell className="font-medium text-red-600 dark:text-red-400">0</TableCell><TableCell>High impact - focus on planets</TableCell></TableRow>
                      </TableBody>
                    </Table>
                    <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                      <Info className="w-3 h-3" />
                      Source: Calculated using astronomy-engine library
                    </p>
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <h4 className="font-semibold">Composite Scores</h4>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="p-3 rounded-lg border">
                      <div className="font-medium flex items-center gap-2">
                        Total Score
                        <Badge>0-10</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Cloud + Seeing + Jet + Humidity + Moon DSO
                      </p>
                    </div>
                    <div className="p-3 rounded-lg border">
                      <div className="font-medium flex items-center gap-2">
                        Planet Score
                        <Badge>0-5</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Seeing + Jet Stream (planets less affected by moon)
                      </p>
                    </div>
                    <div className="p-3 rounded-lg border">
                      <div className="font-medium flex items-center gap-2">
                        DSO Score
                        <Badge>0-7</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Cloud + Moon + Humidity + Bortle bonus
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="power-class" className="border rounded-lg px-4">
            <AccordionTrigger className="hover:no-underline" data-testid="accordion-power-class">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-primary/10">
                  <Zap className="w-5 h-5 text-primary" />
                </div>
                <div className="text-left">
                  <div className="font-semibold">Night Power Class</div>
                  <div className="text-sm text-muted-foreground font-normal">Equipment magnification strategy</div>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4 space-y-4">
              <p className="text-sm text-muted-foreground">
                Power Class determines the optimal magnification range for your equipment based on current atmospheric conditions.
              </p>

              <div className="space-y-3">
                <div className="flex items-start gap-3 p-4 rounded-lg border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/30">
                  <Badge className="bg-green-600 hover:bg-green-600">HIGH</Badge>
                  <div className="flex-1">
                    <p className="text-sm font-medium">Conditions for HIGH power</p>
                    <ul className="text-sm text-muted-foreground mt-1 space-y-1 list-disc list-inside">
                      <li>Seeing ≤1.2 arcseconds</li>
                      <li>Jet stream index ≤25</li>
                      <li>Cloud cover ≤30%</li>
                      <li>Humidity ≤80%</li>
                    </ul>
                    <p className="text-xs text-muted-foreground mt-2 italic">
                      All conditions must be met. Use higher magnifications (smaller exit pupil ~1.5mm). Barlows recommended.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-4 rounded-lg border border-yellow-200 dark:border-yellow-900 bg-yellow-50 dark:bg-yellow-950/30">
                  <Badge className="bg-yellow-600 hover:bg-yellow-600">MID</Badge>
                  <div className="flex-1">
                    <p className="text-sm font-medium">Conditions for MID power</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Neither HIGH nor LOW thresholds met. Standard magnification ranges apply.
                    </p>
                    <p className="text-xs text-muted-foreground mt-2 italic">
                      Use balanced exit pupils (2-4mm). Works well for most objects.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-4 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30">
                  <Badge className="bg-red-600 hover:bg-red-600">LOW</Badge>
                  <div className="flex-1">
                    <p className="text-sm font-medium">Conditions for LOW power</p>
                    <ul className="text-sm text-muted-foreground mt-1 space-y-1 list-disc list-inside">
                      <li>Seeing &gt;1.7 arcseconds, OR</li>
                      <li>Jet stream index &gt;40, OR</li>
                      <li>Cloud cover &gt;50%, OR</li>
                      <li>Humidity &gt;85%</li>
                    </ul>
                    <p className="text-xs text-muted-foreground mt-2 italic">
                      Any condition triggers LOW. Use lower magnifications (larger exit pupil ≥3mm). Skip barlows.
                    </p>
                  </div>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="bortle" className="border rounded-lg px-4">
            <AccordionTrigger className="hover:no-underline" data-testid="accordion-bortle">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-primary/10">
                  <MapPin className="w-5 h-5 text-primary" />
                </div>
                <div className="text-left">
                  <div className="font-semibold">Bortle Dark Sky Scale</div>
                  <div className="text-sm text-muted-foreground font-normal">Light pollution classification</div>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4 space-y-4">
              <p className="text-sm text-muted-foreground">
                The Bortle scale measures night sky brightness at your observing location. Lower numbers mean darker skies and better deep sky object visibility.
              </p>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px]">Class</TableHead>
                    <TableHead>Label</TableHead>
                    <TableHead>What You Can See</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell><Badge variant="outline" className="bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">1</Badge></TableCell>
                    <TableCell className="font-medium">Excellent Dark</TableCell>
                    <TableCell className="text-sm text-muted-foreground">Zodiacal light, gegenschein visible. Best possible skies.</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell><Badge variant="outline" className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">2</Badge></TableCell>
                    <TableCell className="font-medium">Typical Dark</TableCell>
                    <TableCell className="text-sm text-muted-foreground">Airglow visible, M33 easy naked eye. Excellent for DSOs.</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell><Badge variant="outline" className="bg-green-500/20 text-green-700 dark:text-green-300">3</Badge></TableCell>
                    <TableCell className="font-medium">Rural</TableCell>
                    <TableCell className="text-sm text-muted-foreground">Some light pollution on horizon. Great for most DSOs.</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell><Badge variant="outline" className="bg-yellow-500/20 text-yellow-700 dark:text-yellow-300">4</Badge></TableCell>
                    <TableCell className="font-medium">Rural/Suburban</TableCell>
                    <TableCell className="text-sm text-muted-foreground">Light domes visible in several directions. Good for brighter DSOs.</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell><Badge variant="outline" className="bg-yellow-500/15 text-yellow-700 dark:text-yellow-300">5</Badge></TableCell>
                    <TableCell className="font-medium">Suburban</TableCell>
                    <TableCell className="text-sm text-muted-foreground">Milky Way faint overhead. M31, M13 still visible.</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell><Badge variant="outline" className="bg-orange-500/20 text-orange-700 dark:text-orange-300">6</Badge></TableCell>
                    <TableCell className="font-medium">Bright Suburban</TableCell>
                    <TableCell className="text-sm text-muted-foreground">Milky Way invisible. Only bright Messier objects visible.</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell><Badge variant="outline" className="bg-orange-500/15 text-orange-700 dark:text-orange-300">7</Badge></TableCell>
                    <TableCell className="font-medium">Suburban/Urban</TableCell>
                    <TableCell className="text-sm text-muted-foreground">M31 barely visible. Focus on planets, Moon, doubles.</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell><Badge variant="outline" className="bg-red-500/20 text-red-700 dark:text-red-300">8</Badge></TableCell>
                    <TableCell className="font-medium">City Sky</TableCell>
                    <TableCell className="text-sm text-muted-foreground">M44, M31 invisible to naked eye. Planets and Moon only.</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell><Badge variant="outline" className="bg-red-500/15 text-red-700 dark:text-red-300">9</Badge></TableCell>
                    <TableCell className="font-medium">Inner City</TableCell>
                    <TableCell className="text-sm text-muted-foreground">Only Moon, planets, and brightest stars visible.</TableCell>
                  </TableRow>
                </TableBody>
              </Table>

              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Info className="w-3 h-3" />
                User input: You set this value when adding an observing location. Use a light pollution map to determine your local Bortle class.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="sky-tonight" className="border rounded-lg px-4">
            <AccordionTrigger className="hover:no-underline" data-testid="accordion-sky-tonight">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-primary/10">
                  <Sun className="w-5 h-5 text-primary" />
                </div>
                <div className="text-left">
                  <div className="font-semibold">Sky Tonight Calculations</div>
                  <div className="text-sm text-muted-foreground font-normal">Rise, transit, set times and altitude</div>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4 space-y-4">
              <p className="text-sm text-muted-foreground">
                Object visibility is calculated using spherical astronomy formulas with your location coordinates and current date/time.
              </p>

              <div className="space-y-3">
                <div className="p-3 rounded-lg border">
                  <div className="font-medium">Altitude</div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Height above horizon in degrees (0° = horizon, 90° = zenith). Objects are best viewed when highest.
                  </p>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    <Badge variant="outline" className="text-green-600 dark:text-green-400">&gt;60° Excellent</Badge>
                    <Badge variant="outline" className="text-emerald-600 dark:text-emerald-400">40-60° Good</Badge>
                    <Badge variant="outline" className="text-yellow-600 dark:text-yellow-400">25-40° Fair</Badge>
                    <Badge variant="outline" className="text-red-600 dark:text-red-400">&lt;25° Poor</Badge>
                  </div>
                </div>

                <div className="p-3 rounded-lg border">
                  <div className="font-medium">Azimuth</div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Compass direction in degrees. N=0°, E=90°, S=180°, W=270°.
                  </p>
                </div>

                <div className="p-3 rounded-lg border">
                  <div className="font-medium">Rise / Transit / Set Times</div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Rise = object crosses eastern horizon. Transit = highest point (meridian crossing). Set = crosses western horizon.
                  </p>
                </div>

                <div className="p-3 rounded-lg border">
                  <div className="font-medium">Circumpolar Objects</div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Objects that never set below your horizon. Depends on your latitude and the object's declination.
                  </p>
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <h4 className="font-semibold flex items-center gap-2">
                  <Filter className="w-4 h-4" />
                  Sky Tonight Filters
                </h4>
                <div className="grid gap-3">
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                    <Sparkles className="w-5 h-5 text-amber-500 mt-0.5" />
                    <div>
                      <div className="font-medium">Wow Filter</div>
                      <p className="text-sm text-muted-foreground">
                        Shows only "must-see" impressive targets: planets, famous Messier objects (M42, M31, M45), 
                        and showpiece NGC objects. These are pre-marked in the catalog.
                      </p>
                      <p className="text-xs text-muted-foreground mt-1 italic">
                        Input: Hardcoded isHot field in celestial objects database
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                    <Target className="w-5 h-5 text-blue-500 mt-0.5" />
                    <div>
                      <div className="font-medium">Best Tonight Filter</div>
                      <p className="text-sm text-muted-foreground">
                        Shows objects recommended by the scoring algorithm based on visibility, moon phase, 
                        logged conditions, equipment match, observation freshness, and seasonality.
                      </p>
                      <p className="text-xs text-muted-foreground mt-1 italic">
                        Input: Dynamic - calculated from location, date, conditions, and equipment
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                    <Eye className="w-5 h-5 text-green-500 mt-0.5" />
                    <div>
                      <div className="font-medium">Good Visibility Filter</div>
                      <p className="text-sm text-muted-foreground">
                        Shows objects currently above 25° altitude AND whose difficulty is NOT "challenging" 
                        or "difficult" for your location's Bortle scale.
                      </p>
                      <p className="text-xs text-muted-foreground mt-1 italic">
                        Input: Real-time altitude calculation + Bortle difficulty assessment
                      </p>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Multiple filters use AND logic - enabling all three shows only objects matching all criteria.
                </p>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="recommendations" className="border rounded-lg px-4">
            <AccordionTrigger className="hover:no-underline" data-testid="accordion-recommendations">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-primary/10">
                  <Calculator className="w-5 h-5 text-primary" />
                </div>
                <div className="text-left">
                  <div className="font-semibold">Recommendation Scoring</div>
                  <div className="text-sm text-muted-foreground font-normal">How "Best for Tonight" objects are ranked</div>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4 space-y-4">
              <p className="text-sm text-muted-foreground">
                Each object receives a weighted score from 0-100 combining multiple factors. Higher scores appear first in recommendations.
              </p>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Factor</TableHead>
                    <TableHead className="w-[80px]">Weight</TableHead>
                    <TableHead>Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">Visibility</TableCell>
                    <TableCell><Badge>30%</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground">Based on maximum altitude tonight. Below 20° heavily penalized.</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Conditions</TableCell>
                    <TableCell><Badge>20%</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground">Match with logged night conditions (if any).</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Equipment</TableCell>
                    <TableCell><Badge>15%</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground">Suitability based on object magnitude and your telescope aperture.</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Moon</TableCell>
                    <TableCell><Badge>15%</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground">Moon separation and illumination impact. Planets less affected.</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Freshness</TableCell>
                    <TableCell><Badge>10%</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground">Penalizes recently observed objects to encourage variety.</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Seasonal</TableCell>
                    <TableCell><Badge>10%</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground">Bonus for objects in their best viewing months.</TableCell>
                  </TableRow>
                </TableBody>
              </Table>

              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Info className="w-3 h-3" />
                Inputs: Location coordinates, current date, logged conditions, equipment inventory, observation history
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="equipment" className="border rounded-lg px-4">
            <AccordionTrigger className="hover:no-underline" data-testid="accordion-equipment">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-primary/10">
                  <Telescope className="w-5 h-5 text-primary" />
                </div>
                <div className="text-left">
                  <div className="font-semibold">Equipment Recommendations</div>
                  <div className="text-sm text-muted-foreground font-normal">Eyepiece, filter, and imaging suggestions</div>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4 space-y-4">
              <p className="text-sm text-muted-foreground">
                Equipment suggestions are generated based on your inventory, target object type, and current night conditions.
              </p>

              <div className="space-y-4">
                <div className="p-3 rounded-lg border">
                  <div className="font-medium flex items-center gap-2">
                    <Eye className="w-4 h-4" />
                    Eyepiece Selection
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Recommends eyepiece/barlow combinations to achieve optimal exit pupil for each object type:
                  </p>
                  <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
                    <div className="p-2 rounded bg-muted/50">
                      <span className="font-medium">Planets:</span>
                      <span className="text-muted-foreground"> 0.5-2mm exit pupil</span>
                    </div>
                    <div className="p-2 rounded bg-muted/50">
                      <span className="font-medium">Globulars:</span>
                      <span className="text-muted-foreground"> 1-3mm exit pupil</span>
                    </div>
                    <div className="p-2 rounded bg-muted/50">
                      <span className="font-medium">Galaxies:</span>
                      <span className="text-muted-foreground"> 2-4mm exit pupil</span>
                    </div>
                    <div className="p-2 rounded bg-muted/50">
                      <span className="font-medium">Nebulae:</span>
                      <span className="text-muted-foreground"> 3-5mm exit pupil</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Exit Pupil = Aperture ÷ Magnification. Adjusted by Night Power Class.
                  </p>
                </div>

                <div className="p-3 rounded-lg border">
                  <div className="font-medium flex items-center gap-2">
                    <Filter className="w-4 h-4" />
                    Filter Recommendations
                  </div>
                  <div className="text-sm text-muted-foreground mt-1 space-y-2">
                    <p><span className="font-medium">UHC:</span> Recommended for emission nebulae, useful for planetaries</p>
                    <p><span className="font-medium">OIII:</span> Best for planetary nebulae and some supernova remnants</p>
                    <p><span className="font-medium">H-Alpha:</span> For narrowband imaging of emission regions</p>
                    <p className="text-xs italic">Filters checked against your inventory. Shows "owned" vs "suggested".</p>
                  </div>
                </div>

                <div className="p-3 rounded-lg border">
                  <div className="font-medium flex items-center gap-2">
                    <Camera className="w-4 h-4" />
                    Imaging Feasibility
                  </div>
                  <div className="text-sm text-muted-foreground mt-1 space-y-2">
                    <p><span className="font-medium">Yes:</span> Good conditions for imaging this target</p>
                    <p><span className="font-medium">Borderline:</span> Possible but challenging</p>
                    <p><span className="font-medium">No:</span> Conditions too poor for quality images</p>
                    <p className="text-xs italic">Based on planet/DSO score, Bortle scale, and object brightness.</p>
                  </div>
                </div>
              </div>

              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Info className="w-3 h-3" />
                Inputs: Your equipment inventory (telescopes, eyepieces, barlows, filters), target object, night conditions
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="astrophotography" className="border rounded-lg px-4">
            <AccordionTrigger className="hover:no-underline" data-testid="accordion-astrophotography">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-primary/10">
                  <Camera className="w-5 h-5 text-primary" />
                </div>
                <div className="text-left">
                  <div className="font-semibold">Astrophotography Guide</div>
                  <div className="text-sm text-muted-foreground font-normal">Camera settings by object category</div>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4 space-y-6">
              <p className="text-sm text-muted-foreground">
                Recommended camera settings for different types of celestial objects. These are starting points - adjust based on your specific equipment and conditions.
              </p>

              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 rounded-lg border">
                  <div className="p-2 rounded-md bg-amber-500/10">
                    <Star className="w-5 h-5 text-amber-500" />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium mb-2">Planets</div>
                    <p className="text-sm text-muted-foreground mb-3">
                      Planets require high magnification and short exposures. Use video capture and stack thousands of frames.
                    </p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="p-2 rounded bg-muted/50">
                        <span className="font-medium">Exposure:</span>
                        <span className="text-muted-foreground"> 1-50ms (video)</span>
                      </div>
                      <div className="p-2 rounded bg-muted/50">
                        <span className="font-medium">Gain:</span>
                        <span className="text-muted-foreground"> 50-150 (moderate)</span>
                      </div>
                      <div className="p-2 rounded bg-muted/50">
                        <span className="font-medium">Capture:</span>
                        <span className="text-muted-foreground"> 2-5 min video</span>
                      </div>
                      <div className="p-2 rounded bg-muted/50">
                        <span className="font-medium">Histogram:</span>
                        <span className="text-muted-foreground"> 50-70%</span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2 italic">
                      Stack in AutoStakkert!, RegiStax, or PIPP. Best 10-30% of frames.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-4 rounded-lg border">
                  <div className="p-2 rounded-md bg-slate-400/10">
                    <Moon className="w-5 h-5 text-slate-400" />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium mb-2">Moon</div>
                    <p className="text-sm text-muted-foreground mb-3">
                      The Moon is very bright - use short exposures. Mosaics can capture the entire disk at high resolution.
                    </p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="p-2 rounded bg-muted/50">
                        <span className="font-medium">Exposure:</span>
                        <span className="text-muted-foreground"> 1-10ms</span>
                      </div>
                      <div className="p-2 rounded bg-muted/50">
                        <span className="font-medium">Gain/ISO:</span>
                        <span className="text-muted-foreground"> Low (0-50)</span>
                      </div>
                      <div className="p-2 rounded bg-muted/50">
                        <span className="font-medium">Histogram:</span>
                        <span className="text-muted-foreground"> 60-80%</span>
                      </div>
                      <div className="p-2 rounded bg-muted/50">
                        <span className="font-medium">Best phase:</span>
                        <span className="text-muted-foreground"> Quarter moon for shadows</span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2 italic">
                      Terminator (day/night line) shows best crater detail. Stack 50-500 frames.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-4 rounded-lg border">
                  <div className="p-2 rounded-md bg-pink-500/10">
                    <Cloud className="w-5 h-5 text-pink-500" />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium mb-2">Bright Nebulae (M42, M8, M17)</div>
                    <p className="text-sm text-muted-foreground mb-3">
                      Emission nebulae benefit from longer exposures and narrowband filters if available.
                    </p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="p-2 rounded bg-muted/50">
                        <span className="font-medium">Exposure:</span>
                        <span className="text-muted-foreground"> 30s - 5min</span>
                      </div>
                      <div className="p-2 rounded bg-muted/50">
                        <span className="font-medium">ISO/Gain:</span>
                        <span className="text-muted-foreground"> 800-1600</span>
                      </div>
                      <div className="p-2 rounded bg-muted/50">
                        <span className="font-medium">Total time:</span>
                        <span className="text-muted-foreground"> 30-60+ minutes</span>
                      </div>
                      <div className="p-2 rounded bg-muted/50">
                        <span className="font-medium">Filters:</span>
                        <span className="text-muted-foreground"> UHC, OIII helpful</span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2 italic">
                      Stack 20-60+ subs. Use calibration frames (darks, flats, bias) for best results.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-4 rounded-lg border">
                  <div className="p-2 rounded-md bg-purple-500/10">
                    <Target className="w-5 h-5 text-purple-500" />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium mb-2">Galaxies (M31, M51, M81)</div>
                    <p className="text-sm text-muted-foreground mb-3">
                      Galaxies are faint and require long total exposure times and dark skies.
                    </p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="p-2 rounded bg-muted/50">
                        <span className="font-medium">Exposure:</span>
                        <span className="text-muted-foreground"> 2-10 min per sub</span>
                      </div>
                      <div className="p-2 rounded bg-muted/50">
                        <span className="font-medium">ISO/Gain:</span>
                        <span className="text-muted-foreground"> 1600-3200</span>
                      </div>
                      <div className="p-2 rounded bg-muted/50">
                        <span className="font-medium">Total time:</span>
                        <span className="text-muted-foreground"> 2-10+ hours</span>
                      </div>
                      <div className="p-2 rounded bg-muted/50">
                        <span className="font-medium">Key:</span>
                        <span className="text-muted-foreground"> Dark skies essential</span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2 italic">
                      Tracking mount required. Multiple nights of data often needed for faint targets.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-4 rounded-lg border">
                  <div className="p-2 rounded-md bg-blue-500/10">
                    <Sparkles className="w-5 h-5 text-blue-500" />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium mb-2">Star Clusters (M13, M45, M35)</div>
                    <p className="text-sm text-muted-foreground mb-3">
                      Clusters need balanced exposures to show faint stars without burning out bright ones.
                    </p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="p-2 rounded bg-muted/50">
                        <span className="font-medium">Exposure:</span>
                        <span className="text-muted-foreground"> 30s - 3 min</span>
                      </div>
                      <div className="p-2 rounded bg-muted/50">
                        <span className="font-medium">ISO/Gain:</span>
                        <span className="text-muted-foreground"> 400-1600</span>
                      </div>
                      <div className="p-2 rounded bg-muted/50">
                        <span className="font-medium">Tip:</span>
                        <span className="text-muted-foreground"> HDR for wide dynamic range</span>
                      </div>
                      <div className="p-2 rounded bg-muted/50">
                        <span className="font-medium">Focus:</span>
                        <span className="text-muted-foreground"> Critical for tight stars</span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2 italic">
                      Globulars need more magnification. Open clusters often fit well at lower focal lengths.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-4 rounded-lg border">
                  <div className="p-2 rounded-md bg-emerald-500/10">
                    <Eye className="w-5 h-5 text-emerald-500" />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium mb-2">Planetary Nebulae (M57, M27)</div>
                    <p className="text-sm text-muted-foreground mb-3">
                      Small and often bright - moderate exposure with good seeing conditions.
                    </p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="p-2 rounded bg-muted/50">
                        <span className="font-medium">Exposure:</span>
                        <span className="text-muted-foreground"> 30s - 2 min</span>
                      </div>
                      <div className="p-2 rounded bg-muted/50">
                        <span className="font-medium">ISO/Gain:</span>
                        <span className="text-muted-foreground"> 800-1600</span>
                      </div>
                      <div className="p-2 rounded bg-muted/50">
                        <span className="font-medium">Filters:</span>
                        <span className="text-muted-foreground"> OIII excellent</span>
                      </div>
                      <div className="p-2 rounded bg-muted/50">
                        <span className="font-medium">Magnification:</span>
                        <span className="text-muted-foreground"> High for detail</span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2 italic">
                      Many planetaries are small. Use higher focal lengths or barlow to increase image scale.
                    </p>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="p-3 rounded-lg border bg-muted/30">
                <h4 className="font-semibold mb-2">General Tips</h4>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                  <li>Always focus carefully before starting - use a Bahtinov mask or live view zoom</li>
                  <li>Take calibration frames: darks (same exposure, covered), flats (even illumination), bias (shortest exposure)</li>
                  <li>Keep your histogram to the right (ETTR) but avoid clipping highlights</li>
                  <li>Cool your camera if possible to reduce thermal noise</li>
                  <li>More data is almost always better - aim for high total integration time</li>
                  <li>Process with dedicated software: PixInsight, Siril, DeepSkyStacker, or Astro Pixel Processor</li>
                </ul>
              </div>

              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Info className="w-3 h-3" />
                Settings are guidelines only - actual values depend on your camera, telescope, and sky conditions
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="gamification" className="border rounded-lg px-4">
            <AccordionTrigger className="hover:no-underline" data-testid="accordion-gamification">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-primary/10">
                  <Trophy className="w-5 h-5 text-primary" />
                </div>
                <div className="text-left">
                  <div className="font-semibold">Achievements & Leveling</div>
                  <div className="text-sm text-muted-foreground font-normal">XP, badges, and astronomer ranks</div>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4 space-y-4">
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold mb-2">XP Leveling System</h4>
                  <p className="text-sm text-muted-foreground mb-3">
                    Earn XP by unlocking badges. Progress through 20 astronomer ranks.
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                    <div className="p-2 rounded bg-muted/50">
                      <span className="font-medium">Lv 1:</span> <span className="text-muted-foreground">0 XP</span>
                      <p className="text-xs text-muted-foreground">Novice Stargazer</p>
                    </div>
                    <div className="p-2 rounded bg-muted/50">
                      <span className="font-medium">Lv 5:</span> <span className="text-muted-foreground">500 XP</span>
                      <p className="text-xs text-muted-foreground">Telescope Apprentice</p>
                    </div>
                    <div className="p-2 rounded bg-muted/50">
                      <span className="font-medium">Lv 10:</span> <span className="text-muted-foreground">2,300 XP</span>
                      <p className="text-xs text-muted-foreground">Celestial Cartographer</p>
                    </div>
                    <div className="p-2 rounded bg-muted/50">
                      <span className="font-medium">Lv 20:</span> <span className="text-muted-foreground">14,300+ XP</span>
                      <p className="text-xs text-muted-foreground">Master Astronomer</p>
                    </div>
                  </div>
                </div>

                <Separator />

                <div>
                  <h4 className="font-semibold mb-2">Badge Categories</h4>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="p-2 rounded bg-muted/50 text-sm">
                      <span className="font-medium">Observation Count:</span>
                      <span className="text-muted-foreground"> First observation, 10, 50, 100+ observations</span>
                    </div>
                    <div className="p-2 rounded bg-muted/50 text-sm">
                      <span className="font-medium">Object Types:</span>
                      <span className="text-muted-foreground"> First planet, galaxy, nebula, cluster observed</span>
                    </div>
                    <div className="p-2 rounded bg-muted/50 text-sm">
                      <span className="font-medium">Catalog Completion:</span>
                      <span className="text-muted-foreground"> Messier progress (10, 50, 110 objects)</span>
                    </div>
                    <div className="p-2 rounded bg-muted/50 text-sm">
                      <span className="font-medium">Imaging:</span>
                      <span className="text-muted-foreground"> First photo, 10 photos, 50+ photos</span>
                    </div>
                    <div className="p-2 rounded bg-muted/50 text-sm">
                      <span className="font-medium">Conditions:</span>
                      <span className="text-muted-foreground"> Observing in poor weather, excellent nights</span>
                    </div>
                    <div className="p-2 rounded bg-muted/50 text-sm">
                      <span className="font-medium">Streaks:</span>
                      <span className="text-muted-foreground"> Consecutive observing nights</span>
                    </div>
                    <div className="p-2 rounded bg-muted/50 text-sm">
                      <span className="font-medium">Special:</span>
                      <span className="text-muted-foreground"> Celestial events, eclipses, conjunctions</span>
                    </div>
                    <div className="p-2 rounded bg-muted/50 text-sm">
                      <span className="font-medium">Equipment:</span>
                      <span className="text-muted-foreground"> Using different gear types</span>
                    </div>
                  </div>
                </div>

                <Separator />

                <div>
                  <h4 className="font-semibold mb-2">Badge Tiers & XP</h4>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="bg-amber-700/20 text-amber-700 dark:text-amber-400">Bronze: 10 XP</Badge>
                    <Badge variant="outline" className="bg-slate-400/20 text-slate-600 dark:text-slate-300">Silver: 25 XP</Badge>
                    <Badge variant="outline" className="bg-yellow-500/20 text-yellow-700 dark:text-yellow-400">Gold: 50 XP</Badge>
                    <Badge variant="outline" className="bg-cyan-500/20 text-cyan-700 dark:text-cyan-400">Platinum: 100 XP</Badge>
                    <Badge variant="outline" className="bg-purple-500/20 text-purple-700 dark:text-purple-400">Special: 200 XP</Badge>
                  </div>
                </div>
              </div>

              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Info className="w-3 h-3" />
                Inputs: Your observation history, photos uploaded, objects observed, equipment used
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="ephemeris" className="border rounded-lg px-4">
            <AccordionTrigger className="hover:no-underline" data-testid="accordion-ephemeris">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-primary/10">
                  <Star className="w-5 h-5 text-primary" />
                </div>
                <div className="text-left">
                  <div className="font-semibold">Real-Time Ephemeris</div>
                  <div className="text-sm text-muted-foreground font-normal">Planetary and lunar calculations</div>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4 space-y-4">
              <p className="text-sm text-muted-foreground">
                Solar system objects (planets, Moon) have positions calculated in real-time using the astronomy-engine library.
              </p>

              <div className="space-y-3">
                <div className="p-3 rounded-lg border">
                  <div className="font-medium">Tracked Bodies</div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <Badge variant="outline">Sun</Badge>
                    <Badge variant="outline">Moon</Badge>
                    <Badge variant="outline">Mercury</Badge>
                    <Badge variant="outline">Venus</Badge>
                    <Badge variant="outline">Mars</Badge>
                    <Badge variant="outline">Jupiter</Badge>
                    <Badge variant="outline">Saturn</Badge>
                    <Badge variant="outline">Uranus</Badge>
                    <Badge variant="outline">Neptune</Badge>
                  </div>
                </div>

                <div className="p-3 rounded-lg border">
                  <div className="font-medium">Calculated Properties</div>
                  <ul className="text-sm text-muted-foreground mt-1 space-y-1 list-disc list-inside">
                    <li>Right Ascension / Declination (J2000 coordinates)</li>
                    <li>Altitude / Azimuth (from your location)</li>
                    <li>Rise, Transit, Set times</li>
                    <li>Elongation from Sun (for planets)</li>
                    <li>Moon phase and illumination percentage</li>
                  </ul>
                </div>

                <div className="p-3 rounded-lg border">
                  <div className="font-medium">Twilight Phases</div>
                  <div className="text-sm text-muted-foreground mt-1 space-y-1">
                    <p><span className="font-medium">Civil:</span> Sun 0° to -6° (bright, planets visible)</p>
                    <p><span className="font-medium">Nautical:</span> Sun -6° to -12° (horizon visible)</p>
                    <p><span className="font-medium">Astronomical:</span> Sun -12° to -18° (fully dark for DSOs)</p>
                  </div>
                </div>
              </div>

              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Info className="w-3 h-3" />
                Source: astronomy-engine library (high-precision VSOP87/ELP calculations)
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="object-categories" className="border rounded-lg px-4">
            <AccordionTrigger className="hover:no-underline" data-testid="accordion-categories">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-primary/10">
                  <BookOpen className="w-5 h-5 text-primary" />
                </div>
                <div className="text-left">
                  <div className="font-semibold">Object Categories</div>
                  <div className="text-sm text-muted-foreground font-normal">Celestial object types and catalog info</div>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4 space-y-4">
              <p className="text-sm text-muted-foreground">
                The catalog includes 125+ celestial objects across multiple categories.
              </p>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="p-2 rounded bg-muted/50 text-sm">
                  <span className="font-medium">Planet:</span>
                  <span className="text-muted-foreground"> Solar system planets (Mercury-Neptune)</span>
                </div>
                <div className="p-2 rounded bg-muted/50 text-sm">
                  <span className="font-medium">Moon:</span>
                  <span className="text-muted-foreground"> Earth's Moon</span>
                </div>
                <div className="p-2 rounded bg-muted/50 text-sm">
                  <span className="font-medium">Galaxy:</span>
                  <span className="text-muted-foreground"> External galaxies (M31, M51, etc.)</span>
                </div>
                <div className="p-2 rounded bg-muted/50 text-sm">
                  <span className="font-medium">Nebula:</span>
                  <span className="text-muted-foreground"> Emission, reflection, dark nebulae</span>
                </div>
                <div className="p-2 rounded bg-muted/50 text-sm">
                  <span className="font-medium">Planetary Nebula:</span>
                  <span className="text-muted-foreground"> Dying star shells (M57, M27)</span>
                </div>
                <div className="p-2 rounded bg-muted/50 text-sm">
                  <span className="font-medium">Open Cluster:</span>
                  <span className="text-muted-foreground"> Young star groups (M45 Pleiades)</span>
                </div>
                <div className="p-2 rounded bg-muted/50 text-sm">
                  <span className="font-medium">Globular Cluster:</span>
                  <span className="text-muted-foreground"> Ancient star balls (M13, M22)</span>
                </div>
                <div className="p-2 rounded bg-muted/50 text-sm">
                  <span className="font-medium">Supernova Remnant:</span>
                  <span className="text-muted-foreground"> Explosion debris (M1 Crab)</span>
                </div>
              </div>

              <Separator />

              <div>
                <h4 className="font-semibold mb-2">Catalogs Included</h4>
                <div className="space-y-2 text-sm">
                  <p><span className="font-medium">Messier (M):</span> All 110 objects - galaxies, nebulae, clusters</p>
                  <p><span className="font-medium">NGC:</span> Select bright objects from the New General Catalogue</p>
                  <p><span className="font-medium">Solar System:</span> Sun, Moon, and 8 planets</p>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  "Wow" Objects
                </h4>
                <p className="text-sm text-muted-foreground">
                  35 pre-selected impressive targets for beginners and public outreach. Includes all planets, 
                  famous Messier objects (Orion Nebula M42, Andromeda Galaxy M31, Pleiades M45, Ring Nebula M57), 
                  and select NGC showpieces. Marked with a sparkle icon throughout the app.
                </p>
              </div>
            </AccordionContent>
          </AccordionItem>

        </Accordion>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5" />
              Recalculate Statistics
            </CardTitle>
            <CardDescription>Sync your stats and Messier progress with your actual observation history</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              If you've deleted observations or sessions, your statistics might be out of sync. 
              This will recalculate all counts from your current observation log. 
              <strong className="text-foreground"> Your earned badges will be preserved.</strong>
            </p>
            
            <AlertDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <AlertDialogTrigger asChild>
                <Button 
                  variant="outline" 
                  data-testid="button-reset-achievements"
                  disabled={resetMutation.isPending}
                >
                  {resetMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Recalculating...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Recalculate Statistics
                    </>
                  )}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Recalculate Statistics?</AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <span className="block">This will recalculate your statistics and Messier progress based on your current observation history:</span>
                      <ul className="list-disc list-inside space-y-1">
                        <li>Total observations count</li>
                        <li>Object category counts (galaxies, nebulae, etc.)</li>
                        <li>Messier marathon progress</li>
                        <li>Photo count</li>
                      </ul>
                      <span className="block font-medium text-foreground">Your earned badges and XP will be preserved.</span>
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => resetMutation.mutate()}
                    disabled={resetMutation.isPending}
                  >
                    {resetMutation.isPending ? "Recalculating..." : "Recalculate"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="w-5 h-5" />
              Data Sources Summary
            </CardTitle>
            <CardDescription>Where calculations and values come from</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex gap-3 py-2 border-b">
                <Badge variant="outline" className="shrink-0">User Input</Badge>
                <span className="text-muted-foreground">Locations (lat/long, Bortle), equipment inventory, observation logs</span>
              </div>
              <div className="flex gap-3 py-2 border-b">
                <Badge variant="outline" className="shrink-0">Open-Meteo API</Badge>
                <span className="text-muted-foreground">Cloud cover, humidity, upper atmosphere winds (real-time forecast)</span>
              </div>
              <div className="flex gap-3 py-2 border-b">
                <Badge variant="outline" className="shrink-0">astronomy-engine</Badge>
                <span className="text-muted-foreground">Planetary positions, moon phase, rise/set times, twilight (calculated locally)</span>
              </div>
              <div className="flex gap-3 py-2 border-b">
                <Badge variant="outline" className="shrink-0">Hardcoded</Badge>
                <span className="text-muted-foreground">Scoring thresholds, XP levels, badge definitions, catalog objects</span>
              </div>
              <div className="flex gap-3 py-2">
                <Badge variant="outline" className="shrink-0">Calculated</Badge>
                <span className="text-muted-foreground">Night scores, power class, recommendations, visibility windows</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <a 
        href="https://starboardstudio.com" 
        target="_blank" 
        rel="noopener noreferrer"
        className="flex flex-col items-center justify-center py-8 mt-4 border-t hover-elevate rounded-lg transition-opacity hover:opacity-80"
        data-testid="link-starboard-studio"
      >
        <span className="text-sm text-muted-foreground mb-3">Developed by</span>
        <img 
          src={theme === "dark" ? starboardDarkLogo : starboardLightLogo}
          alt="Starboard Studio"
          className="h-10 object-contain"
        />
      </a>

      <OnboardingTutorial
        open={showTutorial}
        onOpenChange={setShowTutorial}
      />
    </ScrollArea>
  );
}
