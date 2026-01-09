import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScoreDisplay } from "@/components/ScoreDisplay";
import { Cloud, Wind, Droplets, Moon, Edit2, Save, Loader2, Sun, Eye, Info, Star, MapPin, Download, AlertCircle, Satellite, Calculator, PencilLine, ExternalLink } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import type { NightConditions, Location } from "@shared/schema";

interface TonightConditionsWidgetProps {
  locations: Location[];
}

type PowerClass = 'HIGH' | 'MID' | 'LOW';
type BadgeVariant = 'default' | 'secondary' | 'outline' | 'destructive';

// Data source types for weather metrics
type DataSource = 'actual' | 'estimated' | 'calculated' | 'manual' | null;

interface SourceMap {
  lowCloudPct: DataSource;
  midCloudPct: DataSource;
  highCloudPct: DataSource;
  humidity: DataSource;
  seeingArcsec: DataSource;
  jetStreamIndex: DataSource;
  moonIllumination: DataSource;
}

const initialSourceMap: SourceMap = {
  lowCloudPct: null,
  midCloudPct: null,
  highCloudPct: null,
  humidity: null,
  seeingArcsec: null,
  jetStreamIndex: null,
  moonIllumination: null,
};

// Source badge component with tooltip
function SourceBadge({ source, className }: { source: DataSource; className?: string }) {
  if (!source) return null;
  
  const config = {
    actual: { 
      icon: Satellite, 
      label: 'Actual', 
      tooltip: 'Measured by weather station or satellite',
      className: 'border-chart-2 text-chart-2'
    },
    estimated: { 
      icon: Calculator, 
      label: 'Est.', 
      tooltip: 'Estimated from weather conditions',
      className: 'border-chart-5 text-chart-5'
    },
    calculated: { 
      icon: Calculator, 
      label: 'Calc.', 
      tooltip: 'Calculated astronomically',
      className: 'border-chart-4 text-chart-4'
    },
    manual: { 
      icon: PencilLine, 
      label: 'Manual', 
      tooltip: 'You adjusted this value',
      className: 'border-muted-foreground text-muted-foreground'
    },
  };
  
  const { icon: Icon, label, tooltip, className: badgeClassName } = config[source];
  
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge 
          variant="outline" 
          className={`text-[10px] px-1.5 py-0 h-4 cursor-help ${badgeClassName} ${className || ''}`}
        >
          <Icon className="w-2.5 h-2.5 mr-0.5" />
          {label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <p className="text-xs">{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function getPowerClassColor(powerClass: PowerClass): BadgeVariant {
  switch (powerClass) {
    case 'HIGH': return 'default';
    case 'MID': return 'secondary';
    case 'LOW': return 'outline';
  }
}

function getPowerClassLabel(powerClass: PowerClass): string {
  switch (powerClass) {
    case 'HIGH': return 'HIGH Power';
    case 'MID': return 'MID Power';
    case 'LOW': return 'LOW Power';
  }
}

function getDefaultLocationId(locations: Location[], savedConditions?: NightConditions | null): number | undefined {
  if (savedConditions?.locationId) {
    const savedLocation = locations.find(l => l.id === savedConditions.locationId);
    if (savedLocation) return savedLocation.id;
  }
  const favorite = locations.find(l => l.isFavorite);
  if (favorite) return favorite.id;
  return locations[0]?.id;
}

export function TonightConditionsWidget({ locations }: TonightConditionsWidgetProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isFetchingWeather, setIsFetchingWeather] = useState(false);
  
  const [conditions, setConditions] = useState({
    lowCloudPct: 20,
    midCloudPct: 20,
    highCloudPct: 20,
    seeingArcsec: 1.5,
    jetStreamIndex: 30,
    humidity: 50,
    moonIllumination: 50,
  });

  // Track data source for each weather metric (actual/estimated/calculated/manual)
  const [sources, setSources] = useState<SourceMap>({ ...initialSourceMap });

  // Fetch tonight's conditions (per-user per-night, not per-location)
  const { data: savedConditions, isLoading } = useQuery<NightConditions>({
    queryKey: ['/api/night-conditions/tonight'],
    queryFn: async () => {
      const res = await fetch('/api/night-conditions/tonight', { credentials: 'include' });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('Failed to fetch conditions');
      return res.json();
    },
    enabled: !!user,
    retry: false,
  });
  
  const [selectedLocationId, setSelectedLocationId] = useState<number | undefined>();
  const [displayLocationId, setDisplayLocationId] = useState<number | undefined>();
  
  const effectiveLocationId = displayLocationId ?? getDefaultLocationId(locations, savedConditions);
  const selectedLocation = locations.find(l => l.id === effectiveLocationId);

  // Fetch weather data from Open-Meteo API
  const handleFetchWeather = async () => {
    if (!selectedLocation?.latitude || !selectedLocation?.longitude) {
      toast({ description: "Location must have coordinates to fetch weather", variant: "destructive" });
      return;
    }

    setIsFetchingWeather(true);
    try {
      const response = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${selectedLocation.latitude}&longitude=${selectedLocation.longitude}&current=weather_code,cloud_cover_low,cloud_cover_mid,cloud_cover_high,relative_humidity_2m,wind_speed_10m,visibility&timezone=auto`
      );
      const data = await response.json();
      const current = data.current;

      if (!current) throw new Error('No weather data available');

      // Calculate moon phase (simplified)
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const day = now.getDate();
      const c = Math.floor((month - 3) / 12);
      const s = Math.floor(365.25 * (year + 4800 + c) - 2.75 + day + 31 * month);
      const moonPhase = ((s - 2451550.1) % 29.53) / 29.53;
      const moonIllum = Math.round(((1 + Math.cos(moonPhase * 2 * Math.PI)) / 2) * 100);

      // Map weather code to seeing conditions (simplified: lower code = clearer)
      const seeingMap: Record<number, number> = {
        0: 0.5, 1: 0.7, 2: 0.9, 3: 1.2, 45: 2.0, 48: 2.5, 51: 2.2, 53: 2.5, 55: 2.8,
        61: 3.0, 63: 3.2, 65: 3.5, 71: 2.5, 73: 3.0, 75: 3.5, 77: 3.2, 80: 2.8, 81: 3.2,
        82: 3.5, 85: 3.8, 86: 4.0, 95: 4.0, 96: 4.0, 99: 4.0,
      };
      const seeing = seeingMap[current.weather_code] || 1.5;

      // Estimate jet stream from wind speed (higher wind = higher jet stream index)
      const jetStream = Math.min(100, Math.round((current.wind_speed_10m / 30) * 100));

      // Update conditions with fetched data - only update if API returned values
      const hasLowCloud = current.cloud_cover_low !== undefined && current.cloud_cover_low !== null;
      const hasMidCloud = current.cloud_cover_mid !== undefined && current.cloud_cover_mid !== null;
      const hasHighCloud = current.cloud_cover_high !== undefined && current.cloud_cover_high !== null;
      const hasHumidity = current.relative_humidity_2m !== undefined && current.relative_humidity_2m !== null;
      const hasWeatherCode = current.weather_code !== undefined;
      const hasWindSpeed = current.wind_speed_10m !== undefined;

      const newConditions = {
        ...conditions,
        lowCloudPct: hasLowCloud ? current.cloud_cover_low : conditions.lowCloudPct,
        midCloudPct: hasMidCloud ? current.cloud_cover_mid : conditions.midCloudPct,
        highCloudPct: hasHighCloud ? current.cloud_cover_high : conditions.highCloudPct,
        humidity: hasHumidity ? current.relative_humidity_2m : conditions.humidity,
        seeingArcsec: hasWeatherCode ? seeing : conditions.seeingArcsec,
        jetStreamIndex: hasWindSpeed ? jetStream : conditions.jetStreamIndex,
        moonIllumination: moonIllum, // Moon is always calculated
      };

      setConditions(newConditions);
      // Only set sources for fields that actually received new data from API
      setSources(prev => ({
        lowCloudPct: hasLowCloud ? 'actual' : prev.lowCloudPct,
        midCloudPct: hasMidCloud ? 'actual' : prev.midCloudPct,
        highCloudPct: hasHighCloud ? 'actual' : prev.highCloudPct,
        humidity: hasHumidity ? 'actual' : prev.humidity,
        seeingArcsec: hasWeatherCode ? 'estimated' : prev.seeingArcsec,
        jetStreamIndex: hasWindSpeed ? 'estimated' : prev.jetStreamIndex,
        moonIllumination: 'calculated', // Moon is always calculated
      }));
      toast({ description: "Weather data loaded successfully" });
    } catch (error) {
      console.error('Weather fetch error:', error);
      toast({ description: "Failed to fetch weather data", variant: "destructive" });
    } finally {
      setIsFetchingWeather(false);
    }
  };

  const saveMutation = useMutation({
    mutationFn: async (data: typeof conditions & { locationId?: number; bortle?: number }) => {
      return apiRequest('POST', '/api/night-conditions', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/night-conditions/tonight'] });
      queryClient.invalidateQueries({ queryKey: ['/api/recommendations/tonight'] });
      setIsOpen(false);
    },
  });

  const handleSave = () => {
    const editLocationId = selectedLocationId ?? effectiveLocationId;
    const location = locations.find(l => l.id === editLocationId);
    saveMutation.mutate({
      ...conditions,
      locationId: editLocationId,
      bortle: location?.bortle ?? 5,
    });
  };

  // Helper to mark a field as manually edited
  const markAsManual = (field: keyof SourceMap) => {
    setSources(prev => ({ ...prev, [field]: 'manual' }));
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      if (savedConditions) {
        setConditions({
          lowCloudPct: savedConditions.lowCloudPct ?? 20,
          midCloudPct: savedConditions.midCloudPct ?? 20,
          highCloudPct: savedConditions.highCloudPct ?? 20,
          seeingArcsec: savedConditions.seeingArcsec ?? 1.5,
          jetStreamIndex: savedConditions.jetStreamIndex ?? 30,
          humidity: savedConditions.humidity ?? 50,
          moonIllumination: savedConditions.moonIllumination ?? 50,
        });
      }
      setSelectedLocationId(effectiveLocationId);
      setSources({ ...initialSourceMap });
    } else {
      setSelectedLocationId(undefined);
      setSources({ ...initialSourceMap });
    }
  };

  const hasConditions = !!savedConditions;
  const displayConditions = savedConditions ?? null;

  const sortedLocations = [...locations].sort((a, b) => {
    if (a.isFavorite && !b.isFavorite) return -1;
    if (!a.isFavorite && b.isFavorite) return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <Card data-testid="card-tonight-conditions">
      <CardHeader className="pb-2 space-y-0">
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Tonight's Conditions</CardTitle>
          <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            {hasConditions && (
              <DialogTrigger asChild>
                <Button 
                  variant="ghost"
                  size="icon"
                  data-testid="button-log-conditions"
                >
                  <Edit2 className="w-4 h-4" />
                  <span className="sr-only">Edit conditions</span>
                </Button>
              </DialogTrigger>
            )}
            <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
              <DialogHeader>
                <DialogTitle>Tonight's Conditions</DialogTitle>
                <DialogDescription>
                  Enter the current atmospheric conditions to calculate observing scores
                </DialogDescription>
              </DialogHeader>
            <div className="space-y-6 py-4 overflow-y-auto flex-1 pr-2">
              {locations.length > 0 && (
                <div className="space-y-2">
                  <Label>Location</Label>
                  <div className="flex gap-2">
                    <Select 
                      value={selectedLocationId?.toString()} 
                      onValueChange={(v) => setSelectedLocationId(parseInt(v))}
                    >
                      <SelectTrigger data-testid="select-location" className="flex-1">
                        <SelectValue placeholder="Select location" />
                      </SelectTrigger>
                      <SelectContent>
                        {sortedLocations.map((loc) => (
                          <SelectItem key={loc.id} value={loc.id.toString()}>
                            <div className="flex items-center gap-1.5">
                              {loc.isFavorite && <Star className="w-3 h-3 text-amber-500 fill-amber-500" />}
                              <span>{loc.name}</span>
                              <span className="text-muted-foreground">(Bortle {loc.bortle})</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={handleFetchWeather}
                      disabled={isFetchingWeather || !selectedLocation?.latitude}
                      className="whitespace-nowrap"
                      data-testid="button-fetch-weather"
                    >
                      {isFetchingWeather ? (
                        <>
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          Fetching...
                        </>
                      ) : (
                        <>
                          <Download className="w-3 h-3 mr-1" />
                          Weather
                        </>
                      )}
                    </Button>
                  </div>
                  {selectedLocation && !selectedLocation.latitude && (
                    <p className="text-xs text-amber-600 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      Location needs coordinates for weather data
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Cloud className="w-4 h-4" />
                  Cloud Coverage
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-1">
                      <Label className="text-xs text-muted-foreground">Low</Label>
                      <SourceBadge source={sources.lowCloudPct} />
                    </div>
                    <Slider
                      value={[conditions.lowCloudPct]}
                      onValueChange={([v]) => { setConditions(c => ({ ...c, lowCloudPct: v })); markAsManual('lowCloudPct'); }}
                      min={0}
                      max={100}
                      step={1}
                      data-testid="slider-low-clouds"
                    />
                    <p className="text-xs text-center font-mono">{conditions.lowCloudPct}%</p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-1">
                      <Label className="text-xs text-muted-foreground">Mid</Label>
                      <SourceBadge source={sources.midCloudPct} />
                    </div>
                    <Slider
                      value={[conditions.midCloudPct]}
                      onValueChange={([v]) => { setConditions(c => ({ ...c, midCloudPct: v })); markAsManual('midCloudPct'); }}
                      min={0}
                      max={100}
                      step={1}
                      data-testid="slider-mid-clouds"
                    />
                    <p className="text-xs text-center font-mono">{conditions.midCloudPct}%</p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-1">
                      <Label className="text-xs text-muted-foreground">High</Label>
                      <SourceBadge source={sources.highCloudPct} />
                    </div>
                    <Slider
                      value={[conditions.highCloudPct]}
                      onValueChange={([v]) => { setConditions(c => ({ ...c, highCloudPct: v })); markAsManual('highCloudPct'); }}
                      min={0}
                      max={100}
                      step={1}
                      data-testid="slider-high-clouds"
                    />
                    <p className="text-xs text-center font-mono">{conditions.highCloudPct}%</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Eye className="w-4 h-4" />
                  Seeing (Arcseconds)
                  <SourceBadge source={sources.seeingArcsec} />
                </div>
                <Slider
                  value={[conditions.seeingArcsec]}
                  onValueChange={([v]) => { setConditions(c => ({ ...c, seeingArcsec: v })); markAsManual('seeingArcsec'); }}
                  min={0.5}
                  max={4}
                  step={0.1}
                  data-testid="slider-seeing"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Excellent (0.5")</span>
                  <span className="font-mono">{conditions.seeingArcsec.toFixed(1)}"</span>
                  <span>Poor (4.0")</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Wind className="w-4 h-4" />
                  Jetstream Index (0-100)
                  <SourceBadge source={sources.jetStreamIndex} />
                </div>
                <Slider
                  value={[conditions.jetStreamIndex]}
                  onValueChange={([v]) => { setConditions(c => ({ ...c, jetStreamIndex: v })); markAsManual('jetStreamIndex'); }}
                  min={0}
                  max={100}
                  step={1}
                  data-testid="slider-jetstream"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Calm (0)</span>
                  <span className="font-mono">{conditions.jetStreamIndex}</span>
                  <span>Strong (100)</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Droplets className="w-4 h-4" />
                  Humidity
                  <SourceBadge source={sources.humidity} />
                </div>
                <Slider
                  value={[conditions.humidity]}
                  onValueChange={([v]) => { setConditions(c => ({ ...c, humidity: v })); markAsManual('humidity'); }}
                  min={0}
                  max={100}
                  step={1}
                  data-testid="slider-humidity"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Dry (0%)</span>
                  <span className="font-mono">{conditions.humidity}%</span>
                  <span>Humid (100%)</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Moon className="w-4 h-4" />
                  Moon Illumination
                  <SourceBadge source={sources.moonIllumination} />
                </div>
                <Slider
                  value={[conditions.moonIllumination]}
                  onValueChange={([v]) => { setConditions(c => ({ ...c, moonIllumination: v })); markAsManual('moonIllumination'); }}
                  min={0}
                  max={100}
                  step={1}
                  data-testid="slider-moon"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>New (0%)</span>
                  <span className="font-mono">{conditions.moonIllumination}%</span>
                  <span>Full (100%)</span>
                </div>
              </div>

              <Button 
                onClick={handleSave} 
                className="w-full"
                disabled={saveMutation.isPending}
                data-testid="button-save-conditions"
              >
                {saveMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Save & Calculate Scores
                  </>
                )}
              </Button>
              
              <div className="mt-4 pt-4 border-t space-y-3">
                <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium">Source:</span>
                  <span className="flex items-center gap-1"><Satellite className="w-3 h-3 text-chart-2" /> Actual</span>
                  <span className="flex items-center gap-1"><Calculator className="w-3 h-3 text-chart-5" /> Estimated</span>
                  <span className="flex items-center gap-1"><PencilLine className="w-3 h-3" /> Manual</span>
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  Validate seeing conditions at{" "}
                  <a 
                    href="https://www.meteoblue.com/en/weather/outdoorsports/seeing/"
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-0.5"
                    data-testid="link-meteoblue-validation"
                  >
                    Meteoblue Seeing Forecast
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </p>
              </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <Select 
            value={effectiveLocationId?.toString() ?? ""} 
            onValueChange={(v) => v && setDisplayLocationId(parseInt(v))}
          >
            <SelectTrigger className="h-7 w-auto max-w-[220px] text-sm px-2" data-testid="select-display-location">
              <MapPin className="w-3 h-3 shrink-0 mr-1.5" />
              <span className="truncate">
                {locations.length === 0 
                  ? "No locations" 
                  : sortedLocations.find(l => l.id === effectiveLocationId)?.name ?? "Select location"}
              </span>
            </SelectTrigger>
            <SelectContent className="min-w-[220px]">
              {locations.length === 0 ? (
                <div className="p-2 text-sm text-muted-foreground">No locations created yet</div>
              ) : (
                sortedLocations.map((loc) => (
                  <SelectItem key={loc.id} value={loc.id.toString()}>
                    <div className="flex items-center gap-2">
                      {loc.isFavorite && <Star className="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" />}
                      <span>{loc.name}</span>
                      <span className="text-xs text-muted-foreground ml-auto">Bortle {loc.bortle}</span>
                    </div>
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          {effectiveLocationId && sortedLocations.find(l => l.id === effectiveLocationId) && (
            <Badge variant="outline" className="shrink-0 text-xs h-6">
              Bortle {sortedLocations.find(l => l.id === effectiveLocationId)?.bortle}
            </Badge>
          )}
        </div>
        <CardDescription className="flex items-center gap-1 mt-1">
          {hasConditions 
            ? "Observing quality based on logged conditions"
            : "Log tonight's conditions to evaluate observing quality"}
          {hasConditions && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-5 w-5 p-0 ml-1" data-testid="button-score-info">
                  <Info className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                  <span className="sr-only">Score explanation</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 text-sm" align="start">
                <div className="space-y-3">
                  <h4 className="font-medium">How Scores Are Calculated</h4>
                  <div className="space-y-2 text-muted-foreground">
                    <div>
                      <span className="font-medium text-foreground">Cloud Score (0-4):</span> Lower cloud coverage = higher score. Clear skies earn maximum points.
                    </div>
                    <div>
                      <span className="font-medium text-foreground">Seeing Score (0-3):</span> Better atmospheric stability (lower arcseconds) = higher score. Critical for planets.
                    </div>
                    <div>
                      <span className="font-medium text-foreground">Jet Stream (0-2):</span> Calmer jet stream = higher score. High-altitude winds blur images.
                    </div>
                    <div>
                      <span className="font-medium text-foreground">Humidity (-1 to 0):</span> High humidity (&gt;80%) reduces visibility and adds a penalty.
                    </div>
                    <div>
                      <span className="font-medium text-foreground">Moon Impact (0-2):</span> New moon is best for deep-sky objects. Full moon washes out faint targets.
                    </div>
                  </div>
                  <div className="pt-2 border-t text-xs text-muted-foreground">
                    <p><strong>Planet Score</strong> emphasizes seeing conditions.</p>
                    <p><strong>DSO Score</strong> emphasizes darkness and moon phase.</p>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : hasConditions && displayConditions ? (
          <div className="flex flex-col lg:flex-row gap-6">
            <div className="flex gap-4 sm:gap-6 justify-center lg:justify-start shrink-0">
              <ScoreDisplay
                score={Math.round((displayConditions.totalScore ?? 0) * 10)}
                maxScore={100}
                label="Total Score"
                size="lg"
              />
              <div className="flex flex-col gap-3 sm:gap-4 justify-center">
                <ScoreDisplay
                  score={Math.round((displayConditions.planetScore ?? 0) * 10)}
                  maxScore={100}
                  label="Planets"
                  size="sm"
                />
                <ScoreDisplay
                  score={Math.round((displayConditions.dsoScore ?? 0) * 10)}
                  maxScore={100}
                  label="Deep Sky"
                  size="sm"
                />
              </div>
            </div>
            <div className="flex-1 min-w-0 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground">Power Class</span>
                <Badge 
                  variant={getPowerClassColor(displayConditions.powerClass as PowerClass ?? 'MID')}
                  data-testid="badge-power-class"
                >
                  {getPowerClassLabel(displayConditions.powerClass as PowerClass ?? 'MID')}
                </Badge>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground">Moon Phase</span>
                <div className="flex items-center gap-2">
                  <div className="w-16 sm:w-24 h-2 rounded-full bg-muted/30 overflow-hidden">
                    <div 
                      className="h-full bg-chart-4 rounded-full transition-all"
                      style={{ width: `${displayConditions.moonIllumination ?? 0}%` }}
                    />
                  </div>
                  <span className="font-mono text-sm text-muted-foreground">
                    {displayConditions.moonIllumination ?? 0}%
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <div className="flex items-center gap-1.5">
                  <Cloud className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">Clouds:</span>
                  <span className="font-mono">
                    {Math.max(
                      displayConditions.lowCloudPct ?? 0,
                      displayConditions.midCloudPct ?? 0,
                      displayConditions.highCloudPct ?? 0
                    )}%
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">Seeing:</span>
                  <span className="font-mono">{displayConditions.seeingArcsec?.toFixed(1) ?? '?'}"</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Wind className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">Jetstream:</span>
                  <span className="font-mono">{displayConditions.jetStreamIndex ?? '?'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Droplets className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">Humidity:</span>
                  <span className="font-mono">{displayConditions.humidity ?? '?'}%</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground pt-1">
                Last updated: {new Date(displayConditions.updatedAt ?? displayConditions.createdAt ?? Date.now()).toLocaleTimeString()}
              </p>
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <Cloud className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
            <p className="text-muted-foreground mb-2">No conditions logged for tonight</p>
            <p className="text-sm text-muted-foreground/70 mb-4">
              Log the current atmospheric conditions to see your observing scores
            </p>
            <Button 
              onClick={() => setIsOpen(true)}
              data-testid="button-log-conditions-empty"
            >
              <Sun className="w-4 h-4 mr-2" />
              Log Tonight's Conditions
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
