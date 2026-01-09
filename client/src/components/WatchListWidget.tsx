import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link, useLocation } from "wouter";
import { Bookmark, ArrowRight, Clock, Sun, Moon as MoonIcon, Star, Calendar, Sunrise, Sunset, Mountain } from "lucide-react";
import { format, isToday, isTomorrow, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import type { WatchlistItemWithWindows, WatchlistWindow } from "@shared/schema";

function formatWindowDate(dateStr: string | Date): string {
  const date = new Date(dateStr);
  if (isToday(date)) return "Tonight";
  if (isTomorrow(date)) return "Tomorrow";
  const days = differenceInDays(date, new Date());
  if (days <= 7) return format(date, "EEEE");
  return format(date, "MMM d");
}

function getQualityColor(quality: number): string {
  if (quality >= 8) return "text-emerald-500";
  if (quality >= 6) return "text-blue-500";
  if (quality >= 4) return "text-amber-500";
  return "text-muted-foreground";
}

function formatDuration(minutes: number | null | undefined): string {
  if (!minutes) return "";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

const twilightConfig: Record<string, { label: string; icon: typeof Sunset; color: string }> = {
  evening: { label: "Eve", icon: Sunset, color: "text-orange-500" },
  midnight: { label: "Mid", icon: MoonIcon, color: "text-indigo-500" },
  morning: { label: "Morn", icon: Sunrise, color: "text-amber-500" },
};

function UpcomingWindowCard({ item, onViewInSkyTonight }: { item: WatchlistItemWithWindows; onViewInSkyTonight: (catalogId: string) => void }) {
  const nextWindow = item.windows?.find(w => new Date(w.startTime) > new Date());
  
  if (!nextWindow) {
    return null;
  }

  const twilight = twilightConfig[nextWindow.twilightSegment ?? 'midnight'] ?? twilightConfig.midnight;
  const TwilightIcon = twilight.icon;

  return (
    <button 
      className="w-full p-3 rounded-md border bg-card hover-elevate text-left cursor-pointer"
      onClick={() => item.object?.catalogId && onViewInSkyTonight(item.object.catalogId)}
      data-testid={`button-watchlist-widget-item-${item.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-medium text-sm truncate">{item.object?.name || 'Unknown'}</p>
            {item.priority === 'high' && (
              <Star className="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" />
            )}
          </div>
          <p className="text-xs text-muted-foreground font-mono">
            {item.object?.catalogId}
          </p>
        </div>
        <Badge variant={nextWindow.qualityScore >= 7 ? "default" : nextWindow.qualityScore >= 5 ? "secondary" : "outline"} className="shrink-0">
          {nextWindow.qualityScore}/10
        </Badge>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Calendar className="w-3 h-3" />
          {formatWindowDate(nextWindow.startTime)}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {format(new Date(nextWindow.startTime), 'HH:mm')} - {format(new Date(nextWindow.endTime), 'HH:mm')}
        </span>
        {nextWindow.durationMinutes && (
          <span className="flex items-center gap-1">
            ({formatDuration(nextWindow.durationMinutes)})
          </span>
        )}
      </div>
      <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
        {nextWindow.peakAltitude && (
          <span className="flex items-center gap-1">
            <Mountain className="w-3 h-3" />
            {nextWindow.peakAltitude.toFixed(0)}° peak
          </span>
        )}
        {nextWindow.twilightSegment && (
          <span className={cn("flex items-center gap-1", twilight.color)}>
            <TwilightIcon className="w-3 h-3" />
            {twilight.label}
          </span>
        )}
        {nextWindow.moonInterference && nextWindow.moonInterference !== 'none' && (
          <span className={cn("flex items-center gap-1",
            nextWindow.moonInterference === 'high' && "text-red-400",
            nextWindow.moonInterference === 'moderate' && "text-yellow-400",
            nextWindow.moonInterference === 'low' && "text-green-400"
          )}>
            <MoonIcon className="w-3 h-3" />
            {nextWindow.moonInterference}
          </span>
        )}
      </div>
    </button>
  );
}

export function WatchListWidget() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { data: watchlistItems, isLoading } = useQuery<WatchlistItemWithWindows[]>({
    queryKey: ['/api/watchlist'],
    enabled: !!user,
  });

  const handleViewInSkyTonight = (catalogId: string) => {
    setLocation(`/sky-tonight?select=${encodeURIComponent(catalogId)}`);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <Bookmark className="w-5 h-5" />
            Watch List
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24" />
        </CardContent>
      </Card>
    );
  }

  const itemsWithWindows = watchlistItems?.filter(item => 
    item.status === 'planned' && 
    item.windows && 
    item.windows.length > 0 &&
    item.windows.some(w => new Date(w.startTime) > new Date())
  ) || [];

  const sortedItems = [...itemsWithWindows].sort((a, b) => {
    const aNextWindow = a.windows?.find(w => new Date(w.startTime) > new Date());
    const bNextWindow = b.windows?.find(w => new Date(w.startTime) > new Date());
    if (!aNextWindow) return 1;
    if (!bNextWindow) return -1;
    return new Date(aNextWindow.startTime).getTime() - new Date(bNextWindow.startTime).getTime();
  });

  const upcomingOpportunities = sortedItems.slice(0, 3);
  const tonightCount = upcomingOpportunities.filter(item => {
    const window = item.windows?.find(w => new Date(w.startTime) > new Date());
    return window && isToday(new Date(window.startTime));
  }).length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2 space-y-0">
        <div className="flex items-center gap-2">
          <Bookmark className="w-5 h-5 text-primary" />
          <CardTitle>Watch List</CardTitle>
          {tonightCount > 0 && (
            <Badge variant="secondary" className="ml-1">
              {tonightCount} tonight
            </Badge>
          )}
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/watchlist" data-testid="link-view-watchlist">
            View All
            <ArrowRight className="w-4 h-4 ml-1" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {upcomingOpportunities.length > 0 ? (
          <div className="space-y-2">
            {upcomingOpportunities.map((item) => (
              <UpcomingWindowCard key={item.id} item={item} onViewInSkyTonight={handleViewInSkyTonight} />
            ))}
            {sortedItems.length > 3 && (
              <p className="text-xs text-muted-foreground text-center pt-2">
                +{sortedItems.length - 3} more opportunities this month
              </p>
            )}
          </div>
        ) : watchlistItems && watchlistItems.length > 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No upcoming windows calculated</p>
            <p className="text-xs mt-1">Calculate windows on the Watch List page</p>
            <Button variant="outline" size="sm" className="mt-3" asChild>
              <Link href="/watchlist" data-testid="button-calculate-windows">
                Calculate Windows
              </Link>
            </Button>
          </div>
        ) : (
          <div className="text-center py-6 text-muted-foreground">
            <Bookmark className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No objects in your watch list</p>
            <p className="text-xs mt-1">Add objects to track observation opportunities</p>
            <Button variant="outline" size="sm" className="mt-3" asChild>
              <Link href="/objects" data-testid="button-browse-objects">
                Browse Objects
              </Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
