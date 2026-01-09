import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ObjectCard } from "@/components/ObjectCard";
import { ObjectDetailSheet } from "@/components/ObjectDetailSheet";
import { AddCustomObjectDialog } from "@/components/AddCustomObjectDialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Search, Star, Grid3X3, List, Sparkles, Filter, X, ChevronDown, Moon, TrendingUp, Clock, Target, ArrowUpDown, GitCompareArrows, Check, Plus, Bookmark, BookmarkCheck, Settings2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { WatchlistItem } from "@shared/schema";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import type { CelestialObject, Location, OpticalModifier } from "@shared/schema";
import type { OpticalModifierSpecs } from "@/lib/equipmentRecommendation";

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
    maxAltitude: number | null;
    transitTime: string | null;
    moonInterference: 'none' | 'low' | 'moderate' | 'high';
    rationale: string[];
  }>;
  context: {
    location: {
      id: number;
      name: string;
    };
    moonIllumination: number;
    hasConditionsLogged: boolean;
  };
  totalRecommendations: number;
}

const categories = [
  { value: "all", label: "All Objects" },
  { value: "planet", label: "Planets" },
  { value: "moon", label: "Moon" },
  { value: "nebula", label: "Nebulae" },
  { value: "galaxy", label: "Galaxies" },
  { value: "open_cluster", label: "Open Clusters" },
  { value: "globular_cluster", label: "Globular Clusters" },
  { value: "planetary_nebula", label: "Planetary Nebulae" },
  { value: "double_star", label: "Double Stars" },
  { value: "comet", label: "Comets" },
  { value: "meteor_shower", label: "Meteor Showers" },
];

const difficulties = [
  { value: "all", label: "All Difficulties" },
  { value: "easy", label: "Easy" },
  { value: "moderate", label: "Moderate" },
  { value: "challenging", label: "Challenging" },
  { value: "difficult", label: "Difficult" },
  { value: "expert", label: "Expert" },
];

const months = [
  { value: "jan", label: "Jan" },
  { value: "feb", label: "Feb" },
  { value: "mar", label: "Mar" },
  { value: "apr", label: "Apr" },
  { value: "may", label: "May" },
  { value: "jun", label: "Jun" },
  { value: "jul", label: "Jul" },
  { value: "aug", label: "Aug" },
  { value: "sep", label: "Sep" },
  { value: "oct", label: "Oct" },
  { value: "nov", label: "Nov" },
  { value: "dec", label: "Dec" },
];

const sortOptions = [
  { value: "name", label: "Name (A-Z)" },
  { value: "name_desc", label: "Name (Z-A)" },
  { value: "magnitude", label: "Brightness (brightest first)" },
  { value: "magnitude_desc", label: "Brightness (dimmest first)" },
  { value: "difficulty", label: "Difficulty (easiest first)" },
  { value: "difficulty_desc", label: "Difficulty (hardest first)" },
  { value: "catalog", label: "Catalog ID" },
];

const difficultyOrder: Record<string, number> = {
  easy: 1,
  moderate: 2,
  challenging: 3,
  difficult: 4,
  expert: 5,
};

export default function Objects() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [difficulty, setDifficulty] = useState("all");
  const [constellation, setConstellation] = useState("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showHot, setShowHot] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [magnitudeRange, setMagnitudeRange] = useState<[number, number]>([-15, 15]);
  const [selectedMonth, setSelectedMonth] = useState("all");
  const [selectedObject, setSelectedObject] = useState<CelestialObject | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sortBy, setSortBy] = useState("name");
  const [compareObjects, setCompareObjects] = useState<CelestialObject[]>([]);
  const [showAddCustomDialog, setShowAddCustomDialog] = useState(false);
  const [selectedModifierId, setSelectedModifierId] = useState<number | null>(null);

  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const { data: opticalModifiers } = useQuery<OpticalModifier[]>({
    queryKey: ['/api/equipment/optical-modifiers'],
    enabled: isAuthenticated,
  });

  const { data: objects, isLoading } = useQuery<CelestialObject[]>({
    queryKey: isAuthenticated ? ["/api/objects/for-user"] : ["/api/objects"],
    enabled: !authLoading,
  });

  const { data: locations } = useQuery<Location[]>({
    queryKey: ["/api/locations"],
  });

  const favoriteLocation = locations?.find(l => l.isFavorite) || locations?.[0];
  const hasValidLocation = favoriteLocation && 
    favoriteLocation.latitude != null && 
    favoriteLocation.longitude != null;

  const { data: recommendations, isLoading: isLoadingRecs } = useQuery<RecommendationResponse>({
    queryKey: ['/api/recommendations/tonight', favoriteLocation?.id],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (favoriteLocation?.id) {
        params.set('locationId', favoriteLocation.id.toString());
      }
      params.set('limit', '8');
      
      const res = await fetch(`/api/recommendations/tonight?${params}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch recommendations');
      return res.json();
    },
    enabled: hasValidLocation,
    staleTime: 5 * 60 * 1000,
  });

  const { toast } = useToast();

  const { data: watchlistItems } = useQuery<WatchlistItem[]>({
    queryKey: ['/api/watchlist'],
    enabled: isAuthenticated,
  });

  const addToWatchlistMutation = useMutation({
    mutationFn: async (objectId: number) => {
      return apiRequest('POST', '/api/watchlist', { objectId, priority: 'medium', notes: '' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/watchlist'] });
      toast({ 
        title: "Added to Watch List", 
        description: "Calculate observation windows on the Watch List page.",
      });
    },
    onError: () => {
      toast({ 
        title: "Error", 
        description: "Failed to add to watch list", 
        variant: "destructive",
      });
    },
  });

  const isInWatchlist = (objectId: number) => {
    if (!watchlistItems) return false;
    return watchlistItems.some(item => item.objectId === objectId);
  };

  const selectedModifier: OpticalModifierSpecs | null = useMemo(() => {
    if (!selectedModifierId || !opticalModifiers) return null;
    const mod = opticalModifiers.find(m => m.id === selectedModifierId);
    if (!mod) return null;
    return { factor: Number(mod.factor), type: mod.type };
  }, [selectedModifierId, opticalModifiers]);

  const constellations = useMemo(() => {
    if (!objects) return [];
    const unique = Array.from(new Set(objects.map(o => o.constellation).filter(Boolean))) as string[];
    return unique.sort();
  }, [objects]);

  const filteredObjects = useMemo(() => {
    if (!objects) return [];
    
    const filtered = objects.filter((obj) => {
      const matchesSearch =
        search === "" ||
        obj.name.toLowerCase().includes(search.toLowerCase()) ||
        obj.catalogId.toLowerCase().includes(search.toLowerCase()) ||
        obj.constellation?.toLowerCase().includes(search.toLowerCase());
      
      const matchesCategory = category === "all" || obj.category === category;
      const matchesDifficulty = difficulty === "all" || obj.difficulty === difficulty;
      const matchesHot = !showHot || obj.isHot;
      const matchesConstellation = constellation === "all" || obj.constellation === constellation;
      
      const matchesMagnitude = 
        obj.magnitude === null || 
        obj.magnitude === undefined ||
        (obj.magnitude >= magnitudeRange[0] && obj.magnitude <= magnitudeRange[1]);
      
      const matchesMonth = 
        selectedMonth === "all" || 
        !obj.bestMonths || 
        obj.bestMonths.length === 0 ||
        obj.bestMonths.includes(selectedMonth);

      return matchesSearch && matchesCategory && matchesDifficulty && matchesHot && 
             matchesConstellation && matchesMagnitude && matchesMonth;
    });

    return filtered.sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.name.localeCompare(b.name);
        case "name_desc":
          return b.name.localeCompare(a.name);
        case "magnitude":
          if (a.magnitude === null) return 1;
          if (b.magnitude === null) return -1;
          return a.magnitude - b.magnitude;
        case "magnitude_desc":
          if (a.magnitude === null) return 1;
          if (b.magnitude === null) return -1;
          return b.magnitude - a.magnitude;
        case "difficulty":
          const aDiff = difficultyOrder[a.difficulty ?? ""] ?? 99;
          const bDiff = difficultyOrder[b.difficulty ?? ""] ?? 99;
          return aDiff - bDiff;
        case "difficulty_desc":
          const aDiff2 = difficultyOrder[a.difficulty ?? ""] ?? 0;
          const bDiff2 = difficultyOrder[b.difficulty ?? ""] ?? 0;
          return bDiff2 - aDiff2;
        case "catalog":
          return a.catalogId.localeCompare(b.catalogId);
        default:
          return 0;
      }
    });
  }, [objects, search, category, difficulty, showHot, constellation, magnitudeRange, selectedMonth, sortBy]);

  const toggleCompare = (obj: CelestialObject) => {
    setCompareObjects(prev => {
      const exists = prev.find(o => o.id === obj.id);
      if (exists) {
        return prev.filter(o => o.id !== obj.id);
      }
      if (prev.length >= 4) {
        return prev;
      }
      return [...prev, obj];
    });
  };

  const isInCompare = (obj: CelestialObject) => {
    return compareObjects.some(o => o.id === obj.id);
  };

  const hasActiveFilters = search || category !== "all" || difficulty !== "all" || 
    showHot || constellation !== "all" || magnitudeRange[0] !== -15 || 
    magnitudeRange[1] !== 15 || selectedMonth !== "all";

  const clearFilters = () => {
    setSearch("");
    setCategory("all");
    setDifficulty("all");
    setShowHot(false);
    setConstellation("all");
    setMagnitudeRange([-15, 15]);
    setSelectedMonth("all");
  };

  const handleObjectClick = (obj: CelestialObject) => {
    setSelectedObject(obj);
    setSheetOpen(true);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Objects Catalog</h1>
          <p className="text-muted-foreground">Browse celestial objects to observe</p>
        </div>
        <Button
          onClick={() => setShowAddCustomDialog(true)}
          className="gap-2"
          data-testid="button-add-custom-object"
        >
          <Plus className="w-4 h-4" />
          Add Custom Object
        </Button>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Search by name, catalog ID, or constellation..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
                data-testid="input-search-objects"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-[160px]" data-testid="select-category">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Select value={difficulty} onValueChange={setDifficulty}>
                <SelectTrigger className="w-[160px]" data-testid="select-difficulty">
                  <SelectValue placeholder="Difficulty" />
                </SelectTrigger>
                <SelectContent>
                  {difficulties.map((diff) => (
                    <SelectItem key={diff.value} value={diff.value}>
                      {diff.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                variant={showHot ? "default" : "outline"}
                onClick={() => setShowHot(!showHot)}
                className="gap-2"
                data-testid="button-filter-wow"
              >
                <Sparkles className="w-4 h-4" />
                Wow
              </Button>

              <Button
                variant={showAdvancedFilters ? "secondary" : "outline"}
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                className="gap-2"
                data-testid="button-advanced-filters"
              >
                <Filter className="w-4 h-4" />
                More Filters
              </Button>

              <div className="flex border rounded-md">
                <Button
                  variant={viewMode === "grid" ? "secondary" : "ghost"}
                  size="icon"
                  onClick={() => setViewMode("grid")}
                  className="rounded-r-none"
                  data-testid="button-view-grid"
                >
                  <Grid3X3 className="w-4 h-4" />
                </Button>
                <Button
                  variant={viewMode === "list" ? "secondary" : "ghost"}
                  size="icon"
                  onClick={() => setViewMode("list")}
                  className="rounded-l-none"
                  data-testid="button-view-list"
                >
                  <List className="w-4 h-4" />
                </Button>
              </div>

              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-[200px]" data-testid="select-sort">
                  <ArrowUpDown className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  {sortOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {showAdvancedFilters && (
            <div className="pt-4 border-t space-y-4">
              <div className="grid md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Constellation</label>
                  <Select value={constellation} onValueChange={setConstellation}>
                    <SelectTrigger data-testid="select-constellation">
                      <SelectValue placeholder="All Constellations" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Constellations</SelectItem>
                      {constellations.map((c) => (
                        <SelectItem key={c} value={c!}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Best Viewing Month</label>
                  <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                    <SelectTrigger data-testid="select-best-month">
                      <SelectValue placeholder="Any Month" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any Month</SelectItem>
                      {months.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Magnitude Range: {magnitudeRange[0]} to {magnitudeRange[1]}
                  </label>
                  <Slider
                    value={magnitudeRange}
                    onValueChange={(v) => setMagnitudeRange(v as [number, number])}
                    min={-15}
                    max={15}
                    step={0.5}
                    className="mt-2"
                    data-testid="slider-magnitude"
                  />
                  <p className="text-xs text-muted-foreground">
                    Lower values = brighter objects (Sun: -27, Full Moon: -13, Brightest stars: -1 to 1)
                  </p>
                </div>
              </div>
              {opticalModifiers && opticalModifiers.length > 0 && (
                <div className="grid md:grid-cols-3 gap-4 pt-4 border-t">
                  <div className="space-y-2">
                    <label className="text-sm font-medium flex items-center gap-2">
                      <Settings2 className="w-4 h-4" />
                      Optical Modifier
                    </label>
                    <Select 
                      value={selectedModifierId?.toString() ?? "none"} 
                      onValueChange={(v) => setSelectedModifierId(v === "none" ? null : parseInt(v))}
                    >
                      <SelectTrigger data-testid="select-optical-modifier">
                        <SelectValue placeholder="No Modifier" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No Modifier</SelectItem>
                        {opticalModifiers.map((mod) => (
                          <SelectItem key={mod.id} value={mod.id.toString()}>
                            {mod.name} ({mod.factor}x)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Affects equipment suitability in object details
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {hasActiveFilters && (
            <div className="flex items-center justify-between pt-2 border-t">
              <span className="text-sm text-muted-foreground">
                Showing {filteredObjects.length} of {objects?.length ?? 0} objects
              </span>
              <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="button-clear-all-filters">
                <X className="w-4 h-4 mr-1" />
                Clear All Filters
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {!hasActiveFilters && hasValidLocation && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-chart-5" />
                <CardTitle className="text-lg">Best for Tonight</CardTitle>
              </div>
              {recommendations?.context && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Moon className="w-4 h-4" />
                  <span>{recommendations.context.moonIllumination}% Moon</span>
                  <span className="text-muted-foreground/50">·</span>
                  <span>{recommendations.context.location.name}</span>
                </div>
              )}
            </div>
            <CardDescription>
              Dynamically scored objects based on visibility, moon, and your equipment
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingRecs ? (
              <div className="flex gap-3 overflow-x-auto pb-2 -mx-6 px-6">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="min-w-[200px] max-w-[200px]">
                    <Skeleton className="h-32" />
                  </div>
                ))}
              </div>
            ) : recommendations?.recommendations && recommendations.recommendations.length > 0 ? (
              <div className="flex gap-3 overflow-x-auto pb-2 -mx-6 px-6">
                {recommendations.recommendations.slice(0, 8).map((rec) => (
                  <div key={rec.objectId} className="min-w-[200px] max-w-[200px]">
                    <Card className="h-full hover-elevate cursor-pointer" data-testid={`card-rec-${rec.catalogId}`}>
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-start justify-between gap-1">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="font-medium text-sm truncate">{rec.name}</p>
                              {rec.isWow && (
                                <Sparkles className="w-3.5 h-3.5 text-chart-4 shrink-0" />
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">{rec.catalogId}</p>
                          </div>
                          <Badge variant={rec.totalScore >= 70 ? "default" : rec.totalScore >= 50 ? "secondary" : "outline"}>
                            {rec.totalScore}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {rec.maxAltitude !== null && (
                            <span className="flex items-center gap-0.5">
                              <TrendingUp className="w-3 h-3" />
                              {rec.maxAltitude.toFixed(0)}°
                            </span>
                          )}
                          {rec.transitTime && (
                            <span className="flex items-center gap-0.5">
                              <Clock className="w-3 h-3" />
                              {new Date(rec.transitTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                        </div>
                        {rec.rationale.length > 0 && (
                          <p className="text-xs text-muted-foreground line-clamp-2">{rec.rationale[0]}</p>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-muted-foreground">
                <Target className="w-6 h-6 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No recommendations available</p>
              </div>
            )}
            {recommendations && recommendations.totalRecommendations > 0 && (
              <div className="mt-3 pt-3 border-t flex items-center justify-between text-xs text-muted-foreground">
                <span>{recommendations.totalRecommendations} objects scored for tonight</span>
                <span className="flex items-center gap-1">
                  <Target className="w-3 h-3" />
                  Scores include visibility, moon impact, conditions & equipment fit
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}
      
      {!hasActiveFilters && !hasValidLocation && locations && locations.length === 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-chart-5" />
              <CardTitle className="text-lg">Best for Tonight</CardTitle>
            </div>
            <CardDescription>Add a location to get personalized recommendations</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-6">
              <Target className="w-8 h-8 mx-auto mb-3 text-muted-foreground opacity-50" />
              <p className="text-sm text-muted-foreground mb-3">
                Add an observing location with coordinates to see which objects are best for tonight
              </p>
              <Button variant="outline" size="sm" asChild>
                <Link href="/locations" data-testid="button-add-location-for-recs">
                  Add Location
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div>
        {isLoading ? (
          <div className={cn(
            viewMode === "grid" 
              ? "grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
              : "space-y-3"
          )}>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <Skeleton key={i} className={viewMode === "grid" ? "h-40" : "h-20"} />
            ))}
          </div>
        ) : filteredObjects.length > 0 ? (
          viewMode === "grid" ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredObjects.map((obj) => (
                <div key={obj.id} className="relative group">
                  <ObjectCard object={obj} onClick={() => handleObjectClick(obj)} />
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant={isInWatchlist(obj.id) ? "secondary" : "outline"}
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!isInWatchlist(obj.id)) {
                              addToWatchlistMutation.mutate(obj.id);
                            }
                          }}
                          disabled={isInWatchlist(obj.id) || addToWatchlistMutation.isPending}
                          data-testid={`button-watchlist-${obj.catalogId}`}
                        >
                          {isInWatchlist(obj.id) ? (
                            <BookmarkCheck className="w-3.5 h-3.5" />
                          ) : (
                            <Bookmark className="w-3.5 h-3.5" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {isInWatchlist(obj.id) ? "In Watch List" : "Add to Watch List"}
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant={isInCompare(obj) ? "default" : "outline"}
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleCompare(obj);
                          }}
                          disabled={!isInCompare(obj) && compareObjects.length >= 4}
                          data-testid={`button-compare-${obj.catalogId}`}
                        >
                          {isInCompare(obj) ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {isInCompare(obj) ? "Remove from compare" : compareObjects.length >= 4 ? "Max 4 objects" : "Add to compare"}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredObjects.map((obj) => (
                <Card 
                  key={obj.id} 
                  className="hover-elevate cursor-pointer" 
                  data-testid={`row-object-${obj.catalogId}`}
                  onClick={() => handleObjectClick(obj)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <div className="flex gap-1 shrink-0">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant={isInWatchlist(obj.id) ? "secondary" : "outline"}
                              size="icon"
                              className="h-7 w-7"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!isInWatchlist(obj.id)) {
                                  addToWatchlistMutation.mutate(obj.id);
                                }
                              }}
                              disabled={isInWatchlist(obj.id) || addToWatchlistMutation.isPending}
                              data-testid={`button-watchlist-list-${obj.catalogId}`}
                            >
                              {isInWatchlist(obj.id) ? (
                                <BookmarkCheck className="w-3.5 h-3.5" />
                              ) : (
                                <Bookmark className="w-3.5 h-3.5" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {isInWatchlist(obj.id) ? "In Watch List" : "Add to Watch List"}
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant={isInCompare(obj) ? "default" : "outline"}
                              size="icon"
                              className="h-7 w-7"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleCompare(obj);
                              }}
                              disabled={!isInCompare(obj) && compareObjects.length >= 4}
                              data-testid={`button-compare-list-${obj.catalogId}`}
                            >
                              {isInCompare(obj) ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {isInCompare(obj) ? "Remove from compare" : compareObjects.length >= 4 ? "Max 4 objects" : "Add to compare"}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm text-muted-foreground">
                            {obj.catalogId}
                          </span>
                          {obj.isHot && <Sparkles className="w-3.5 h-3.5 text-chart-5" />}
                          <span className="font-semibold truncate">{obj.name}</span>
                        </div>
                      </div>
                      <Badge variant="outline" className="capitalize shrink-0">
                        {obj.category.replace("_", " ")}
                      </Badge>
                      {obj.difficulty && (
                        <Badge variant="secondary" className="capitalize shrink-0">
                          {obj.difficulty}
                        </Badge>
                      )}
                      {obj.constellation && (
                        <span className="text-sm text-muted-foreground shrink-0">
                          {obj.constellation}
                        </span>
                      )}
                      {obj.magnitude !== null && obj.magnitude !== undefined && (
                        <span className="font-mono text-sm text-muted-foreground shrink-0">
                          mag {obj.magnitude.toFixed(1)}
                        </span>
                      )}
                      {obj.category === "double_star" && obj.separation != null && (
                        <span className="font-mono text-sm text-muted-foreground shrink-0">
                          {obj.separation.toFixed(1)}"
                        </span>
                      )}
                      {obj.bestMonths && obj.bestMonths.length > 0 && (
                        <span className="text-xs text-muted-foreground shrink-0">
                          Best: {obj.bestMonths.slice(0, 3).join(", ").toUpperCase()}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )
        ) : (
          <Card>
            <CardContent className="py-16 text-center">
              <Star className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium mb-2">No objects found</h3>
              <p className="text-muted-foreground max-w-md mx-auto">
                {hasActiveFilters
                  ? "Try adjusting your search or filters"
                  : "Objects will appear here once catalog data is loaded"}
              </p>
              {hasActiveFilters && (
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={clearFilters}
                  data-testid="button-clear-filters"
                >
                  Clear Filters
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {compareObjects.length > 0 && (
        <Card className="sticky bottom-4 border-2 border-primary/30 shadow-lg">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <GitCompareArrows className="w-5 h-5 text-primary" />
                <CardTitle className="text-lg">Compare Objects ({compareObjects.length}/4)</CardTitle>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCompareObjects([])}
                data-testid="button-clear-compare"
              >
                <X className="w-4 h-4 mr-1" />
                Clear All
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px]">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 text-sm font-medium text-muted-foreground">Object</th>
                    <th className="text-left py-2 px-3 text-sm font-medium text-muted-foreground">Category</th>
                    <th className="text-left py-2 px-3 text-sm font-medium text-muted-foreground">Constellation</th>
                    <th className="text-right py-2 px-3 text-sm font-medium text-muted-foreground">Magnitude</th>
                    <th className="text-left py-2 px-3 text-sm font-medium text-muted-foreground">Difficulty</th>
                    <th className="text-left py-2 px-3 text-sm font-medium text-muted-foreground">Best Months</th>
                    <th className="py-2 px-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {compareObjects.map((obj) => (
                    <tr key={obj.id} className="border-b last:border-b-0" data-testid={`compare-row-${obj.catalogId}`}>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground">{obj.catalogId}</span>
                          <span className="font-medium">{obj.name}</span>
                          {obj.isHot && <Sparkles className="w-3.5 h-3.5 text-chart-5" />}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <Badge variant="outline" className="capitalize">
                          {obj.category.replace("_", " ")}
                        </Badge>
                      </td>
                      <td className="py-3 px-3 text-sm">{obj.constellation || "—"}</td>
                      <td className="py-3 px-3 text-right font-mono text-sm">
                        {obj.magnitude !== null && obj.magnitude !== undefined ? obj.magnitude.toFixed(1) : "—"}
                      </td>
                      <td className="py-3 px-3">
                        {obj.difficulty ? (
                          <Badge variant="secondary" className="capitalize">{obj.difficulty}</Badge>
                        ) : "—"}
                      </td>
                      <td className="py-3 px-3 text-xs text-muted-foreground">
                        {obj.bestMonths && obj.bestMonths.length > 0 
                          ? obj.bestMonths.map(m => m.toUpperCase()).join(", ")
                          : "—"
                        }
                      </td>
                      <td className="py-3 px-3">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => toggleCompare(obj)}
                          data-testid={`button-remove-compare-${obj.catalogId}`}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <ObjectDetailSheet
        object={selectedObject}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        opticalModifier={selectedModifier}
      />

      <AddCustomObjectDialog
        open={showAddCustomDialog}
        onOpenChange={setShowAddCustomDialog}
      />
    </div>
  );
}
