import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon,
  Clock,
  Moon,
  Mountain,
  Sun,
  Sunrise,
  Sunset
} from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, isSameDay, addMonths, subMonths } from "date-fns";
import { cn } from "@/lib/utils";
import type { WatchlistWindow, CelestialObject } from "@shared/schema";

interface ObservationCalendarProps {
  windows: WatchlistWindow[];
  objectName?: string;
  onDaySelect?: (date: Date, windows: WatchlistWindow[]) => void;
}

const twilightSegmentConfig = {
  evening: { label: "Evening", icon: Sunset, color: "text-orange-500" },
  midnight: { label: "Midnight", icon: Moon, color: "text-indigo-500" },
  morning: { label: "Morning", icon: Sunrise, color: "text-amber-500" },
};

function getQualityColor(score: number): string {
  if (score >= 8) return "bg-green-500/80";
  if (score >= 6) return "bg-emerald-500/60";
  if (score >= 4) return "bg-yellow-500/60";
  return "bg-orange-500/40";
}

function getMoonInterferenceColor(interference: string): string {
  switch (interference) {
    case 'high': return "text-red-400";
    case 'moderate': return "text-yellow-400";
    case 'low': return "text-green-400";
    default: return "text-green-500";
  }
}

function formatDuration(minutes: number | null | undefined): string {
  if (!minutes) return "—";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function WindowTimelineCard({ window }: { window: WatchlistWindow }) {
  const segment = twilightSegmentConfig[window.twilightSegment as keyof typeof twilightSegmentConfig] || twilightSegmentConfig.midnight;
  const SegmentIcon = segment.icon;

  return (
    <Card className="bg-muted/30 hover-elevate">
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium">
                {format(new Date(window.startTime), 'HH:mm')} — {format(new Date(window.endTime), 'HH:mm')}
              </span>
              <Badge variant={window.qualityScore >= 7 ? "default" : window.qualityScore >= 5 ? "secondary" : "outline"}>
                {window.qualityScore}/10
              </Badge>
            </div>
            
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatDuration(window.durationMinutes)}
              </span>
              <span className="flex items-center gap-1">
                <Mountain className="w-3 h-3" />
                {window.peakAltitude?.toFixed(0)}° peak
              </span>
              <span className={cn("flex items-center gap-1", segment.color)}>
                <SegmentIcon className="w-3 h-3" />
                {segment.label}
              </span>
              {window.moonInterference && window.moonInterference !== 'none' && (
                <span className={cn("flex items-center gap-1", getMoonInterferenceColor(window.moonInterference))}>
                  <Moon className="w-3 h-3" />
                  {window.moonInterference} moon
                </span>
              )}
            </div>

            {window.astronomicalDusk && window.astronomicalDawn && (
              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground/70">
                <span className="flex items-center gap-1">
                  <Sun className="w-3 h-3" />
                  Dark: {format(new Date(window.astronomicalDusk), 'HH:mm')} — {format(new Date(window.astronomicalDawn), 'HH:mm')}
                </span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function ObservationCalendar({ windows, objectName, onDaySelect }: ObservationCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const windowsByDate = useMemo(() => {
    const map = new Map<string, WatchlistWindow[]>();
    windows.forEach(w => {
      const dateKey = format(new Date(w.windowDate), 'yyyy-MM-dd');
      const existing = map.get(dateKey) || [];
      existing.push(w);
      map.set(dateKey, existing);
    });
    return map;
  }, [windows]);

  const calendarDays = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start, end });
    
    const startPadding = start.getDay();
    const paddedDays: (Date | null)[] = [];
    for (let i = 0; i < startPadding; i++) {
      paddedDays.push(null);
    }
    paddedDays.push(...days);
    
    while (paddedDays.length % 7 !== 0) {
      paddedDays.push(null);
    }
    
    return paddedDays;
  }, [currentMonth]);

  const selectedDateWindows = useMemo(() => {
    if (!selectedDate) return [];
    const dateKey = format(selectedDate, 'yyyy-MM-dd');
    return windowsByDate.get(dateKey) || [];
  }, [selectedDate, windowsByDate]);

  const handleDayClick = (date: Date) => {
    setSelectedDate(date);
    const dateKey = format(date, 'yyyy-MM-dd');
    const dayWindows = windowsByDate.get(dateKey) || [];
    onDaySelect?.(date, dayWindows);
  };

  const getDayStats = (date: Date) => {
    const dateKey = format(date, 'yyyy-MM-dd');
    const dayWindows = windowsByDate.get(dateKey) || [];
    if (dayWindows.length === 0) return null;
    
    const totalMinutes = dayWindows.reduce((sum, w) => sum + (w.durationMinutes || 0), 0);
    const bestQuality = Math.max(...dayWindows.map(w => w.qualityScore));
    
    return { count: dayWindows.length, totalMinutes, bestQuality };
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <CalendarIcon className="w-5 h-5" />
              Observation Calendar
              {objectName && <span className="text-muted-foreground font-normal">— {objectName}</span>}
            </CardTitle>
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                data-testid="button-prev-month"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="w-32 text-center font-medium">
                {format(currentMonth, 'MMMM yyyy')}
              </span>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                data-testid="button-next-month"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-1">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="text-center text-xs font-medium text-muted-foreground py-2">
                {day}
              </div>
            ))}
            
            {calendarDays.map((date, idx) => {
              if (!date) {
                return <div key={`empty-${idx}`} className="aspect-square" />;
              }
              
              const stats = getDayStats(date);
              const isSelected = selectedDate && isSameDay(date, selectedDate);
              const isCurrentMonth = isSameMonth(date, currentMonth);
              const isPast = date < new Date(new Date().setHours(0, 0, 0, 0));
              
              return (
                <Tooltip key={date.toISOString()}>
                  <TooltipTrigger asChild>
                    <button
                      className={cn(
                        "aspect-square rounded-md flex flex-col items-center justify-center gap-0.5 text-sm transition-colors relative",
                        "hover-elevate",
                        isCurrentMonth ? "text-foreground" : "text-muted-foreground/50",
                        isToday(date) && "ring-1 ring-primary",
                        isSelected && "bg-primary/20",
                        isPast && !stats && "opacity-50",
                        stats && "cursor-pointer"
                      )}
                      onClick={() => handleDayClick(date)}
                      disabled={!stats}
                      data-testid={`calendar-day-${format(date, 'yyyy-MM-dd')}`}
                    >
                      <span className={cn(
                        "font-medium",
                        isToday(date) && "text-primary"
                      )}>
                        {format(date, 'd')}
                      </span>
                      {stats && (
                        <div className={cn(
                          "w-2 h-2 rounded-full",
                          getQualityColor(stats.bestQuality)
                        )} />
                      )}
                    </button>
                  </TooltipTrigger>
                  {stats && (
                    <TooltipContent>
                      <div className="text-xs space-y-1">
                        <div className="font-medium">{format(date, 'EEEE, MMM d')}</div>
                        <div>{stats.count} window{stats.count > 1 ? 's' : ''}</div>
                        <div>{formatDuration(stats.totalMinutes)} total</div>
                        <div>Best: {stats.bestQuality}/10</div>
                      </div>
                    </TooltipContent>
                  )}
                </Tooltip>
              );
            })}
          </div>
          
          <div className="flex items-center justify-center gap-4 mt-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-green-500/80" />
              Excellent (8+)
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-emerald-500/60" />
              Good (6-7)
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-yellow-500/60" />
              Fair (4-5)
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-orange-500/40" />
              Poor (&lt;4)
            </div>
          </div>
        </CardContent>
      </Card>
      
      {selectedDate && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="w-4 h-4" />
              {format(selectedDate, 'EEEE, MMMM d, yyyy')}
              {selectedDateWindows.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {selectedDateWindows.length} window{selectedDateWindows.length > 1 ? 's' : ''}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedDateWindows.length > 0 ? (
              <ScrollArea className="max-h-[300px]">
                <div className="space-y-2">
                  {selectedDateWindows.map(window => (
                    <WindowTimelineCard key={window.id} window={window} />
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                No observation windows on this date
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export function MultiObjectCalendar({ 
  items 
}: { 
  items: Array<{ 
    object: CelestialObject; 
    windows: WatchlistWindow[] 
  }> 
}) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const allWindows = useMemo(() => items.flatMap(item => 
    item.windows.map(w => ({ ...w, objectName: item.object.name, objectId: item.object.id }))
  ), [items]);

  const windowsByDate = useMemo(() => {
    const map = new Map<string, Array<WatchlistWindow & { objectName: string; objectId: number }>>();
    allWindows.forEach(w => {
      const dateKey = format(new Date(w.windowDate), 'yyyy-MM-dd');
      const existing = map.get(dateKey) || [];
      existing.push(w);
      map.set(dateKey, existing);
    });
    return map;
  }, [allWindows]);

  const calendarDays = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start, end });
    
    const startPadding = start.getDay();
    const paddedDays: (Date | null)[] = [];
    for (let i = 0; i < startPadding; i++) {
      paddedDays.push(null);
    }
    paddedDays.push(...days);
    
    while (paddedDays.length % 7 !== 0) {
      paddedDays.push(null);
    }
    
    return paddedDays;
  }, [currentMonth]);

  const selectedDateWindows = useMemo(() => {
    if (!selectedDate) return [];
    const dateKey = format(selectedDate, 'yyyy-MM-dd');
    return windowsByDate.get(dateKey) || [];
  }, [selectedDate, windowsByDate]);

  const getDayStats = (date: Date) => {
    const dateKey = format(date, 'yyyy-MM-dd');
    const dayWindows = windowsByDate.get(dateKey) || [];
    if (dayWindows.length === 0) return null;
    
    const objectCount = new Set(dayWindows.map(w => w.objectId)).size;
    const totalMinutes = dayWindows.reduce((sum, w) => sum + (w.durationMinutes || 0), 0);
    const bestQuality = Math.max(...dayWindows.map(w => w.qualityScore));
    
    return { windowCount: dayWindows.length, objectCount, totalMinutes, bestQuality };
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <CalendarIcon className="w-5 h-5" />
              Watch List Calendar
            </CardTitle>
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                data-testid="button-prev-month-multi"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="w-32 text-center font-medium">
                {format(currentMonth, 'MMMM yyyy')}
              </span>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                data-testid="button-next-month-multi"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-1">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="text-center text-xs font-medium text-muted-foreground py-2">
                {day}
              </div>
            ))}
            
            {calendarDays.map((date, idx) => {
              if (!date) {
                return <div key={`empty-${idx}`} className="aspect-square" />;
              }
              
              const stats = getDayStats(date);
              const isSelected = selectedDate && isSameDay(date, selectedDate);
              const isCurrentMonth = isSameMonth(date, currentMonth);
              
              return (
                <Tooltip key={date.toISOString()}>
                  <TooltipTrigger asChild>
                    <button
                      className={cn(
                        "aspect-square rounded-md flex flex-col items-center justify-center gap-0.5 text-sm transition-colors relative",
                        "hover-elevate",
                        isCurrentMonth ? "text-foreground" : "text-muted-foreground/50",
                        isToday(date) && "ring-1 ring-primary",
                        isSelected && "bg-primary/20",
                        stats && "cursor-pointer"
                      )}
                      onClick={() => setSelectedDate(date)}
                      disabled={!stats}
                      data-testid={`calendar-multi-day-${format(date, 'yyyy-MM-dd')}`}
                    >
                      <span className={cn(
                        "font-medium",
                        isToday(date) && "text-primary"
                      )}>
                        {format(date, 'd')}
                      </span>
                      {stats && (
                        <div className="flex items-center gap-0.5">
                          <div className={cn(
                            "w-2 h-2 rounded-full",
                            getQualityColor(stats.bestQuality)
                          )} />
                          {stats.objectCount > 1 && (
                            <span className="text-[10px] text-muted-foreground">
                              {stats.objectCount}
                            </span>
                          )}
                        </div>
                      )}
                    </button>
                  </TooltipTrigger>
                  {stats && (
                    <TooltipContent>
                      <div className="text-xs space-y-1">
                        <div className="font-medium">{format(date, 'EEEE, MMM d')}</div>
                        <div>{stats.objectCount} object{stats.objectCount > 1 ? 's' : ''}</div>
                        <div>{stats.windowCount} window{stats.windowCount > 1 ? 's' : ''}</div>
                        {stats.totalMinutes > 0 && (
                          <div>{formatDuration(stats.totalMinutes)} total viewing</div>
                        )}
                        <div>Best: {stats.bestQuality}/10</div>
                      </div>
                    </TooltipContent>
                  )}
                </Tooltip>
              );
            })}
          </div>
          
          <div className="flex items-center justify-center gap-4 mt-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-green-500/80" />
              Excellent
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-emerald-500/60" />
              Good
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-yellow-500/60" />
              Fair
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-orange-500/40" />
              Poor
            </div>
          </div>
        </CardContent>
      </Card>
      
      {selectedDate && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="w-4 h-4" />
              {format(selectedDate, 'EEEE, MMMM d, yyyy')}
              {selectedDateWindows.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {selectedDateWindows.length} window{selectedDateWindows.length > 1 ? 's' : ''}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedDateWindows.length > 0 ? (
              <ScrollArea className="max-h-[400px]">
                <div className="space-y-3">
                  {Object.entries(
                    selectedDateWindows.reduce((acc, w) => {
                      const key = w.objectName;
                      if (!acc[key]) acc[key] = [];
                      acc[key].push(w);
                      return acc;
                    }, {} as Record<string, typeof selectedDateWindows>)
                  ).map(([objectName, windows]) => (
                    <div key={objectName}>
                      <h4 className="font-medium text-sm mb-2">{objectName}</h4>
                      <div className="space-y-2">
                        {windows.map(window => (
                          <WindowTimelineCard key={window.id} window={window} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                No observation windows on this date
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
