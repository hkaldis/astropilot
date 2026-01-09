import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { 
  Sun, 
  Moon, 
  Clock, 
  Eye, 
  Sunrise, 
  Sunset,
  Star,
  CircleDot,
  AlertTriangle,
  CheckCircle2,
  Calendar
} from "lucide-react";
import { format, parseISO, differenceInMinutes, isAfter, isBefore } from "date-fns";
import type { Location } from "@shared/schema";

interface TwilightTimes {
  civilDawn: string | null;
  nauticalDawn: string | null;
  astronomicalDawn: string | null;
  sunrise: string | null;
  sunset: string | null;
  civilDusk: string | null;
  nauticalDusk: string | null;
  astronomicalDusk: string | null;
}

interface MoonData {
  phase: number;
  illumination: number;
  phaseName: string;
  riseTime: string | null;
  setTime: string | null;
  transitTime: string | null;
  altitude: number;
  azimuth: number;
  isAboveHorizon: boolean;
}

interface ObservationWindow {
  start: string;
  end: string;
  durationHours: number;
  quality: 'excellent' | 'good' | 'fair' | 'poor';
  moonFreeHours: number;
  description: string;
}

interface CelestialEvent {
  type: 'conjunction' | 'opposition' | 'elongation' | 'lunar_phase' | 'meteor_shower';
  name: string;
  date: string;
  description: string;
  bodies?: string[];
  magnitude?: number;
}

interface PlanetVisibility {
  name: string;
  isVisible: boolean;
  bestTime: string | null;
  altitude: number;
}

interface TonightSummary {
  twilight: TwilightTimes;
  moon: MoonData;
  observationWindow: ObservationWindow;
  upcomingEvents: CelestialEvent[];
  planetVisibility: PlanetVisibility[];
}

interface TonightSummaryWidgetProps {
  location: Location | null;
}

function formatTime(isoString: string | null | undefined): string {
  if (!isoString) return '--:--';
  try {
    return format(parseISO(isoString), 'h:mm a');
  } catch {
    return '--:--';
  }
}

function formatTimeShort(isoString: string | null | undefined): string {
  if (!isoString) return '--:--';
  try {
    return format(parseISO(isoString), 'HH:mm');
  } catch {
    return '--:--';
  }
}

function getQualityColor(quality: string): string {
  switch (quality) {
    case 'excellent': return 'text-green-500';
    case 'good': return 'text-blue-500';
    case 'fair': return 'text-yellow-500';
    case 'poor': return 'text-red-500';
    default: return 'text-muted-foreground';
  }
}

function getQualityBadge(quality: string): string {
  switch (quality) {
    case 'excellent': return 'bg-green-500/10 text-green-500 border-green-500/30';
    case 'good': return 'bg-blue-500/10 text-blue-500 border-blue-500/30';
    case 'fair': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30';
    case 'poor': return 'bg-red-500/10 text-red-500 border-red-500/30';
    default: return '';
  }
}

function getMoonPhaseEmoji(phaseName: string): string {
  switch (phaseName) {
    case 'New Moon': return '🌑';
    case 'Waxing Crescent': return '🌒';
    case 'First Quarter': return '🌓';
    case 'Waxing Gibbous': return '🌔';
    case 'Full Moon': return '🌕';
    case 'Waning Gibbous': return '🌖';
    case 'Last Quarter': return '🌗';
    case 'Waning Crescent': return '🌘';
    default: return '🌙';
  }
}

export function TonightSummaryWidget({ location }: TonightSummaryWidgetProps) {
  const { user } = useAuth();
  const hasValidCoords = !!(location && location.latitude != null && location.longitude != null);
  
  const { data: summary, isLoading } = useQuery<TonightSummary>({
    queryKey: ['/api/astronomy/tonight', location?.latitude, location?.longitude],
    queryFn: async () => {
      const res = await fetch(`/api/astronomy/tonight?latitude=${location!.latitude}&longitude=${location!.longitude}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch tonight summary');
      return res.json();
    },
    enabled: !!user && hasValidCoords,
  });

  if (!location) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <Moon className="w-5 h-5" />
            Tonight at a Glance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4 text-muted-foreground">
            <Moon className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Add a location to see tonight's summary</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <Moon className="w-5 h-5" />
            Tonight at a Glance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20" />
          <Skeleton className="h-16" />
          <Skeleton className="h-24" />
        </CardContent>
      </Card>
    );
  }

  const now = new Date();
  const windowStart = summary?.observationWindow.start ? parseISO(summary.observationWindow.start) : null;
  const windowEnd = summary?.observationWindow.end ? parseISO(summary.observationWindow.end) : null;
  
  let windowStatus = 'upcoming';
  let timeUntilWindow = '';
  
  if (windowStart && windowEnd) {
    if (isAfter(now, windowStart) && isBefore(now, windowEnd)) {
      windowStatus = 'active';
      const minutesLeft = differenceInMinutes(windowEnd, now);
      timeUntilWindow = `${Math.floor(minutesLeft / 60)}h ${minutesLeft % 60}m remaining`;
    } else if (isBefore(now, windowStart)) {
      windowStatus = 'upcoming';
      const minutesUntil = differenceInMinutes(windowStart, now);
      timeUntilWindow = `Starts in ${Math.floor(minutesUntil / 60)}h ${minutesUntil % 60}m`;
    } else {
      windowStatus = 'ended';
      timeUntilWindow = 'Window has ended';
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Moon className="w-5 h-5 text-indigo-500" />
            <CardTitle>Tonight at a Glance</CardTitle>
          </div>
          <Badge variant="outline" className="text-xs">
            {location.name}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {summary?.observationWindow && (
          <div className={`p-3 rounded-lg border ${
            windowStatus === 'active' ? 'bg-green-500/10 border-green-500/30' :
            windowStatus === 'upcoming' ? 'bg-blue-500/10 border-blue-500/30' :
            'bg-muted/50 border-border'
          }`}>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4" />
                <span className="font-medium text-sm">Observation Window</span>
              </div>
              <Badge className={getQualityBadge(summary.observationWindow.quality)}>
                {summary.observationWindow.quality}
              </Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="font-mono">
                {formatTimeShort(summary.observationWindow.start)} - {formatTimeShort(summary.observationWindow.end)}
              </span>
              <span className="text-muted-foreground">
                {summary.observationWindow.durationHours.toFixed(1)}h
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">{timeUntilWindow}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Sunset className="w-3 h-3" />
              <span>Evening Twilight</span>
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sunset</span>
                <span className="font-mono">{formatTimeShort(summary?.twilight.sunset)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Civil</span>
                <span className="font-mono">{formatTimeShort(summary?.twilight.civilDusk)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Nautical</span>
                <span className="font-mono">{formatTimeShort(summary?.twilight.nauticalDusk)}</span>
              </div>
              <div className="flex justify-between font-medium">
                <span>Astronomical</span>
                <span className="font-mono text-primary">{formatTimeShort(summary?.twilight.astronomicalDusk)}</span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Sunrise className="w-3 h-3" />
              <span>Morning Twilight</span>
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between font-medium">
                <span>Astronomical</span>
                <span className="font-mono text-primary">{formatTimeShort(summary?.twilight.astronomicalDawn)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Nautical</span>
                <span className="font-mono">{formatTimeShort(summary?.twilight.nauticalDawn)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Civil</span>
                <span className="font-mono">{formatTimeShort(summary?.twilight.civilDawn)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sunrise</span>
                <span className="font-mono">{formatTimeShort(summary?.twilight.sunrise)}</span>
              </div>
            </div>
          </div>
        </div>

        {summary?.moon && (
          <div className="p-3 rounded-lg bg-muted/50 border border-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">{getMoonPhaseEmoji(summary.moon.phaseName)}</span>
                <div>
                  <p className="font-medium text-sm">{summary.moon.phaseName}</p>
                  <p className="text-xs text-muted-foreground">
                    {summary.moon.illumination.toFixed(0)}% illuminated
                  </p>
                </div>
              </div>
              <div className="text-right text-xs">
                {summary.moon.isAboveHorizon ? (
                  <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30">
                    Above Horizon
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">
                    Below Horizon
                  </Badge>
                )}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
              <div className="text-center">
                <p className="text-muted-foreground">Rises</p>
                <p className="font-mono">{formatTimeShort(summary.moon.riseTime)}</p>
              </div>
              <div className="text-center">
                <p className="text-muted-foreground">Transit</p>
                <p className="font-mono">{formatTimeShort(summary.moon.transitTime)}</p>
              </div>
              <div className="text-center">
                <p className="text-muted-foreground">Sets</p>
                <p className="font-mono">{formatTimeShort(summary.moon.setTime)}</p>
              </div>
            </div>
            {summary.moon.illumination > 50 && (
              <div className="flex items-center gap-1.5 mt-2 text-xs text-yellow-600">
                <AlertTriangle className="w-3 h-3" />
                <span>Bright moon may affect DSO viewing</span>
              </div>
            )}
          </div>
        )}

        {summary?.planetVisibility && summary.planetVisibility.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Star className="w-3 h-3" />
              <span>Visible Planets Tonight</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {summary.planetVisibility
                .filter(p => p.isVisible)
                .map(planet => (
                  <Badge key={planet.name} variant="outline" className="text-xs">
                    <CircleDot className="w-3 h-3 mr-1" />
                    {planet.name}
                    <span className="text-muted-foreground ml-1">
                      {planet.altitude.toFixed(0)}°
                    </span>
                  </Badge>
                ))}
              {summary.planetVisibility.filter(p => p.isVisible).length === 0 && (
                <span className="text-xs text-muted-foreground">No planets above 10° altitude</span>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface UpcomingEventsWidgetProps {
  location: Location | null;
}

export function UpcomingEventsWidget({ location }: UpcomingEventsWidgetProps) {
  const { user } = useAuth();
  const hasValidCoords = !!(location && location.latitude != null && location.longitude != null);
  
  const { data: events, isLoading } = useQuery<CelestialEvent[]>({
    queryKey: ['/api/astronomy/events', location?.latitude, location?.longitude],
    queryFn: async () => {
      const res = await fetch(`/api/astronomy/events?latitude=${location!.latitude}&longitude=${location!.longitude}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch events');
      return res.json();
    },
    enabled: !!user && hasValidCoords,
  });

  if (!location) {
    return null;
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Upcoming Events
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32" />
        </CardContent>
      </Card>
    );
  }

  const upcomingEvents = events?.slice(0, 6) || [];

  if (upcomingEvents.length === 0) {
    return null;
  }

  function getEventIcon(type: string) {
    switch (type) {
      case 'lunar_phase': return Moon;
      case 'opposition': return CircleDot;
      case 'elongation': return Star;
      case 'meteor_shower': return Star;
      case 'conjunction': return CircleDot;
      default: return Calendar;
    }
  }

  function getEventColor(type: string): string {
    switch (type) {
      case 'lunar_phase': return 'text-yellow-500';
      case 'opposition': return 'text-orange-500';
      case 'elongation': return 'text-blue-500';
      case 'meteor_shower': return 'text-purple-500';
      case 'conjunction': return 'text-green-500';
      default: return 'text-muted-foreground';
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-purple-500" />
          <CardTitle>Upcoming Events</CardTitle>
        </div>
        <CardDescription>Next 2 weeks of celestial events</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {upcomingEvents.map((event, index) => {
            const Icon = getEventIcon(event.type);
            const eventDate = parseISO(event.date);
            const daysUntil = Math.ceil((eventDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            
            return (
              <div 
                key={`${event.name}-${index}`}
                className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center bg-muted ${getEventColor(event.type)}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-sm truncate">{event.name}</p>
                    <Badge variant="outline" className="shrink-0 text-xs">
                      {daysUntil === 0 ? 'Today' : 
                       daysUntil === 1 ? 'Tomorrow' :
                       `${daysUntil} days`}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{event.description}</p>
                  <p className="text-xs font-mono text-muted-foreground mt-0.5">
                    {format(eventDate, 'MMM d, yyyy')}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

interface MoonImpactWidgetProps {
  location: Location | null;
}

export function MoonImpactWidget({ location }: MoonImpactWidgetProps) {
  const { user } = useAuth();
  const hasValidCoords = !!(location && location.latitude != null && location.longitude != null);
  
  const { data: moon, isLoading } = useQuery<MoonData>({
    queryKey: ['/api/astronomy/moon', location?.latitude, location?.longitude],
    queryFn: async () => {
      const res = await fetch(`/api/astronomy/moon?latitude=${location!.latitude}&longitude=${location!.longitude}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch moon data');
      return res.json();
    },
    enabled: !!user && hasValidCoords,
  });

  if (!location || isLoading) {
    return null;
  }

  if (!moon) {
    return null;
  }

  const dsoImpact = moon.illumination > 70 ? 'high' :
                   moon.illumination > 40 ? 'moderate' :
                   moon.illumination > 20 ? 'low' : 'minimal';

  const impactColor = dsoImpact === 'high' ? 'text-red-500' :
                     dsoImpact === 'moderate' ? 'text-yellow-500' :
                     dsoImpact === 'low' ? 'text-blue-500' : 'text-green-500';

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Moon className="w-5 h-5 text-yellow-500" />
          <CardTitle>Moon Impact</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{getMoonPhaseEmoji(moon.phaseName)}</span>
            <div>
              <p className="font-medium">{moon.phaseName}</p>
              <p className="text-sm text-muted-foreground">
                {moon.illumination.toFixed(0)}% illuminated
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">DSO Impact</p>
            <p className={`font-medium capitalize ${impactColor}`}>{dsoImpact}</p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Moon Brightness</span>
            <span className="font-mono">{moon.illumination.toFixed(0)}%</span>
          </div>
          <Progress value={moon.illumination} className="h-2" />
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground text-xs mb-1">Status</p>
            <div className="flex items-center gap-2">
              {moon.isAboveHorizon ? (
                <>
                  <AlertTriangle className="w-4 h-4 text-yellow-500" />
                  <span>Above horizon at {moon.altitude.toFixed(0)}°</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  <span>Below horizon</span>
                </>
              )}
            </div>
          </div>
          <div>
            <p className="text-muted-foreground text-xs mb-1">Best for</p>
            <p>{moon.illumination < 30 ? 'Deep sky objects' : 
                moon.illumination > 70 ? 'Planets & Moon' : 'Mixed targets'}</p>
          </div>
        </div>

        <div className="p-2 rounded bg-muted/50 text-xs">
          {moon.illumination < 30 && (
            <p className="flex items-center gap-2">
              <CheckCircle2 className="w-3 h-3 text-green-500" />
              Excellent conditions for faint nebulae and galaxies
            </p>
          )}
          {moon.illumination >= 30 && moon.illumination < 70 && (
            <p className="flex items-center gap-2">
              <AlertTriangle className="w-3 h-3 text-yellow-500" />
              Focus on brighter objects, clusters, and planets
            </p>
          )}
          {moon.illumination >= 70 && (
            <p className="flex items-center gap-2">
              <AlertTriangle className="w-3 h-3 text-red-500" />
              Bright moon - best for lunar and planetary observation
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
