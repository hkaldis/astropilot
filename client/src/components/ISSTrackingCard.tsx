import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Orbit, 
  Users, 
  MapPin,
  Gauge,
  Eye,
  Mountain,
  RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface ISSPosition {
  latitude: number;
  longitude: number;
  altitude: number;
  velocity: number;
  visibility: "daylight" | "eclipsed";
  timestamp: number;
}

interface ISSTrackingData {
  position: ISSPosition | null;
  passes: never[];
  astronauts: { name: string; craft: string }[];
  astronautCount: number;
  lastUpdated: string;
  overLocation: string | null;
}

interface ISSTrackingCardProps {
  latitude?: number;
  longitude?: number;
}

export function ISSTrackingCard({ latitude, longitude }: ISSTrackingCardProps) {
  const queryParams = latitude && longitude 
    ? `?lat=${latitude}&lon=${longitude}` 
    : "";

  const { data: issData, isLoading, error, refetch, isFetching } = useQuery<ISSTrackingData>({
    queryKey: ["/api/iss", latitude, longitude],
    queryFn: ({ queryKey }) => {
      const url = `/api/iss${queryParams}`;
      return fetch(url, { credentials: "include" }).then(res => {
        if (!res.ok) throw new Error("Failed to fetch ISS data");
        return res.json();
      });
    },
    staleTime: 1000 * 30,
    refetchInterval: 1000 * 60,
    retry: 2,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Orbit className="w-5 h-5 text-blue-500" />
            <CardTitle className="text-base sm:text-lg">ISS Tracker</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error || !issData) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Orbit className="w-5 h-5 text-blue-500" />
            <CardTitle className="text-base sm:text-lg">ISS Tracker</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4 text-muted-foreground">
            <Orbit className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Unable to load ISS data</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { position, astronautCount, overLocation } = issData;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Orbit className="w-5 h-5 text-blue-500 shrink-0" />
            <CardTitle className="text-base sm:text-lg">ISS Tracker</CardTitle>
          </div>
          <Button 
            variant="ghost" 
            size="icon"
            className="h-8 w-8"
            onClick={() => refetch()}
            disabled={isFetching}
            data-testid="button-refresh-iss"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
        <CardDescription className="text-xs">
          International Space Station • Live
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {position && (
          <div className="p-3 rounded-lg bg-gradient-to-br from-blue-500/10 via-indigo-500/5 to-purple-500/10 border border-blue-500/20">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <MapPin className="w-4 h-4 text-blue-500 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Currently over</p>
                  <p className="font-medium text-sm truncate" data-testid="text-iss-location">
                    {overLocation || "Calculating..."}
                  </p>
                </div>
              </div>
              <Badge 
                variant="secondary" 
                className={`shrink-0 text-xs ${
                  position.visibility === "daylight" 
                    ? "bg-amber-500/20 text-amber-600 dark:text-amber-400" 
                    : "bg-indigo-500/20 text-indigo-600 dark:text-indigo-400"
                }`}
              >
                {position.visibility === "daylight" ? "In Sunlight" : "In Shadow"}
              </Badge>
            </div>
            
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 bg-background/50 rounded-md">
                <Mountain className="w-3 h-3 mx-auto mb-1 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Altitude</p>
                <p className="font-mono text-sm font-semibold" data-testid="text-iss-altitude">
                  {Math.round(position.altitude)} km
                </p>
              </div>
              <div className="p-2 bg-background/50 rounded-md">
                <Gauge className="w-3 h-3 mx-auto mb-1 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Speed</p>
                <p className="font-mono text-sm font-semibold" data-testid="text-iss-speed">
                  {Math.round(position.velocity).toLocaleString()} km/h
                </p>
              </div>
              <div className="p-2 bg-background/50 rounded-md">
                <Users className="w-3 h-3 mx-auto mb-1 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Crew</p>
                <p className="font-mono text-sm font-semibold" data-testid="text-iss-crew">
                  {astronautCount}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="p-2 bg-muted/30 border border-muted rounded-lg">
          <div className="flex items-center gap-2 mb-1">
            <Eye className="w-3.5 h-3.5 text-muted-foreground" />
            <p className="text-xs font-medium text-muted-foreground">Visibility Tips</p>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            The ISS is best seen shortly after sunset or before sunrise when it reflects sunlight against a dark sky. 
            Look for a bright, steady light moving across the sky.
          </p>
        </div>

        <div className="flex items-center justify-between pt-2 border-t text-xs text-muted-foreground">
          <span>Orbits Earth every 92 minutes</span>
          <span>Mag: -4 to -6</span>
        </div>
      </CardContent>
    </Card>
  );
}
