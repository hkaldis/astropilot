import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { SessionCard } from "@/components/SessionCard";
import { EditObservationDialog } from "@/components/EditObservationDialog";
import { PhotoViewerDialog } from "@/components/PhotoViewerDialog";
import { PhotoGallery } from "@/components/PhotoGallery";
import { JournalAnalytics } from "@/components/JournalAnalytics";
import { Link, useSearch, useLocation } from "wouter";
import { 
  Plus, 
  ClipboardList, 
  Calendar, 
  ChevronRight, 
  Star, 
  Search, 
  Filter, 
  X, 
  Download, 
  FileText, 
  FileSpreadsheet, 
  Pencil,
  Trash2,
  MapPin,
  Camera,
  Eye,
  Cloud,
  Wind,
  Droplets,
  Moon,
  Telescope as TelescopeIcon,
  ArrowLeft,
  Sparkles,
  Orbit,
  Atom,
  Zap,
  Flame,
  Circle,
  Image,
  Share2,
  Rocket,
  BarChart3,
  type LucideIcon
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { exportSessionsToCSV, exportObservationsToCSV, exportToPDF } from "@/lib/export";
import { format, parseISO, isWithinInterval, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { cn } from "@/lib/utils";
import type { ObservationSession, Location, Observation, CelestialObject, Telescope, Eyepiece, Barlow, Filter as FilterType, ObservationPhoto } from "@shared/schema";

interface SessionWithDetails extends ObservationSession {
  location: Location | null;
  observations: (Observation & { object: CelestialObject })[];
}

type ObservationWithObject = Observation & { object: CelestialObject };

const categoryColors: Record<string, string> = {
  planet: "from-amber-500/20 to-amber-600/10 border-amber-500/30",
  galaxy: "from-purple-500/20 to-purple-600/10 border-purple-500/30",
  nebula: "from-pink-500/20 to-pink-600/10 border-pink-500/30",
  emission_nebula: "from-pink-500/20 to-pink-600/10 border-pink-500/30",
  planetary_nebula: "from-cyan-500/20 to-cyan-600/10 border-cyan-500/30",
  open_cluster: "from-blue-500/20 to-blue-600/10 border-blue-500/30",
  globular_cluster: "from-indigo-500/20 to-indigo-600/10 border-indigo-500/30",
  double_star: "from-cyan-500/20 to-cyan-600/10 border-cyan-500/30",
  supernova_remnant: "from-red-500/20 to-red-600/10 border-red-500/30",
  moon: "from-slate-500/20 to-slate-600/10 border-slate-500/30",
  comet: "from-teal-500/20 to-teal-600/10 border-teal-500/30",
  meteor_shower: "from-yellow-500/20 to-yellow-600/10 border-yellow-500/30",
};

const categoryIconMap: Record<string, LucideIcon> = {
  planet: Orbit,
  galaxy: Sparkles,
  nebula: Cloud,
  open_cluster: Star,
  globular_cluster: Circle,
  double_star: Zap,
  emission_nebula: Flame,
  planetary_nebula: Atom,
  supernova_remnant: Flame,
  moon: Moon,
  comet: Rocket,
  meteor_shower: Sparkles,
};

function CategoryIcon({ category, className }: { category: string; className?: string }) {
  const Icon = categoryIconMap[category] ?? Star;
  return <Icon className={cn("w-5 h-5", className)} />;
}

function ObservationPhotoThumbnail({ observationId, onClick }: { observationId: number; onClick: () => void }) {
  const { user } = useAuth();
  const { data: photos } = useQuery<ObservationPhoto[]>({
    queryKey: ['/api/observations', observationId, 'photos'],
    staleTime: 5 * 60 * 1000,
    enabled: !!user,
  });
  
  const firstPhoto = photos?.[0];
  if (!firstPhoto) return null;
  
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="w-12 h-12 rounded-xl overflow-hidden shrink-0 border border-primary/30 hover:ring-2 hover:ring-primary/50 transition-all"
      data-testid={`photo-thumbnail-${observationId}`}
    >
      <img 
        src={firstPhoto.imageUrl} 
        alt="Observation photo" 
        className="w-full h-full object-cover"
      />
    </button>
  );
}

function ScoreCircleLarge({ score, maxScore, label }: { score: number; maxScore: number; label: string }) {
  const percentage = (score / maxScore) * 100;
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;
  
  const getColor = () => {
    if (percentage >= 80) return "#34d399";
    if (percentage >= 60) return "#fbbf24";
    if (percentage >= 40) return "#f97316";
    return "#ef4444";
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-20 h-20">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
          <circle
            cx="40"
            cy="40"
            r={radius}
            stroke="currentColor"
            strokeWidth="4"
            fill="none"
            className="text-muted/20"
          />
          <circle
            cx="40"
            cy="40"
            r={radius}
            stroke={getColor()}
            strokeWidth="4"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-mono text-xl font-bold" style={{ color: getColor() }}>
            {score.toFixed(1)}
          </span>
        </div>
      </div>
      <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
        {label}
      </span>
    </div>
  );
}

function ConditionBar({ value, maxValue, label, icon: Icon, inverted = false }: {
  value: number | null | undefined;
  maxValue: number;
  label: string;
  icon: typeof Cloud;
  inverted?: boolean;
}) {
  if (value === null || value === undefined) return null;
  
  const displayPercentage = (value / maxValue) * 100;
  const qualityPercentage = inverted 
    ? ((maxValue - value) / maxValue) * 100 
    : displayPercentage;
  
  const getColor = () => {
    if (qualityPercentage >= 75) return "bg-emerald-500";
    if (qualityPercentage >= 50) return "bg-amber-500";
    if (qualityPercentage >= 25) return "bg-orange-500";
    return "bg-red-500";
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Icon className="w-3.5 h-3.5" />
          <span>{label}</span>
        </div>
        <span className="font-mono">{value}{maxValue === 100 ? "%" : `/${maxValue}`}</span>
      </div>
      <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden">
        <div 
          className={cn("h-full rounded-full transition-all", getColor())}
          style={{ width: `${displayPercentage}%` }}
        />
      </div>
    </div>
  );
}

export default function Sessions() {
  const [selectedSession, setSelectedSession] = useState<SessionWithDetails | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [editingObservation, setEditingObservation] = useState<ObservationWithObject | null>(null);
  const [viewingPhotosObservation, setViewingPhotosObservation] = useState<ObservationWithObject | null>(null);
  const [deletingObservation, setDeletingObservation] = useState<ObservationWithObject | null>(null);
  const [deletingSession, setDeletingSession] = useState<SessionWithDetails | null>(null);
  const searchString = useSearch();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: sessions, isLoading } = useQuery<SessionWithDetails[]>({
    queryKey: ["/api/sessions"],
    enabled: !!user,
  });

  const deleteObservationMutation = useMutation({
    mutationFn: async ({ observationId, sessionId }: { observationId: number; sessionId: number }) => {
      await apiRequest("DELETE", `/api/observations/${observationId}?sessionId=${sessionId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
      toast({ title: "Observation deleted successfully" });
      setDeletingObservation(null);
    },
    onError: () => {
      toast({ title: "Failed to delete observation", variant: "destructive" });
    },
  });

  const deleteSessionMutation = useMutation({
    mutationFn: async (sessionId: number) => {
      await apiRequest("DELETE", `/api/sessions/${sessionId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
      toast({ title: "Session deleted successfully" });
      setSelectedSession(null);
      setDeletingSession(null);
    },
    onError: () => {
      toast({ title: "Failed to delete session", variant: "destructive" });
    },
  });

  const [refetchAttempted, setRefetchAttempted] = useState(false);
  
  useEffect(() => {
    if (!searchString) {
      setRefetchAttempted(false);
      return;
    }
    
    const params = new URLSearchParams(searchString);
    const sessionId = params.get("id");
    if (!sessionId) {
      setRefetchAttempted(false);
      return;
    }
    
    // If sessions haven't loaded yet, wait for them
    if (!sessions) return;
    
    const session = sessions.find(s => s.id === parseInt(sessionId));
    if (session) {
      setSelectedSession(session);
      setLocation("/sessions", { replace: true });
      setRefetchAttempted(false);
    } else if (!refetchAttempted) {
      // Session not in cached list - refetch once to ensure we have latest data
      setRefetchAttempted(true);
      queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
    } else {
      // Session still not found after refetch - clear URL and show error
      setLocation("/sessions", { replace: true });
      toast({ title: "Session not found", variant: "destructive" });
      setRefetchAttempted(false);
    }
  }, [sessions, searchString, setLocation, refetchAttempted, toast]);

  const { data: locations } = useQuery<Location[]>({
    queryKey: ["/api/locations"],
    enabled: !!user,
  });

  const { data: telescopes } = useQuery<Telescope[]>({
    queryKey: ["/api/telescopes"],
    enabled: !!user,
  });

  const { data: eyepieces } = useQuery<Eyepiece[]>({
    queryKey: ["/api/eyepieces"],
    enabled: !!user,
  });

  const { data: barlows } = useQuery<Barlow[]>({
    queryKey: ["/api/barlows"],
    enabled: !!user,
  });

  const { data: filters } = useQuery<FilterType[]>({
    queryKey: ["/api/filters"],
    enabled: !!user,
  });

  const getTelescopeForObservation = (obs: ObservationWithObject) => {
    return telescopes?.find(t => t.id === obs.telescopeId) ?? null;
  };

  const getEquipmentDetails = (obs: ObservationWithObject) => {
    const telescope = telescopes?.find(t => t.id === obs.telescopeId);
    const eyepiece = eyepieces?.find(e => e.id === obs.eyepieceId);
    const barlow = barlows?.find(b => b.id === obs.barlowId);
    const filter = filters?.find(f => f.id === obs.filterId);
    return { telescope, eyepiece, barlow, filter };
  };

  useEffect(() => {
    if (selectedSession && sessions) {
      const freshSession = sessions.find(s => s.id === selectedSession.id);
      if (freshSession && JSON.stringify(freshSession) !== JSON.stringify(selectedSession)) {
        setSelectedSession(freshSession);
      }
    }
  }, [sessions, selectedSession]);

  const filteredSessions = useMemo(() => {
    if (!sessions) return [];
    
    return sessions.filter((session) => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesLocation = session.location?.name?.toLowerCase().includes(query);
        const matchesObject = session.observations?.some(
          (obs) =>
            obs.object?.name?.toLowerCase().includes(query) ||
            obs.object?.catalogId?.toLowerCase().includes(query)
        );
        const matchesNotes = session.notes?.toLowerCase().includes(query);
        
        if (!matchesLocation && !matchesObject && !matchesNotes) {
          return false;
        }
      }

      if (locationFilter !== "all" && session.locationId !== parseInt(locationFilter)) {
        return false;
      }

      if (dateFilter !== "all") {
        const sessionDate = parseISO(session.date.toString());
        const now = new Date();
        
        if (dateFilter === "thisMonth") {
          if (!isWithinInterval(sessionDate, { start: startOfMonth(now), end: endOfMonth(now) })) {
            return false;
          }
        } else if (dateFilter === "lastMonth") {
          const lastMonth = subMonths(now, 1);
          if (!isWithinInterval(sessionDate, { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) })) {
            return false;
          }
        } else if (dateFilter === "last3Months") {
          const threeMonthsAgo = subMonths(now, 3);
          if (!isWithinInterval(sessionDate, { start: startOfMonth(threeMonthsAgo), end: now })) {
            return false;
          }
        }
      }

      // Filter by object category - session must include at least one object of the selected category
      if (categoryFilter !== "all") {
        const hasCategory = session.observations?.some(
          (obs) => obs.object?.category === categoryFilter
        );
        if (!hasCategory) {
          return false;
        }
      }

      return true;
    });
  }, [sessions, searchQuery, locationFilter, dateFilter, categoryFilter]);

  const groupedSessions = useMemo(() => {
    return filteredSessions.reduce((acc, session) => {
      const month = format(parseISO(session.date.toString()), "MMMM yyyy");
      if (!acc[month]) {
        acc[month] = [];
      }
      acc[month].push(session);
      return acc;
    }, {} as Record<string, SessionWithDetails[]>);
  }, [filteredSessions]);

  const hasActiveFilters = searchQuery || locationFilter !== "all" || dateFilter !== "all" || categoryFilter !== "all";

  const clearFilters = () => {
    setSearchQuery("");
    setLocationFilter("all");
    setDateFilter("all");
    setCategoryFilter("all");
  };

  if (selectedSession) {
    const avgCloudCover = selectedSession.lowCloudPct !== null && selectedSession.midCloudPct !== null && selectedSession.highCloudPct !== null
      ? Math.round((selectedSession.lowCloudPct + selectedSession.midCloudPct + selectedSession.highCloudPct) / 3)
      : null;
    
    const observations = selectedSession.observations ?? [];
    const hasPhotos = observations.some(obs => obs.imagingDone);
    const bestRating = Math.max(...observations.map(obs => obs.visibilityRating ?? 0), 0);

    const handleShareSession = async () => {
      const shareUrl = `${window.location.origin}/sessions?id=${selectedSession.id}`;
      const shareText = `My astronomy observation session at ${selectedSession.location?.name || 'Unknown Location'} on ${format(new Date(selectedSession.date), "MMMM d, yyyy")} - ${observations.length} objects observed!`;
      
      if (navigator.share) {
        try {
          await navigator.share({
            title: 'AstroPilot Observation Session',
            text: shareText,
            url: shareUrl,
          });
        } catch (err) {
          if ((err as Error).name !== 'AbortError') {
            await navigator.clipboard.writeText(shareUrl);
            toast({ title: "Link copied to clipboard" });
          }
        }
      } else {
        await navigator.clipboard.writeText(shareUrl);
        toast({ title: "Link copied to clipboard" });
      }
    };

    return (
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="gap-2"
            onClick={() => setSelectedSession(null)}
            data-testid="button-back-to-sessions"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Star Journal
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={handleShareSession}
              data-testid="button-share-session"
            >
              <Share2 className="w-4 h-4" />
              Share
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => setDeletingSession(selectedSession)}
              data-testid="button-delete-session"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card className="overflow-hidden">
              <div className="h-2 bg-gradient-to-r from-primary via-primary/70 to-primary/40" />
              <CardHeader className="pb-4">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 text-muted-foreground mb-2">
                      <Calendar className="w-4 h-4" />
                      <span className="font-medium">
                        {format(new Date(selectedSession.date), "EEEE, MMMM d, yyyy")}
                      </span>
                    </div>
                    {selectedSession.location && (
                      <div className="flex items-center gap-3">
                        <CardTitle className="flex items-center gap-2">
                          <MapPin className="w-5 h-5 text-primary" />
                          {selectedSession.location.name}
                        </CardTitle>
                        <Badge variant="outline" className="font-mono">
                          Bortle {selectedSession.bortle}
                        </Badge>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex gap-3">
                    <ScoreCircleLarge 
                      score={selectedSession.totalScore ?? 0} 
                      maxScore={10} 
                      label="Total"
                    />
                    <ScoreCircleLarge 
                      score={selectedSession.planetScore ?? 0} 
                      maxScore={10} 
                      label="Planet"
                    />
                    <ScoreCircleLarge 
                      score={selectedSession.dsoScore ?? 0} 
                      maxScore={10} 
                      label="DSO"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex flex-wrap gap-3 mb-4">
                  <Badge variant="secondary" className="gap-1.5">
                    <Sparkles className="w-3 h-3" />
                    {observations.length} {observations.length === 1 ? "object" : "objects"} observed
                  </Badge>
                  {hasPhotos && (
                    <Badge variant="secondary" className="gap-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      <Camera className="w-3 h-3" />
                      Imaging session
                    </Badge>
                  )}
                  {bestRating >= 4 && (
                    <Badge variant="secondary" className="gap-1 bg-amber-500/10 text-amber-600 dark:text-amber-400">
                      <Star className="w-3 h-3 fill-current" />
                      Excellent views
                    </Badge>
                  )}
                </div>
                
                {selectedSession.notes && (
                  <p className="text-muted-foreground italic border-l-2 border-primary/30 pl-4">
                    "{selectedSession.notes}"
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary" />
                  Observations
                </CardTitle>
              </CardHeader>
              <CardContent>
                {observations.length > 0 ? (
                  <div className="space-y-4">
                    {observations.map((obs) => {
                      const equipment = getEquipmentDetails(obs);
                      
                      return (
                        <div
                          key={obs.id}
                          className={cn(
                            "relative p-4 rounded-xl border bg-gradient-to-br transition-all hover:shadow-md",
                            categoryColors[obs.object?.category ?? ""] ?? "from-muted/30 to-muted/10 border-border"
                          )}
                          data-testid={`observation-${obs.id}`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-4 flex-1 min-w-0">
                              {obs.imagingDone ? (
                                <ObservationPhotoThumbnail 
                                  observationId={obs.id} 
                                  onClick={() => setViewingPhotosObservation(obs)}
                                />
                              ) : (
                                <div className="w-12 h-12 rounded-xl bg-background/50 backdrop-blur flex items-center justify-center shrink-0">
                                  <CategoryIcon category={obs.object?.category ?? ""} className="w-6 h-6 text-foreground/70" />
                                </div>
                              )}
                              
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                  <span className="font-mono text-sm text-muted-foreground">
                                    {obs.object?.catalogId}
                                  </span>
                                  <span className="font-semibold text-lg">{obs.object?.name}</span>
                                </div>
                                
                                <div className="flex flex-wrap gap-2 mb-3">
                                  {obs.magnification && (
                                    <Badge variant="secondary" className="font-mono text-xs">
                                      {Math.round(obs.magnification)}x
                                    </Badge>
                                  )}
                                  {obs.exitPupil && (
                                    <Badge variant="secondary" className="font-mono text-xs">
                                      {obs.exitPupil.toFixed(1)}mm EP
                                    </Badge>
                                  )}
                                  {obs.imagingDone && (
                                    <Badge className="gap-1 bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                                      <Camera className="w-3 h-3" />
                                      Imaged
                                    </Badge>
                                  )}
                                </div>
                                
                                {obs.visibilityRating && (
                                  <div className="flex items-center gap-2 mb-2">
                                    <span className="text-xs text-muted-foreground">Visibility:</span>
                                    <div className="flex gap-0.5">
                                      {Array.from({ length: 5 }).map((_, i) => (
                                        <Star
                                          key={i}
                                          className={cn(
                                            "w-4 h-4",
                                            i < obs.visibilityRating! 
                                              ? "text-amber-500 fill-amber-500" 
                                              : "text-muted/30"
                                          )}
                                        />
                                      ))}
                                    </div>
                                  </div>
                                )}
                                
                                {(equipment.eyepiece || equipment.barlow || equipment.filter) && (
                                  <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground mb-2">
                                    {equipment.eyepiece && (
                                      <span className="bg-background/50 px-2 py-0.5 rounded">
                                        {equipment.eyepiece.name}
                                      </span>
                                    )}
                                    {equipment.barlow && (
                                      <span className="bg-background/50 px-2 py-0.5 rounded">
                                        {equipment.barlow.name}
                                      </span>
                                    )}
                                    {equipment.filter && (
                                      <span className="bg-background/50 px-2 py-0.5 rounded">
                                        {equipment.filter.name}
                                      </span>
                                    )}
                                  </div>
                                )}
                                
                                {obs.notes && (
                                  <p className="text-sm text-muted-foreground mt-2 italic">
                                    "{obs.notes}"
                                  </p>
                                )}

                                {obs.imagingDone && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="mt-3 gap-2"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setViewingPhotosObservation(obs);
                                    }}
                                    data-testid={`button-view-photos-${obs.id}`}
                                  >
                                    <Image className="w-4 h-4" />
                                    View Photos
                                  </Button>
                                )}
                              </div>
                            </div>
                            
                            <div className="flex gap-1 shrink-0">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingObservation(obs);
                                }}
                                data-testid={`button-edit-observation-${obs.id}`}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeletingObservation(obs);
                                }}
                                data-testid={`button-delete-observation-${obs.id}`}
                              >
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Sparkles className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>No observations recorded for this session</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Cloud className="w-4 h-4 text-primary" />
                  Night Conditions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <ConditionBar 
                  value={avgCloudCover} 
                  maxValue={100} 
                  label="Cloud Cover" 
                  icon={Cloud}
                  inverted
                />
                <ConditionBar 
                  value={selectedSession.lowCloudPct} 
                  maxValue={100} 
                  label="Low Clouds" 
                  icon={Cloud}
                  inverted
                />
                <ConditionBar 
                  value={selectedSession.midCloudPct} 
                  maxValue={100} 
                  label="Mid Clouds" 
                  icon={Cloud}
                  inverted
                />
                <ConditionBar 
                  value={selectedSession.highCloudPct} 
                  maxValue={100} 
                  label="High Clouds" 
                  icon={Cloud}
                  inverted
                />
                <ConditionBar 
                  value={selectedSession.seeing} 
                  maxValue={3} 
                  label="Seeing" 
                  icon={Eye}
                />
                <ConditionBar 
                  value={selectedSession.jetstream} 
                  maxValue={2} 
                  label="Jetstream" 
                  icon={Wind}
                />
                <ConditionBar 
                  value={selectedSession.humidity} 
                  maxValue={100} 
                  label="Humidity" 
                  icon={Droplets}
                  inverted
                />
                <ConditionBar 
                  value={selectedSession.moonIllumination} 
                  maxValue={100} 
                  label="Moon Illumination" 
                  icon={Moon}
                  inverted
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <TelescopeIcon className="w-4 h-4 text-primary" />
                  Session Stats
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Objects Observed</span>
                    <span className="font-mono font-medium">{observations.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Objects Imaged</span>
                    <span className="font-mono font-medium">
                      {observations.filter(o => o.imagingDone).length}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Best Visibility</span>
                    <div className="flex gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={cn(
                            "w-3 h-3",
                            i < bestRating ? "text-amber-500 fill-amber-500" : "text-muted/30"
                          )}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Bortle Class</span>
                    <span className="font-mono font-medium">{selectedSession.bortle}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <EditObservationDialog
          observation={editingObservation}
          telescope={editingObservation ? getTelescopeForObservation(editingObservation) : null}
          open={!!editingObservation}
          onOpenChange={(open) => {
            if (!open) setEditingObservation(null);
          }}
          onSaved={() => {
            const updatedSession = sessions?.find(s => s.id === selectedSession?.id);
            if (updatedSession) {
              setSelectedSession(updatedSession);
            }
          }}
        />

        {viewingPhotosObservation && (
          <PhotoViewerDialog
            observation={viewingPhotosObservation}
            open={!!viewingPhotosObservation}
            onClose={() => setViewingPhotosObservation(null)}
          />
        )}

        <AlertDialog open={!!deletingObservation} onOpenChange={(open) => !open && setDeletingObservation(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Observation</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete the observation of{" "}
                <span className="font-semibold">{deletingObservation?.object?.name}</span>?
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-delete-observation">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deletingObservation && selectedSession && deleteObservationMutation.mutate({
                  observationId: deletingObservation.id,
                  sessionId: selectedSession.id
                })}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleteObservationMutation.isPending}
                data-testid="button-confirm-delete-observation"
              >
                {deleteObservationMutation.isPending ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        
        <AlertDialog open={!!deletingSession} onOpenChange={(open) => !open && setDeletingSession(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Session</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this observation session from{" "}
                <span className="font-semibold">{deletingSession?.date ? format(parseISO(deletingSession.date.toString()), "MMMM d, yyyy") : ""}</span>?
                This will also delete all {deletingSession?.observations?.length || 0} observations in this session.
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-delete-session">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deletingSession && deleteSessionMutation.mutate(deletingSession.id)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleteSessionMutation.isPending}
                data-testid="button-confirm-delete-session"
              >
                {deleteSessionMutation.isPending ? "Deleting..." : "Delete Session"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Star Journal</h1>
          <p className="text-muted-foreground">Track, analyze, and share your observations</p>
        </div>
        <Button asChild data-testid="button-new-session">
          <Link href="/wizard">
            <Plus className="w-4 h-4 mr-2" />
            New Observation
          </Link>
        </Button>
      </div>

      <Tabs defaultValue="sessions" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 lg:w-[400px]">
          <TabsTrigger value="sessions" className="gap-2" data-testid="tab-sessions">
            <ClipboardList className="w-4 h-4" />
            Sessions
          </TabsTrigger>
          <TabsTrigger value="gallery" className="gap-2" data-testid="tab-gallery">
            <Camera className="w-4 h-4" />
            Gallery
          </TabsTrigger>
          <TabsTrigger value="analytics" className="gap-2" data-testid="tab-analytics">
            <BarChart3 className="w-4 h-4" />
            Analytics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sessions" className="space-y-4">
          <div className="flex justify-end gap-2">
            {filteredSessions.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" data-testid="button-export-menu">
                    <Download className="w-4 h-4 mr-2" />
                    Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Export Format</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={() => exportSessionsToCSV(filteredSessions)}
                    data-testid="button-export-sessions-csv"
                  >
                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                    Sessions (CSV)
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => exportObservationsToCSV(filteredSessions)}
                    data-testid="button-export-observations-csv"
                  >
                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                    Observations (CSV)
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={() => exportToPDF(filteredSessions)}
                    data-testid="button-export-pdf"
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    Full Report (PDF)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by object, location, or notes..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                  data-testid="input-session-search"
                />
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setShowFilters(!showFilters)}
                className={showFilters ? "bg-primary/10" : ""}
                data-testid="button-toggle-filters"
              >
                <Filter className="w-4 h-4" />
              </Button>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="button-clear-filters">
                  <X className="w-4 h-4 mr-1" />
                  Clear
                </Button>
              )}
            </div>

            {showFilters && (
              <div className="flex flex-wrap gap-3 pt-2 border-t">
                <div className="w-48">
                  <Select value={locationFilter} onValueChange={setLocationFilter}>
                    <SelectTrigger data-testid="select-location-filter">
                      <SelectValue placeholder="Filter by location" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Locations</SelectItem>
                      {locations?.map((loc) => (
                        <SelectItem key={loc.id} value={loc.id.toString()}>
                          {loc.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-48">
                  <Select value={dateFilter} onValueChange={setDateFilter}>
                    <SelectTrigger data-testid="select-date-filter">
                      <SelectValue placeholder="Filter by date" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Time</SelectItem>
                      <SelectItem value="thisMonth">This Month</SelectItem>
                      <SelectItem value="lastMonth">Last Month</SelectItem>
                      <SelectItem value="last3Months">Last 3 Months</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-48">
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger data-testid="select-category-filter">
                      <SelectValue placeholder="Filter by category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      <SelectItem value="planet">Planet</SelectItem>
                      <SelectItem value="moon">Moon</SelectItem>
                      <SelectItem value="nebula">Nebula</SelectItem>
                      <SelectItem value="emission_nebula">Emission Nebula</SelectItem>
                      <SelectItem value="reflection_nebula">Reflection Nebula</SelectItem>
                      <SelectItem value="dark_nebula">Dark Nebula</SelectItem>
                      <SelectItem value="mixed_nebula">Mixed Nebula</SelectItem>
                      <SelectItem value="planetary_nebula">Planetary Nebula</SelectItem>
                      <SelectItem value="open_cluster">Open Cluster</SelectItem>
                      <SelectItem value="globular_cluster">Globular Cluster</SelectItem>
                      <SelectItem value="galaxy">Galaxy</SelectItem>
                      <SelectItem value="double_star">Double Star</SelectItem>
                      <SelectItem value="asterism">Asterism</SelectItem>
                      <SelectItem value="supernova_remnant">Supernova Remnant</SelectItem>
                      <SelectItem value="comet">Comet</SelectItem>
                      <SelectItem value="meteor_shower">Meteor Shower</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {hasActiveFilters && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Showing {filteredSessions.length} of {sessions?.length ?? 0} sessions</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-4">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-48" />
            </div>
          ))}
        </div>
      ) : filteredSessions.length ? (
        <div className="space-y-8">
          {Object.entries(groupedSessions).map(([month, monthSessions]) => (
            <div key={month} className="space-y-4">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <h2 className="text-lg font-semibold">{month}</h2>
                <Badge variant="secondary">{monthSessions.length}</Badge>
              </div>
              <div className="space-y-4">
                {monthSessions.map((session) => (
                  <SessionCard
                    key={session.id}
                    session={session}
                    observationCount={session.observations?.length ?? 0}
                    onClick={() => setSelectedSession(session)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : sessions?.length ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Search className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-2">No matching sessions</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Try adjusting your search or filters to find what you're looking for.
            </p>
            <Button variant="outline" onClick={clearFilters} data-testid="button-clear-filters-empty">
              Clear Filters
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-16 text-center">
            <ClipboardList className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-2">No observation sessions yet</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Start your first observation session to begin tracking your astronomical journey.
            </p>
            <Button asChild data-testid="button-start-first-session-empty">
              <Link href="/wizard">
                <Plus className="w-4 h-4 mr-2" />
                Start Your First Session
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
        </TabsContent>

        <TabsContent value="gallery">
          <PhotoGallery onNavigateToSession={(sessionId) => {
            setLocation(`/sessions?id=${sessionId}`);
          }} />
        </TabsContent>

        <TabsContent value="analytics">
          <JournalAnalytics />
        </TabsContent>
      </Tabs>
    </div>
  );
}
