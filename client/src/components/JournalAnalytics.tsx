import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { 
  BarChart3, 
  Calendar, 
  Star, 
  Telescope, 
  Camera,
  Moon,
  Eye,
  Sparkles,
  TrendingUp,
  Clock,
  MapPin
} from "lucide-react";
import { format, subMonths, startOfMonth, endOfMonth, eachMonthOfInterval, isSameMonth } from "date-fns";
import { cn } from "@/lib/utils";
import type { ObservationSession, Location, Observation, CelestialObject } from "@shared/schema";

interface SessionWithDetails extends ObservationSession {
  location: Location | null;
  observations: (Observation & { object: CelestialObject })[];
}

function StatCard({ 
  icon: Icon, 
  label, 
  value, 
  subtext,
  className 
}: { 
  icon: typeof Star; 
  label: string; 
  value: string | number; 
  subtext?: string;
  className?: string;
}) {
  return (
    <Card className={cn("hover-elevate", className)}>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Icon className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-sm text-muted-foreground">{label}</p>
            {subtext && <p className="text-xs text-muted-foreground mt-1">{subtext}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CategoryBreakdown({ observations }: { observations: (Observation & { object: CelestialObject })[] }) {
  const categoryStats = useMemo(() => {
    const stats: Record<string, number> = {};
    observations.forEach(obs => {
      const category = obs.object?.category ?? "unknown";
      stats[category] = (stats[category] ?? 0) + 1;
    });
    return Object.entries(stats)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [observations]);

  const maxCount = Math.max(...categoryStats.map(([, count]) => count), 1);

  const categoryColors: Record<string, string> = {
    planet: "bg-amber-500",
    galaxy: "bg-purple-500",
    nebula: "bg-pink-500",
    emission_nebula: "bg-pink-500",
    planetary_nebula: "bg-cyan-500",
    open_cluster: "bg-blue-500",
    globular_cluster: "bg-indigo-500",
    double_star: "bg-cyan-500",
    supernova_remnant: "bg-red-500",
    moon: "bg-slate-500",
    comet: "bg-teal-500",
    meteor_shower: "bg-yellow-500",
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <BarChart3 className="w-4 h-4" />
          Observations by Category
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {categoryStats.map(([category, count]) => (
          <div key={category} className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="capitalize">{category.replace(/_/g, ' ')}</span>
              <span className="font-mono text-muted-foreground">{count}</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div 
                className={cn("h-full rounded-full transition-all", categoryColors[category] ?? "bg-primary")}
                style={{ width: `${(count / maxCount) * 100}%` }}
              />
            </div>
          </div>
        ))}
        {categoryStats.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">No observations yet</p>
        )}
      </CardContent>
    </Card>
  );
}

function MonthlyActivity({ sessions }: { sessions: SessionWithDetails[] }) {
  const monthlyData = useMemo(() => {
    const now = new Date();
    const sixMonthsAgo = subMonths(now, 5);
    const months = eachMonthOfInterval({
      start: startOfMonth(sixMonthsAgo),
      end: endOfMonth(now)
    });

    return months.map(month => {
      const sessionsInMonth = sessions.filter(s => isSameMonth(new Date(s.date), month));
      const observationsInMonth = sessionsInMonth.reduce((sum, s) => sum + (s.observations?.length ?? 0), 0);
      return {
        month: format(month, 'MMM'),
        sessions: sessionsInMonth.length,
        observations: observationsInMonth,
      };
    });
  }, [sessions]);

  const maxObservations = Math.max(...monthlyData.map(m => m.observations), 1);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="w-4 h-4" />
          6-Month Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-end justify-between gap-2 h-32">
          {monthlyData.map((data, i) => {
            const barHeight = Math.max((data.observations / maxObservations) * 100, 8);
            return (
              <div key={i} className="flex-1 flex flex-col items-center h-full">
                <div className="flex-1 flex items-end w-full">
                  <div 
                    className="w-full bg-primary/80 rounded-t transition-all hover:bg-primary"
                    style={{ height: `${barHeight}%` }}
                    title={`${data.observations} observations in ${data.sessions} sessions`}
                  />
                </div>
                <span className="text-xs text-muted-foreground mt-1">{data.month}</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function TopLocations({ sessions }: { sessions: SessionWithDetails[] }) {
  const locationStats = useMemo(() => {
    const stats: Record<string, { name: string; count: number; observations: number }> = {};
    sessions.forEach(s => {
      const locName = s.location?.name ?? "Unknown";
      if (!stats[locName]) {
        stats[locName] = { name: locName, count: 0, observations: 0 };
      }
      stats[locName].count++;
      stats[locName].observations += s.observations?.length ?? 0;
    });
    return Object.values(stats)
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);
  }, [sessions]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <MapPin className="w-4 h-4" />
          Top Locations
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {locationStats.map((loc, i) => (
          <div key={loc.name} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="w-6 h-6 p-0 flex items-center justify-center text-xs">
                {i + 1}
              </Badge>
              <span className="text-sm font-medium truncate">{loc.name}</span>
            </div>
            <div className="text-right">
              <p className="text-sm font-mono">{loc.count} sessions</p>
              <p className="text-xs text-muted-foreground">{loc.observations} obs</p>
            </div>
          </div>
        ))}
        {locationStats.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">No sessions yet</p>
        )}
      </CardContent>
    </Card>
  );
}

function BestObservations({ observations }: { observations: (Observation & { object: CelestialObject })[] }) {
  const topRated = useMemo(() => {
    return observations
      .filter(obs => obs.visibilityRating && obs.visibilityRating >= 4)
      .sort((a, b) => (b.visibilityRating ?? 0) - (a.visibilityRating ?? 0))
      .slice(0, 5);
  }, [observations]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="w-4 h-4" />
          Best Observations
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {topRated.map((obs) => (
          <div key={obs.id} className="flex items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{obs.object?.name}</p>
              <p className="text-xs text-muted-foreground font-mono">{obs.object?.catalogId}</p>
            </div>
            <div className="flex items-center gap-1">
              {Array.from({ length: obs.visibilityRating ?? 0 }).map((_, i) => (
                <Star key={i} className="w-3 h-3 fill-amber-400 text-amber-400" />
              ))}
            </div>
          </div>
        ))}
        {topRated.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No highly-rated observations yet
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function JournalAnalytics() {
  const { user } = useAuth();
  const { data: sessions, isLoading } = useQuery<SessionWithDetails[]>({
    queryKey: ["/api/sessions"],
    enabled: !!user,
    staleTime: 0, // Always refetch to ensure fresh data for analytics
  });

  const stats = useMemo(() => {
    if (!sessions) return null;

    const allObservations = sessions.flatMap(s => s.observations ?? []);
    const imagedCount = allObservations.filter(o => o.imagingDone).length;
    const uniqueObjects = new Set(allObservations.map(o => o.objectId)).size;
    const avgRating = allObservations.filter(o => o.visibilityRating)
      .reduce((sum, o) => sum + (o.visibilityRating ?? 0), 0) / 
      (allObservations.filter(o => o.visibilityRating).length || 1);

    return {
      totalSessions: sessions.length,
      totalObservations: allObservations.length,
      imagedCount,
      uniqueObjects,
      avgRating: avgRating.toFixed(1),
      allObservations,
    };
  }, [sessions]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!sessions || sessions.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <BarChart3 className="w-16 h-16 text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-medium mb-2">No observation data yet</h3>
          <p className="text-muted-foreground text-center max-w-md">
            Start logging your observations to see analytics and insights about your stargazing journey.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Calendar}
          label="Sessions"
          value={stats?.totalSessions ?? 0}
          subtext="Total observation nights"
        />
        <StatCard
          icon={Eye}
          label="Observations"
          value={stats?.totalObservations ?? 0}
          subtext={`${stats?.uniqueObjects ?? 0} unique objects`}
        />
        <StatCard
          icon={Camera}
          label="Imaged"
          value={stats?.imagedCount ?? 0}
          subtext="Astrophotography captures"
        />
        <StatCard
          icon={Star}
          label="Avg Rating"
          value={`${stats?.avgRating ?? 0}/5`}
          subtext="Visibility quality"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <MonthlyActivity sessions={sessions} />
        <CategoryBreakdown observations={stats?.allObservations ?? []} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <TopLocations sessions={sessions} />
        <BestObservations observations={stats?.allObservations ?? []} />
      </div>
    </div>
  );
}
