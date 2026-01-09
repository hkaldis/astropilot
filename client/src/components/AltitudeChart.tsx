import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Area, ComposedChart } from "recharts";
import { format, parseISO, differenceInMinutes, isAfter, isBefore } from "date-fns";
import { TrendingUp, Clock, AlertTriangle, Moon } from "lucide-react";

interface AltitudePoint {
  time: string;
  altitude: number;
  azimuth: number;
  isAboveHorizon: boolean;
}

interface AltitudeChartProps {
  catalogId: string;
  name: string;
  ra: number;
  dec: number;
  latitude: number;
  longitude: number;
}

interface ObjectVisibility {
  catalogId: string;
  name: string;
  riseTime: string | null;
  setTime: string | null;
  transitTime: string | null;
  transitAltitude: number | null;
  bestViewingStart: string | null;
  bestViewingEnd: string | null;
  currentAltitude: number;
  currentAzimuth: number;
  isVisible: boolean;
  altitudeCurve: AltitudePoint[];
  moonSeparation: number | null;
  moonInterference: 'none' | 'low' | 'moderate' | 'high';
}

function formatTimeLabel(isoString: string): string {
  try {
    return format(parseISO(isoString), 'HH:mm');
  } catch {
    return '';
  }
}

function getMoonInterferenceColor(level: string): string {
  switch (level) {
    case 'high': return 'text-red-500';
    case 'moderate': return 'text-yellow-500';
    case 'low': return 'text-blue-500';
    default: return 'text-green-500';
  }
}

function getMoonInterferenceBadge(level: string): string {
  switch (level) {
    case 'high': return 'bg-red-500/10 text-red-500 border-red-500/30';
    case 'moderate': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30';
    case 'low': return 'bg-blue-500/10 text-blue-500 border-blue-500/30';
    default: return 'bg-green-500/10 text-green-500 border-green-500/30';
  }
}

export function AltitudeChart({ catalogId, name, ra, dec, latitude, longitude }: AltitudeChartProps) {
  const { data: visibility, isLoading, error } = useQuery<ObjectVisibility>({
    queryKey: ['/api/astronomy/visibility', catalogId, latitude, longitude, ra, dec],
    enabled: !isNaN(ra) && !isNaN(dec) && !isNaN(latitude) && !isNaN(longitude),
    queryFn: async () => {
      const res = await fetch(
        `/api/astronomy/visibility/${encodeURIComponent(catalogId)}?` +
        `latitude=${latitude}&longitude=${longitude}&ra=${ra}&dec=${dec}&name=${encodeURIComponent(name)}`
      );
      if (!res.ok) throw new Error("Failed to fetch visibility data");
      return res.json();
    },
    staleTime: 300000,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (error || !visibility) {
    return null;
  }

  const chartData = visibility.altitudeCurve.map((point, index) => ({
    ...point,
    timeLabel: formatTimeLabel(point.time),
    index,
    altitudePositive: point.altitude > 0 ? point.altitude : 0,
  }));

  const now = new Date();
  let currentIndex = 0;
  for (let i = 0; i < chartData.length; i++) {
    const pointTime = parseISO(chartData[i].time);
    if (isAfter(now, pointTime)) {
      currentIndex = i;
    }
  }

  const transitIndex = visibility.transitTime 
    ? chartData.findIndex(p => {
        const pTime = parseISO(p.time);
        const tTime = parseISO(visibility.transitTime!);
        return Math.abs(differenceInMinutes(pTime, tTime)) < 15;
      })
    : -1;

  const bestStartIndex = visibility.bestViewingStart
    ? chartData.findIndex(p => {
        const pTime = parseISO(p.time);
        const sTime = parseISO(visibility.bestViewingStart!);
        return Math.abs(differenceInMinutes(pTime, sTime)) < 15;
      })
    : -1;

  const bestEndIndex = visibility.bestViewingEnd
    ? chartData.findIndex(p => {
        const pTime = parseISO(p.time);
        const eTime = parseISO(visibility.bestViewingEnd!);
        return Math.abs(differenceInMinutes(pTime, eTime)) < 15;
      })
    : -1;

  let timeUntilTransit = '';
  if (visibility.transitTime) {
    const transitTime = parseISO(visibility.transitTime);
    if (isAfter(transitTime, now)) {
      const mins = differenceInMinutes(transitTime, now);
      timeUntilTransit = `${Math.floor(mins / 60)}h ${mins % 60}m until transit`;
    } else {
      timeUntilTransit = 'Transit passed';
    }
  }

  let timeUntilSet = '';
  if (visibility.setTime) {
    const setTime = parseISO(visibility.setTime);
    if (visibility.isVisible && isAfter(setTime, now)) {
      const mins = differenceInMinutes(setTime, now);
      if (mins < 60) {
        timeUntilSet = `Sets in ${mins}m`;
      } else {
        timeUntilSet = `Sets in ${Math.floor(mins / 60)}h ${mins % 60}m`;
      }
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h4 className="font-medium text-sm flex items-center gap-2">
          <TrendingUp className="w-4 h-4" />
          Tonight's Altitude
        </h4>
        <div className="flex items-center gap-2 flex-wrap">
          {visibility.moonSeparation !== null && (
            <Badge variant="outline" className={getMoonInterferenceBadge(visibility.moonInterference)}>
              <Moon className="w-3 h-3 mr-1" />
              {visibility.moonSeparation.toFixed(0)}° from Moon
            </Badge>
          )}
          {timeUntilSet && visibility.isVisible && (
            <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30">
              <AlertTriangle className="w-3 h-3 mr-1" />
              {timeUntilSet}
            </Badge>
          )}
        </div>
      </div>

      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="altitudeGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <XAxis 
              dataKey="timeLabel" 
              tick={{ fontSize: 10 }}
              interval="preserveStartEnd"
              tickCount={6}
            />
            <YAxis 
              domain={[-10, 90]}
              tick={{ fontSize: 10 }}
              tickFormatter={(v) => `${v}°`}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload;
                  return (
                    <div className="bg-popover border rounded-lg shadow-lg p-2 text-xs">
                      <p className="font-medium">{data.timeLabel}</p>
                      <p className="text-muted-foreground">
                        Altitude: <span className="font-mono">{data.altitude.toFixed(1)}°</span>
                      </p>
                      <p className="text-muted-foreground">
                        Azimuth: <span className="font-mono">{data.azimuth.toFixed(1)}°</span>
                      </p>
                    </div>
                  );
                }
                return null;
              }}
            />
            <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
            <ReferenceLine y={30} stroke="hsl(var(--primary))" strokeDasharray="3 3" strokeOpacity={0.5} />
            <Area
              type="monotone"
              dataKey="altitudePositive"
              stroke="none"
              fill="url(#altitudeGradient)"
            />
            <Line
              type="monotone"
              dataKey="altitude"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
            {transitIndex >= 0 && (
              <ReferenceLine
                x={chartData[transitIndex]?.timeLabel}
                stroke="hsl(var(--chart-2))"
                strokeDasharray="5 5"
                label={{ value: 'T', position: 'top', fontSize: 10, fill: 'hsl(var(--chart-2))' }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="p-2 rounded bg-muted/50">
          <p className="text-muted-foreground">Current Alt</p>
          <p className="font-mono font-medium">{visibility.currentAltitude.toFixed(1)}°</p>
        </div>
        {visibility.transitAltitude !== null && (
          <div className="p-2 rounded bg-muted/50">
            <p className="text-muted-foreground">Transit Alt</p>
            <p className="font-mono font-medium">{visibility.transitAltitude.toFixed(1)}°</p>
          </div>
        )}
        {visibility.transitTime && (
          <div className="p-2 rounded bg-muted/50">
            <p className="text-muted-foreground">Transit Time</p>
            <p className="font-mono font-medium">{formatTimeLabel(visibility.transitTime)}</p>
          </div>
        )}
        {visibility.bestViewingStart && visibility.bestViewingEnd && (
          <div className="p-2 rounded bg-primary/10">
            <p className="text-muted-foreground">Best Viewing</p>
            <p className="font-mono font-medium">
              {formatTimeLabel(visibility.bestViewingStart)} - {formatTimeLabel(visibility.bestViewingEnd)}
            </p>
          </div>
        )}
      </div>

      {timeUntilTransit && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="w-3 h-3" />
          <span>{timeUntilTransit}</span>
        </div>
      )}

      {visibility.moonInterference !== 'none' && (
        <div className={`flex items-center gap-2 text-xs p-2 rounded ${
          visibility.moonInterference === 'high' ? 'bg-red-500/10 text-red-500' :
          visibility.moonInterference === 'moderate' ? 'bg-yellow-500/10 text-yellow-600' :
          'bg-blue-500/10 text-blue-500'
        }`}>
          <Moon className="w-3 h-3" />
          <span>
            {visibility.moonInterference === 'high' 
              ? 'High moon interference - consider waiting for moonset'
              : visibility.moonInterference === 'moderate'
              ? 'Moderate moon interference - expect reduced contrast'
              : 'Low moon interference - minimal impact expected'}
          </span>
        </div>
      )}
    </div>
  );
}

interface SimpleAltitudeCurveProps {
  altitudeCurve: AltitudePoint[];
  transitTime?: string | null;
  compact?: boolean;
}

export function SimpleAltitudeCurve({ altitudeCurve, transitTime, compact = false }: SimpleAltitudeCurveProps) {
  if (!altitudeCurve || altitudeCurve.length === 0) return null;

  const chartData = altitudeCurve.map((point, index) => ({
    ...point,
    timeLabel: formatTimeLabel(point.time),
    index,
  }));

  return (
    <div className={compact ? "h-24" : "h-32"}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 5, left: -30, bottom: 0 }}>
          <XAxis 
            dataKey="timeLabel" 
            tick={{ fontSize: 9 }}
            interval="preserveStartEnd"
            tickCount={4}
            hide={compact}
          />
          <YAxis 
            domain={[-10, 90]}
            tick={{ fontSize: 9 }}
            hide={compact}
          />
          <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="2 2" strokeOpacity={0.5} />
          <Line
            type="monotone"
            dataKey="altitude"
            stroke="hsl(var(--primary))"
            strokeWidth={1.5}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
