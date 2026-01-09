import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Sun, 
  Activity, 
  Zap, 
  Shield, 
  AlertTriangle, 
  CloudLightning,
  Waves,
  CircleDot,
  Telescope,
  Info
} from "lucide-react";
import { format } from "date-fns";

interface SpaceWeatherData {
  currentConditions: "quiet" | "minor" | "moderate" | "strong" | "severe" | "extreme";
  recentStorms: Array<{
    gstID: string;
    startTime: string;
    allKpIndex?: Array<{
      observedTime: string;
      kpIndex: number;
    }>;
  }>;
  recentFlares: Array<{
    flrID: string;
    beginTime: string;
    classType: string;
  }>;
  auroraLikelihood: "low" | "moderate" | "high" | "very_high";
  kpIndex: number | null;
  lastUpdated: string;
  summary: string;
  observingImpact: "none" | "minimal" | "minor" | "moderate" | "significant";
  observingAdvice: string;
}

const conditionConfig = {
  quiet: {
    label: "Quiet",
    color: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
    icon: Shield,
    description: "Calm solar conditions",
  },
  minor: {
    label: "Minor Activity",
    color: "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border-yellow-500/30",
    icon: Activity,
    description: "Slight solar activity",
  },
  moderate: {
    label: "Moderate",
    color: "bg-orange-500/20 text-orange-600 dark:text-orange-400 border-orange-500/30",
    icon: Zap,
    description: "Moderate solar activity",
  },
  strong: {
    label: "Strong",
    color: "bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30",
    icon: CloudLightning,
    description: "Strong solar storm",
  },
  severe: {
    label: "Severe",
    color: "bg-purple-500/20 text-purple-600 dark:text-purple-400 border-purple-500/30",
    icon: AlertTriangle,
    description: "Severe geomagnetic storm",
  },
  extreme: {
    label: "Extreme",
    color: "bg-pink-500/20 text-pink-600 dark:text-pink-400 border-pink-500/30",
    icon: AlertTriangle,
    description: "Extreme solar storm",
  },
};

const auroraConfig = {
  low: {
    label: "Low",
    color: "text-muted-foreground",
    visibility: "Polar regions only",
  },
  moderate: {
    label: "Moderate",
    color: "text-emerald-500",
    visibility: "High latitudes (60°+)",
  },
  high: {
    label: "High",
    color: "text-cyan-500",
    visibility: "Mid-high latitudes (50°+)",
  },
  very_high: {
    label: "Very High",
    color: "text-purple-500",
    visibility: "Visible at lower latitudes",
  },
};

function KpIndexGauge({ kpIndex }: { kpIndex: number | null }) {
  if (kpIndex === null) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <CircleDot className="w-4 h-4" />
        <span className="text-sm">No recent data</span>
      </div>
    );
  }

  const getKpColor = (kp: number) => {
    if (kp < 4) return "bg-emerald-500";
    if (kp < 5) return "bg-yellow-500";
    if (kp < 6) return "bg-orange-500";
    if (kp < 7) return "bg-red-500";
    return "bg-purple-500";
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Kp Index</span>
        <span className="font-mono font-semibold">{kpIndex}</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full ${getKpColor(kpIndex)} transition-all duration-500`}
          style={{ width: `${(kpIndex / 9) * 100}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>0</span>
        <span>9</span>
      </div>
    </div>
  );
}

export function SpaceWeatherCard() {
  const { data: weather, isLoading, error } = useQuery<SpaceWeatherData>({
    queryKey: ["/api/nasa/space-weather"],
    staleTime: 1000 * 60 * 15,
    retry: 2,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Sun className="w-5 h-5 text-amber-500" />
            <CardTitle className="text-base sm:text-lg">Space Weather</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error || !weather) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Sun className="w-5 h-5 text-amber-500" />
            <CardTitle className="text-base sm:text-lg">Space Weather</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4 text-muted-foreground">
            <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Unable to load space weather</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const condition = conditionConfig[weather.currentConditions];
  const aurora = auroraConfig[weather.auroraLikelihood];
  const ConditionIcon = condition.icon;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Sun className="w-5 h-5 text-amber-500 shrink-0" />
            <CardTitle className="text-base sm:text-lg">Space Weather</CardTitle>
          </div>
          <Badge variant="secondary" className="shrink-0 text-xs">
            NASA DONKI
          </Badge>
        </div>
        <CardDescription className="text-xs">
          Updated {format(new Date(weather.lastUpdated), "h:mm a")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className={`flex items-center gap-3 p-3 rounded-lg border ${condition.color}`}>
          <ConditionIcon className="w-8 h-8 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-sm sm:text-base">{condition.label}</p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground leading-relaxed" data-testid="text-space-weather-summary">
          {weather.summary}
        </p>

        <div className="grid grid-cols-2 gap-3">
          <KpIndexGauge kpIndex={weather.kpIndex} />
          
          <div className="flex flex-col justify-center p-2 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-1.5 mb-1">
              <Waves className="w-3 h-3 text-cyan-500" />
              <span className="text-[10px] text-muted-foreground uppercase">Aurora</span>
            </div>
            <p className={`font-semibold text-sm ${aurora.color}`}>{aurora.label}</p>
            <p className="text-[10px] text-muted-foreground">{aurora.visibility}</p>
          </div>
        </div>

        <div className="flex items-start gap-2 p-2 bg-primary/5 border border-primary/10 rounded-lg">
          <Telescope className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-primary mb-0.5">Observing Outlook</p>
            <p className="text-xs text-muted-foreground leading-relaxed" data-testid="text-observing-advice">
              {weather.observingAdvice}
            </p>
          </div>
        </div>

        {weather.recentFlares.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Recent Solar Flares
            </p>
            <div className="flex flex-wrap gap-1.5">
              {weather.recentFlares.slice(0, 4).map((flare) => (
                <Badge
                  key={flare.flrID}
                  variant="outline"
                  className={`text-xs ${
                    flare.classType.startsWith("X")
                      ? "border-red-500 text-red-500"
                      : "border-orange-500 text-orange-500"
                  }`}
                  data-testid={`badge-flare-${flare.flrID}`}
                >
                  {flare.classType}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {weather.recentStorms.length > 0 && (
          <div className="space-y-1.5 pt-2 border-t">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Recent Geomagnetic Storms
            </p>
            <div className="space-y-1">
              {weather.recentStorms.slice(0, 2).map((storm) => (
                <div
                  key={storm.gstID}
                  className="flex items-center justify-between text-xs"
                  data-testid={`row-storm-${storm.gstID}`}
                >
                  <span className="text-muted-foreground">
                    {format(new Date(storm.startTime), "MMM d, h:mm a")}
                  </span>
                  {storm.allKpIndex?.[0] && (
                    <Badge variant="secondary" className="text-[10px]">
                      Kp {storm.allKpIndex[0].kpIndex}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
