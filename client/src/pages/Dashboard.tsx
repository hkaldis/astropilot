import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { ObjectCard } from "@/components/ObjectCard";
import { SessionCard } from "@/components/SessionCard";
import { WeatherCard } from "@/components/WeatherCard";
import { TonightConditionsWidget } from "@/components/TonightConditionsWidget";
import { TonightSummaryWidget, UpcomingEventsWidget, MoonImpactWidget } from "@/components/TonightSummaryWidget";
import { SuggestedTonightWidget } from "@/components/SuggestedTonightWidget";
import { WatchListWidget } from "@/components/WatchListWidget";
import { SpaceWeatherCard } from "@/components/SpaceWeatherCard";
import { ISSTrackingCard } from "@/components/ISSTrackingCard";
import { OnboardingTutorial } from "@/components/OnboardingTutorial";
import { Link, useLocation } from "wouter";
import { Wand2, ArrowRight, Telescope, MapPin, Star, ChevronRight, Trophy, Target, Beer, Heart } from "lucide-react";
import { DonationDialog } from "@/components/DonationDialog";
import { getLevelInfo } from "@shared/leveling";
import { LevelIcon } from "@/components/LevelIcon";
import type { Telescope as TelescopeType, Location, CelestialObject, ObservationSession } from "@shared/schema";

interface DashboardStats {
  telescopes: TelescopeType[];
  locations: Location[];
  recentSessions: (ObservationSession & { location: Location | null; observationCount: number })[];
  suggestedObjects: CelestialObject[];
  tonightScore: {
    totalScore: number;
    planetScore: number;
    dsoScore: number;
  } | null;
  moonPhase: number;
}

interface AchievementsData {
  earnedBadges: Array<{
    id: number;
    name: string;
    tier: string;
    points: number;
    earnedAt: Date;
  }>;
  totalPoints: number;
  stats: {
    totalObservations: number;
    messierObjectsObserved: number;
  };
  messier: {
    observed: number;
    total: number;
    percentComplete: number;
  };
}

const tierColors: Record<string, string> = {
  bronze: "bg-amber-700 text-amber-50",
  silver: "bg-slate-400 text-slate-900",
  gold: "bg-yellow-500 text-yellow-950",
  special: "bg-gradient-to-r from-purple-500 to-pink-500 text-white",
};

function AchievementsWidget({ user }: { user: any }) {
  const { data: achievements, isLoading } = useQuery<AchievementsData>({
    queryKey: ["/api/user/achievements"],
    enabled: !!user,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <Trophy className="w-5 h-5" />
            Achievements
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24" />
        </CardContent>
      </Card>
    );
  }

  const recentBadges = achievements?.earnedBadges?.slice(0, 3) || [];
  const messierProgress = achievements?.messier?.percentComplete || 0;
  const totalXP = achievements?.totalPoints || 0;
  const levelInfo = getLevelInfo(totalXP);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2 space-y-0">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-yellow-500" />
          <CardTitle>Achievements</CardTitle>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/achievements" data-testid="link-view-achievements">
            View All
            <ArrowRight className="w-4 h-4 ml-1" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-3 sm:gap-4 p-2 sm:p-3 bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-pink-500/10 rounded-lg">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
            <LevelIcon 
              level={levelInfo.level} 
              size="sm"
              showBadge={true}
              animated={levelInfo.isMaxLevel}
              className="shrink-0"
            />
            <div className="min-w-0 flex-1">
              <p className="font-bold text-sm sm:text-base truncate" data-testid="dashboard-title">{levelInfo.title}</p>
              <div className="flex items-center gap-1 sm:gap-1.5 text-xs text-muted-foreground flex-wrap">
                <span className="font-mono text-indigo-500 font-semibold">{totalXP} XP</span>
                <span className="hidden sm:inline">·</span>
                <span className="hidden sm:inline">Level {levelInfo.level}</span>
              </div>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-base sm:text-lg font-semibold">{achievements?.earnedBadges?.length || 0}</p>
            <p className="text-xs text-muted-foreground">Badges</p>
          </div>
        </div>
        
        {!levelInfo.isMaxLevel && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Level Progress</span>
              <span className="font-mono">{levelInfo.xpIntoLevel} / {levelInfo.xpNeededForNext} XP</span>
            </div>
            <Progress value={levelInfo.progressPercent} className="h-1.5" />
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <Star className="w-4 h-4 text-primary" />
              Messier Marathon
            </span>
            <span className="font-mono">{achievements?.messier?.observed || 0}/110</span>
          </div>
          <Progress value={messierProgress} className="h-2" />
          <p className="text-xs text-muted-foreground text-right">
            {messierProgress}% complete
          </p>
        </div>

        {recentBadges.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">Recent Badges</p>
            <div className="flex flex-wrap gap-2">
              {recentBadges.map((badge) => (
                <Badge
                  key={badge.id}
                  className={`${tierColors[badge.tier] || 'bg-muted'}`}
                >
                  {badge.name}
                </Badge>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-2 text-muted-foreground">
            <Target className="w-6 h-6 mx-auto mb-2 opacity-50" />
            <p className="text-xs">Start observing to earn badges!</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatCard({ 
  icon: Icon, 
  label, 
  value, 
  href 
}: { 
  icon: React.ElementType; 
  label: string; 
  value: number; 
  href: string;
}) {
  return (
    <Link href={href}>
      <Card className="hover-elevate cursor-pointer h-full">
        <CardContent className="p-3 sm:p-4 flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Icon className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
          </div>
          <div className="min-w-0 text-center sm:text-left flex-1">
            <p className="font-mono text-xl sm:text-2xl font-bold">{value}</p>
            <p className="text-xs sm:text-sm text-muted-foreground truncate">{label}</p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground ml-auto shrink-0 hidden sm:block" />
        </CardContent>
      </Card>
    </Link>
  );
}

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const [showTutorial, setShowTutorial] = useState(false);
  const { user } = useAuth();
  
  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard"],
    enabled: !!user,
  });

  useEffect(() => {
    if (!isLoading && stats) {
      const tutorialCompleted = localStorage.getItem("astropilot_tutorial_completed");
      const hasNoLocations = !stats.locations || stats.locations.length === 0;
      
      if (!tutorialCompleted && hasNoLocations) {
        setShowTutorial(true);
      }
    }
  }, [isLoading, stats]);

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          <Skeleton className="h-24 sm:h-32" />
          <Skeleton className="h-24 sm:h-32" />
          <Skeleton className="h-24 sm:h-32" />
        </div>
        <div className="grid lg:grid-cols-2 gap-4 sm:gap-6">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  const locations = stats?.locations ?? [];

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 overflow-x-hidden">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold">AstroPilot Hub</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            {new Date().toLocaleDateString("en-US", { 
              weekday: "long", 
              month: "long", 
              day: "numeric" 
            })}
          </p>
        </div>
        <Button asChild data-testid="button-new-observation" size="sm" className="sm:size-default">
          <Link href="/wizard">
            <Wand2 className="w-4 h-4 mr-2" />
            New Observation
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <StatCard 
          icon={Telescope} 
          label="Telescopes" 
          value={stats?.telescopes?.length ?? 0} 
          href="/equipment"
        />
        <StatCard 
          icon={MapPin} 
          label="Locations" 
          value={stats?.locations?.length ?? 0} 
          href="/locations"
        />
        <StatCard 
          icon={Star} 
          label="Observations" 
          value={stats?.recentSessions?.reduce((acc, s) => acc + s.observationCount, 0) ?? 0} 
          href="/sessions"
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-4 sm:gap-6">
        <TonightConditionsWidget locations={locations} />
        <AchievementsWidget user={user} />
      </div>

      {stats?.locations && stats.locations.length > 0 && (
        <>
          <div className="grid lg:grid-cols-2 gap-4 sm:gap-6">
            <TonightSummaryWidget 
              location={stats.locations.find(l => l.isFavorite) ?? stats.locations[0]}
            />
            <UpcomingEventsWidget 
              location={stats.locations.find(l => l.isFavorite) ?? stats.locations[0]}
            />
          </div>
          <WeatherCard 
            locations={stats.locations}
            latitude={stats.locations.find(l => l.isFavorite)?.latitude ?? stats.locations[0]?.latitude}
            longitude={stats.locations.find(l => l.isFavorite)?.longitude ?? stats.locations[0]?.longitude}
            locationName={stats.locations.find(l => l.isFavorite)?.name ?? stats.locations[0]?.name}
          />
        </>
      )}

      <div className="grid md:grid-cols-2 gap-4 sm:gap-6">
        <SpaceWeatherCard />
        <ISSTrackingCard 
          latitude={(stats?.locations?.find(l => l.isFavorite)?.latitude ?? stats?.locations?.[0]?.latitude) || undefined}
          longitude={(stats?.locations?.find(l => l.isFavorite)?.longitude ?? stats?.locations?.[0]?.longitude) || undefined}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-4 sm:gap-6">
        <SuggestedTonightWidget locations={stats?.locations || []} />
        <WatchListWidget />
      </div>

      <div className="grid lg:grid-cols-1 gap-4 sm:gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2 space-y-0">
            <div className="min-w-0 flex-1">
              <CardTitle className="text-base sm:text-lg">Recent Sessions</CardTitle>
              <CardDescription className="text-xs sm:text-sm truncate">Your latest observation sessions</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild className="shrink-0">
              <Link href="/sessions" data-testid="link-view-all-sessions">
                <span className="hidden sm:inline">View All</span>
                <ArrowRight className="w-4 h-4 sm:ml-1" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {stats?.recentSessions && stats.recentSessions.length > 0 ? (
              <div className="space-y-3">
                {stats.recentSessions.slice(0, 3).map((session) => (
                  <SessionCard
                    key={session.id}
                    session={session}
                    observationCount={session.observationCount}
                    compact
                    onClick={() => setLocation(`/sessions?id=${session.id}`)}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Telescope className="w-8 h-8 mx-auto mb-3 opacity-50" />
                <p className="text-sm">No observation sessions yet</p>
                <Button variant="outline" size="sm" className="mt-3" asChild>
                  <Link href="/wizard" data-testid="button-start-first-session">
                    Start Your First Session
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <DonationDialog 
        testId="button-donate-dashboard" 
        trigger={
          <Card className="bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-yellow-500/10 border-amber-500/20 cursor-pointer hover-elevate transition-all" data-testid="card-donate-dashboard">
            <CardContent className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 sm:p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center">
                  <Beer className="w-6 h-6 text-amber-500" />
                </div>
                <div className="text-center sm:text-left">
                  <h3 className="font-semibold flex items-center gap-2">
                    Enjoying AstroPilot?
                    <Heart className="w-4 h-4 text-red-500" />
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Support development with a virtual beer
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-medium">
                <Beer className="w-5 h-5" />
                <span>Buy Me a Beer</span>
              </div>
            </CardContent>
          </Card>
        }
      />

      <OnboardingTutorial
        open={showTutorial}
        onOpenChange={setShowTutorial}
      />
    </div>
  );
}
