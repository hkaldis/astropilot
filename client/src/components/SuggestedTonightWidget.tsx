import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Link } from "wouter";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { 
  Star, 
  ArrowRight, 
  Moon, 
  Eye, 
  Clock, 
  Sparkles,
  TrendingUp,
  Target,
  AlertCircle,
  CloudSun,
  HelpCircle,
  ChevronDown,
  X
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Location } from "@shared/schema";

interface RecommendationResponse {
  recommendations: Array<{
    objectId: number;
    catalogId: string;
    name: string;
    category: string;
    magnitude: number | null;
    constellation: string | null;
    difficulty: string | null;
    description: string | null;
    isWow: boolean;
    isHot: boolean;
    totalScore: number;
    visibilityScore: number;
    moonScore: number;
    conditionsScore: number;
    equipmentScore: number;
    freshnessScore: number;
    seasonalScore: number;
    maxAltitude: number | null;
    transitTime: string | null;
    darknessOverlapMinutes: number;
    moonSeparation: number | null;
    moonInterference: 'none' | 'low' | 'moderate' | 'high';
    equipmentMatch: 'excellent' | 'good' | 'fair' | 'poor';
    lastObserved: string | null;
    observationCount: number;
    rationale: string[];
  }>;
  context: {
    location: {
      id: number;
      name: string;
      latitude: number;
      longitude: number;
      bortle: number;
    };
    moonIllumination: number;
    hasConditionsLogged: boolean;
    conditionsScore: number | null;
    powerClass: string | null;
    currentMonth: string;
  };
  totalObjectsEvaluated: number;
  totalRecommendations: number;
}

interface SuggestedTonightWidgetProps {
  locations: Location[];
}

const categoryIcons: Record<string, string> = {
  planet: "Planet",
  moon: "Moon",
  galaxy: "Galaxy",
  nebula: "Nebula",
  open_cluster: "Open Cluster",
  globular_cluster: "Glob. Cluster",
  planetary_nebula: "Plan. Nebula",
  supernova_remnant: "SNR",
  double_star: "Double Star",
};

type ConditionsQuality = 'excellent' | 'good' | 'fair' | 'poor' | 'very_poor';

function getConditionsQuality(score: number): ConditionsQuality {
  if (score >= 80) return 'excellent';
  if (score >= 60) return 'good';
  if (score >= 40) return 'fair';
  if (score >= 20) return 'poor';
  return 'very_poor';
}

function getConditionsConfig(quality: ConditionsQuality) {
  switch (quality) {
    case 'excellent':
      return { label: 'Exc', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' };
    case 'good':
      return { label: 'Good', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30' };
    case 'fair':
      return { label: 'Fair', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30' };
    case 'poor':
      return { label: 'Poor', color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30' };
    case 'very_poor':
      return { label: 'V.Poor', color: 'text-red-600 dark:text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30' };
  }
}

function ConditionsQualityBadge({ score }: { score: number }) {
  const quality = getConditionsQuality(score);
  const config = getConditionsConfig(quality);
  
  return (
    <Badge 
      variant="outline" 
      className={cn("text-[10px] px-1.5 py-0 h-5 gap-0.5", config.bg, config.border, config.color)}
    >
      <CloudSun className="w-2.5 h-2.5" />
      {config.label}
    </Badge>
  );
}

function getScoreBadgeVariant(score: number): "default" | "secondary" | "outline" {
  if (score >= 70) return "default";
  if (score >= 50) return "secondary";
  return "outline";
}

function formatTransitTime(isoString: string | null): string {
  if (!isoString) return "";
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return "";
  }
}

interface RecommendedObjectCardProps {
  rec: RecommendationResponse['recommendations'][0];
  showConditionsBadge: boolean;
}

function RecommendedObjectCard({ rec, showConditionsBadge }: RecommendedObjectCardProps) {
  const transitTime = formatTransitTime(rec.transitTime);
  
  return (
    <Link href={`/sky-tonight?select=${rec.catalogId}`}>
      <div 
        className="p-3 rounded-lg border bg-card hover-elevate cursor-pointer transition-all"
        data-testid={`card-recommendation-${rec.objectId}`}
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h4 className="font-medium text-sm truncate">{rec.name}</h4>
              {rec.isWow && (
                <Sparkles className="w-3.5 h-3.5 text-chart-4 shrink-0" data-testid={`icon-wow-rec-${rec.objectId}`} />
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {rec.catalogId} · {categoryIcons[rec.category] || rec.category}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {showConditionsBadge && (
              <ConditionsQualityBadge score={rec.conditionsScore} />
            )}
            <Badge variant={getScoreBadgeVariant(rec.totalScore)}>
              {rec.totalScore}
            </Badge>
          </div>
        </div>
        
        <div className="space-y-1.5">
          <div className="flex items-center gap-3 text-xs">
            {rec.maxAltitude !== null && (
              <span className="flex items-center gap-1 text-muted-foreground">
                <TrendingUp className="w-3 h-3" />
                {rec.maxAltitude.toFixed(0)}°
              </span>
            )}
            {transitTime && (
              <span className="flex items-center gap-1 text-muted-foreground">
                <Clock className="w-3 h-3" />
                {transitTime}
              </span>
            )}
            {rec.moonInterference !== 'none' && (
              <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <Moon className="w-3 h-3" />
                {rec.moonInterference}
              </span>
            )}
          </div>
          
          {rec.rationale.length > 0 && (
            <p className="text-xs text-muted-foreground line-clamp-1">
              {rec.rationale[0]}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}

const conditionsLevels: { key: ConditionsQuality; label: string; range: string }[] = [
  { key: 'excellent', label: 'Excellent', range: '80-100%' },
  { key: 'good', label: 'Good', range: '60-79%' },
  { key: 'fair', label: 'Fair', range: '40-59%' },
  { key: 'poor', label: 'Poor', range: '20-39%' },
  { key: 'very_poor', label: 'Very Poor', range: '0-19%' },
];

export function SuggestedTonightWidget({ locations }: SuggestedTonightWidgetProps) {
  const [filterWow, setFilterWow] = useState(false);
  const [filterConditions, setFilterConditions] = useState<Set<ConditionsQuality>>(new Set());
  const [filterWellPositioned, setFilterWellPositioned] = useState(false);

  const { user } = useAuth();

  const favoriteLocation = locations.find(l => l.isFavorite) || locations[0];
  const hasValidLocation = favoriteLocation && 
    favoriteLocation.latitude != null && 
    favoriteLocation.longitude != null;

  const { data, isLoading, error } = useQuery<RecommendationResponse>({
    queryKey: ['/api/recommendations/tonight', favoriteLocation?.id],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (favoriteLocation?.id) {
        params.set('locationId', favoriteLocation.id.toString());
      }
      params.set('limit', '50');
      
      const res = await fetch(`/api/recommendations/tonight?${params}`, {
        credentials: 'include',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Failed to fetch' }));
        throw new Error(err.message);
      }
      return res.json();
    },
    enabled: !!user && hasValidLocation,
    staleTime: 5 * 60 * 1000,
  });

  const hasConditionsLogged = data?.context?.hasConditionsLogged ?? false;
  const contextConditionsScore = data?.context?.conditionsScore ?? null;

  const filteredRecommendations = useMemo(() => {
    if (!data?.recommendations) return [];
    
    return data.recommendations.filter(rec => {
      if (filterWow && !rec.isWow) return false;
      
      if (filterConditions.size > 0 && hasConditionsLogged) {
        const quality = getConditionsQuality(rec.conditionsScore);
        if (!filterConditions.has(quality)) return false;
      }
      
      if (filterWellPositioned) {
        if (rec.maxAltitude === null || rec.maxAltitude < 25) return false;
      }
      
      return true;
    });
  }, [data?.recommendations, filterWow, filterConditions, filterWellPositioned, hasConditionsLogged]);

  const toggleConditionsFilter = (level: ConditionsQuality) => {
    setFilterConditions(prev => {
      const next = new Set(prev);
      if (next.has(level)) {
        next.delete(level);
      } else {
        next.add(level);
      }
      return next;
    });
  };

  const clearFilters = () => {
    setFilterWow(false);
    setFilterConditions(new Set());
    setFilterWellPositioned(false);
  };

  const hasActiveFilters = filterWow || filterConditions.size > 0 || filterWellPositioned;

  if (!hasValidLocation) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-chart-5" />
              Best for Tonight
            </CardTitle>
            <CardDescription>Personalized object recommendations</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <AlertCircle className="w-8 h-8 mx-auto mb-3 opacity-50" />
            <p className="text-sm">Add a location with coordinates</p>
            <p className="text-xs mt-1">to get personalized recommendations</p>
            <Button variant="outline" size="sm" className="mt-3" asChild>
              <Link href="/locations" data-testid="button-add-location-for-recs">
                Add Location
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-chart-5" />
              Best for Tonight
            </CardTitle>
            <CardDescription>Calculating recommendations...</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-chart-5" />
              Best for Tonight
            </CardTitle>
            <CardDescription>Personalized object recommendations</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <AlertCircle className="w-8 h-8 mx-auto mb-3 opacity-50" />
            <p className="text-sm">Could not load recommendations</p>
            <p className="text-xs mt-1">{error?.message || 'Please try again later'}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { recommendations, context } = data;
  const displayedRecs = filteredRecommendations.slice(0, 4);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-chart-5" />
            Best for Tonight
          </CardTitle>
          <CardDescription className="flex items-center gap-2 flex-wrap">
            <span>From {context.location.name}</span>
            <span className="text-muted-foreground">·</span>
            <span className="flex items-center gap-1">
              <Moon className="w-3 h-3" />
              {context.moonIllumination}% Moon
            </span>
            {context.hasConditionsLogged && (
              <>
                <span className="text-muted-foreground">·</span>
                <Badge variant="outline" className="text-xs">
                  Conditions logged
                </Badge>
              </>
            )}
          </CardDescription>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/sky-tonight" data-testid="link-view-sky-tonight">
            View All
            <ArrowRight className="w-4 h-4 ml-1" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="text-xs text-muted-foreground">Filters:</span>
          
          <Button
            variant={filterWow ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterWow(!filterWow)}
            className="h-7 text-xs gap-1"
            data-testid="button-filter-wow-dashboard"
          >
            <Sparkles className="w-3 h-3" />
            Wow
          </Button>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={filterConditions.size > 0 ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs gap-1"
                disabled={!hasConditionsLogged}
                data-testid="button-filter-conditions-dashboard"
              >
                <CloudSun className="w-3 h-3" />
                Conditions
                {filterConditions.size > 0 && (
                  <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
                    {filterConditions.size}
                  </Badge>
                )}
                <ChevronDown className="w-3 h-3 ml-0.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-3" align="start">
              <div className="space-y-3">
                <p className="text-sm font-medium">Filter by Conditions Quality</p>
                <div className="space-y-2">
                  {conditionsLevels.map(({ key, label, range }) => {
                    const config = getConditionsConfig(key);
                    return (
                      <div key={key} className="flex items-center gap-2">
                        <Checkbox
                          id={`conditions-dashboard-${key}`}
                          checked={filterConditions.has(key)}
                          onCheckedChange={() => toggleConditionsFilter(key)}
                          data-testid={`checkbox-conditions-dashboard-${key}`}
                        />
                        <label
                          htmlFor={`conditions-dashboard-${key}`}
                          className="flex items-center justify-between flex-1 text-sm cursor-pointer"
                        >
                          <span className={config.color}>{label}</span>
                          <span className="text-xs text-muted-foreground">{range}</span>
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <Button
            variant={filterWellPositioned ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterWellPositioned(!filterWellPositioned)}
            className="h-7 text-xs gap-1"
            data-testid="button-filter-well-positioned-dashboard"
          >
            <Eye className="w-3 h-3" />
            Well Positioned
          </Button>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                data-testid="button-help-filters-dashboard"
              >
                <HelpCircle className="w-3.5 h-3.5 text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-4" align="end">
              <div className="space-y-3">
                <h4 className="font-medium text-sm">Understanding Filters</h4>
                <div className="space-y-2 text-xs text-muted-foreground">
                  <div>
                    <span className="font-medium text-foreground flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-chart-4" /> Wow
                    </span>
                    <p>Show only impressive, must-see targets</p>
                  </div>
                  <div>
                    <span className="font-medium text-foreground flex items-center gap-1">
                      <CloudSun className="w-3 h-3" /> Conditions
                    </span>
                    <p>Filter by weather quality. Requires logging tonight's conditions.</p>
                  </div>
                  <div>
                    <span className="font-medium text-foreground flex items-center gap-1">
                      <Eye className="w-3 h-3" /> Well Positioned
                    </span>
                    <p>Objects above 25° altitude</p>
                  </div>
                </div>
                <div className="pt-2 border-t">
                  <p className="text-xs font-medium mb-2">Conditions Quality Levels</p>
                  <div className="grid grid-cols-2 gap-1 text-xs">
                    {conditionsLevels.map(({ key, label, range }) => {
                      const config = getConditionsConfig(key);
                      return (
                        <div key={key} className="flex items-center justify-between">
                          <span className={config.color}>{label}</span>
                          <span className="text-muted-foreground">{range}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="h-7 text-xs gap-1"
              data-testid="button-clear-filters-dashboard"
            >
              <X className="w-3 h-3" />
              Clear
            </Button>
          )}
        </div>

        {!hasConditionsLogged && filterConditions.size === 0 && (
          <div className="mb-4 p-2 rounded-md bg-amber-500/10 border border-amber-500/30 text-xs text-amber-700 dark:text-amber-300">
            <span className="font-medium">Tip:</span> Log tonight's conditions in{" "}
            <Link href="/sessions" className="underline hover:no-underline">Sessions</Link>{" "}
            to see per-object conditions badges.
          </div>
        )}

        {displayedRecs.length > 0 ? (
          <div className="grid sm:grid-cols-2 gap-3">
            {displayedRecs.map((rec) => (
              <RecommendedObjectCard 
                key={rec.objectId} 
                rec={rec} 
                showConditionsBadge={hasConditionsLogged}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Star className="w-8 h-8 mx-auto mb-3 opacity-50" />
            <p className="text-sm">
              {hasActiveFilters 
                ? "No objects match your filters" 
                : "No recommendations available"}
            </p>
            <p className="text-xs mt-1">
              {hasActiveFilters
                ? "Try relaxing some filters"
                : "Try adding more equipment or check back later"}
            </p>
          </div>
        )}
        
        {recommendations.length > 0 && (
          <div className="mt-4 pt-3 border-t">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {filteredRecommendations.length} of {data.totalRecommendations} objects
                {hasActiveFilters && " (filtered)"}
              </span>
              <span className="flex items-center gap-1">
                <Target className="w-3 h-3" />
                Scores based on visibility, conditions & your equipment
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
