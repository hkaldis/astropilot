import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  MapPin, 
  Calendar, 
  ChevronRight, 
  ChevronDown,
  Cloud, 
  Eye, 
  Wind, 
  Droplets, 
  Moon,
  Camera,
  Star,
  Sparkles,
  CircleDot,
  Circle,
  Orbit,
  Atom,
  Zap,
  Flame,
  Rocket,
  type LucideIcon
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import type { ObservationSession, Location, Observation, CelestialObject } from "@shared/schema";

type ObservationWithObject = Observation & { object: CelestialObject };

interface SessionCardProps {
  session: ObservationSession & { 
    location?: Location | null;
    observations?: ObservationWithObject[];
  };
  observationCount: number;
  onClick?: () => void;
  compact?: boolean;
}

const categoryIconMap: Record<string, LucideIcon> = {
  planet: Orbit,
  galaxy: Sparkles,
  nebula: Cloud,
  open_cluster: Star,
  globular_cluster: Circle,
  double_star: Zap,
  emission_nebula: Flame,
  planetary_nebula: Atom,
  supernova_remnant: Flame,
  moon: Moon,
  comet: Rocket,
  meteor_shower: Sparkles,
};

const getCategoryColor = (category: string) => {
  switch (category) {
    case "planet":
      return "bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30";
    case "galaxy":
      return "bg-purple-500/20 text-purple-600 dark:text-purple-400 border-purple-500/30";
    case "nebula":
    case "emission_nebula":
    case "planetary_nebula":
      return "bg-pink-500/20 text-pink-600 dark:text-pink-400 border-pink-500/30";
    case "open_cluster":
    case "globular_cluster":
      return "bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30";
    case "double_star":
      return "bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border-cyan-500/30";
    case "moon":
      return "bg-slate-500/20 text-slate-600 dark:text-slate-400 border-slate-500/30";
    case "comet":
      return "bg-teal-500/20 text-teal-600 dark:text-teal-400 border-teal-500/30";
    case "meteor_shower":
      return "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border-yellow-500/30";
    default:
      return "bg-primary/20 text-primary border-primary/30";
  }
};

function CategoryIcon({ category, className }: { category: string; className?: string }) {
  const Icon = categoryIconMap[category] ?? Star;
  return <Icon className={cn("w-3.5 h-3.5", className)} />;
}

function ScoreCircle({ score, maxScore, label }: { 
  score: number; 
  maxScore: number; 
  label: string;
}) {
  const percentage = (score / maxScore) * 100;
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;
  
  const getColor = () => {
    if (percentage >= 80) return "#34d399";
    if (percentage >= 60) return "#fbbf24";
    if (percentage >= 40) return "#f97316";
    return "#ef4444";
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex flex-col items-center gap-0.5 cursor-help" data-testid={`score-circle-${label.toLowerCase()}`}>
          <div className="relative w-11 h-11">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 44 44">
              <circle
                cx="22"
                cy="22"
                r={radius}
                stroke="currentColor"
                strokeWidth="3"
                fill="none"
                className="text-muted/20"
              />
              <circle
                cx="22"
                cy="22"
                r={radius}
                stroke={getColor()}
                strokeWidth="3"
                fill="none"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="font-mono text-sm font-bold" style={{ color: getColor() }}>
                {score.toFixed(0)}
              </span>
            </div>
          </div>
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium">
            {label}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p>{label} Score: {score.toFixed(1)}/{maxScore}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function ConditionIndicator({ 
  icon: Icon, 
  value, 
  maxValue, 
  label,
  suffix = "",
  inverted = false 
}: { 
  icon: typeof Cloud; 
  value: number | null | undefined; 
  maxValue: number;
  label: string;
  suffix?: string;
  inverted?: boolean;
}) {
  if (value === null || value === undefined) return null;
  
  const percentage = inverted 
    ? ((maxValue - value) / maxValue) * 100 
    : (value / maxValue) * 100;
  
  const getColor = () => {
    if (percentage >= 75) return "text-emerald-500";
    if (percentage >= 50) return "text-amber-500";
    if (percentage >= 25) return "text-orange-500";
    return "text-red-500";
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1.5 cursor-help" data-testid={`condition-${label.toLowerCase().replace(/\s+/g, '-')}`}>
          <Icon className={cn("w-3.5 h-3.5", getColor())} />
          <span className="text-xs font-mono text-muted-foreground">
            {value}{suffix}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p>{label}: {value}{suffix}</p>
      </TooltipContent>
    </Tooltip>
  );
}

export function SessionCard({ session, observationCount, onClick, compact = false }: SessionCardProps) {
  const [showConditions, setShowConditions] = useState(false);
  
  const observations = session.observations ?? [];
  const hasPhotos = observations.some(obs => obs.imagingDone);
  const bestRating = Math.max(...observations.map(obs => obs.visibilityRating ?? 0), 0);
  const photoCount = observations.filter(obs => obs.imagingDone).length;

  const avgCloudCover = session.lowCloudPct !== null && session.midCloudPct !== null && session.highCloudPct !== null
    ? Math.round((session.lowCloudPct + session.midCloudPct + session.highCloudPct) / 3)
    : null;

  const getScoreQuality = (score: number | null | undefined) => {
    if (score === null || score === undefined) return { color: "bg-muted", textColor: "text-muted-foreground", label: "N/A" };
    if (score >= 8) return { color: "bg-emerald-500", textColor: "text-emerald-500", label: "Excellent" };
    if (score >= 6) return { color: "bg-green-500", textColor: "text-green-500", label: "Good" };
    if (score >= 4) return { color: "bg-amber-500", textColor: "text-amber-500", label: "Fair" };
    if (score >= 2) return { color: "bg-orange-500", textColor: "text-orange-500", label: "Poor" };
    return { color: "bg-red-500", textColor: "text-red-500", label: "Bad" };
  };

  const uniqueCategories = Array.from(new Set(observations.map(obs => obs.object?.category).filter(Boolean))).slice(0, 4);
  const scoreQuality = getScoreQuality(session.totalScore);

  if (compact) {
    return (
      <Card 
        className="hover-elevate cursor-pointer overflow-hidden group"
        onClick={onClick}
        data-testid={`card-session-${session.id}`}
      >
        <CardContent className="p-0">
          <div className="flex">
            <div className={cn("w-1 shrink-0 transition-all group-hover:w-1.5", scoreQuality.color)} />
            <div className="flex-1 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className={cn(
                        "w-10 h-10 rounded-lg flex items-center justify-center shrink-0 cursor-help",
                        "bg-gradient-to-br",
                        session.totalScore !== null && session.totalScore !== undefined
                          ? session.totalScore >= 8 ? "from-emerald-500/20 to-emerald-600/10"
                          : session.totalScore >= 6 ? "from-green-500/20 to-green-600/10"
                          : session.totalScore >= 4 ? "from-amber-500/20 to-amber-600/10"
                          : session.totalScore >= 2 ? "from-orange-500/20 to-orange-600/10"
                          : "from-red-500/20 to-red-600/10"
                          : "from-muted/20 to-muted/10"
                      )}>
                        <span className={cn("font-mono text-lg font-bold", scoreQuality.textColor)}>
                          {session.totalScore?.toFixed(0) ?? "?"}
                        </span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{scoreQuality.label} night (Score: {session.totalScore?.toFixed(1) ?? "N/A"}/10)</p>
                    </TooltipContent>
                  </Tooltip>
                  
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">
                        {formatDistanceToNow(new Date(session.date), { addSuffix: true })}
                      </span>
                      {session.location && (
                        <>
                          <span className="text-muted-foreground/50">·</span>
                          <span className="text-sm text-muted-foreground truncate">
                            {session.location.name}
                          </span>
                        </>
                      )}
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      <Badge 
                        variant="secondary" 
                        className="text-xs py-0 px-1.5 h-5 font-normal"
                        data-testid="badge-observation-count"
                      >
                        {observationCount} {observationCount === 1 ? "object" : "objects"}
                      </Badge>
                      
                      {observations.length > 0 && (
                        <>
                          {observations.slice(0, 3).map((obs) => (
                            <Badge 
                              key={obs.id}
                              variant="outline"
                              className={cn(
                                "text-xs py-0 px-1.5 h-5 gap-1 font-normal",
                                getCategoryColor(obs.object?.category ?? "")
                              )}
                              data-testid={`badge-object-${obs.id}`}
                            >
                              <CategoryIcon category={obs.object?.category ?? ""} className="w-2.5 h-2.5" />
                              <span className="truncate max-w-[70px]">
                                {obs.object?.catalogId || obs.object?.name || "Unknown"}
                              </span>
                            </Badge>
                          ))}
                          {observations.length > 3 && (
                            <Badge variant="secondary" className="text-xs py-0 px-1.5 h-5 font-normal">
                              +{observations.length - 3}
                            </Badge>
                          )}
                        </>
                      )}
                      
                      {hasPhotos && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge 
                              variant="secondary" 
                              className="text-xs py-0 px-1.5 h-5 gap-1 font-normal bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                              data-testid="badge-photo-count"
                            >
                              <Camera className="w-2.5 h-2.5" />
                              {photoCount}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{photoCount} {photoCount === 1 ? "photo" : "photos"} taken</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                      
                      {bestRating >= 4 && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge 
                              variant="secondary" 
                              className="text-xs py-0 px-1.5 h-5 gap-0.5 font-normal bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                              data-testid="badge-best-rating"
                            >
                              {Array.from({ length: Math.min(bestRating, 5) }).map((_, i) => (
                                <Star key={i} className="w-2.5 h-2.5 fill-current" />
                              ))}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Best rating: {bestRating}/5 stars</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </div>
                </div>
                
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-3 opacity-50 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card 
      className={cn("hover-elevate overflow-hidden", onClick && "cursor-pointer")}
      onClick={onClick}
      data-testid={`card-session-${session.id}`}
    >
      <CardContent className="p-0">
        <div className="flex">
          <div className="w-1.5 bg-gradient-to-b from-primary via-primary/70 to-primary/40 shrink-0" />
          
          <div className="flex-1 p-5">
            <div className="flex flex-col lg:flex-row lg:items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Calendar className="w-4 h-4" />
                    <span className="text-sm font-medium">
                      {format(new Date(session.date), "EEEE, MMMM d, yyyy")}
                    </span>
                  </div>
                  {session.location && (
                    <>
                      <span className="text-muted-foreground/50 hidden sm:inline">|</span>
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium">{session.location.name}</span>
                        <Badge variant="outline" className="font-mono text-xs">
                          B{session.bortle}
                        </Badge>
                      </div>
                    </>
                  )}
                </div>

                {observations.length > 0 && (
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles className="w-4 h-4 text-primary" />
                      <span className="text-sm font-medium text-muted-foreground">
                        Objects Observed
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {observations.slice(0, 8).map((obs) => (
                        <Badge 
                          key={obs.id}
                          variant="outline"
                          className={cn(
                            "font-medium transition-colors gap-1.5",
                            getCategoryColor(obs.object?.category ?? "")
                          )}
                          data-testid={`badge-object-${obs.id}`}
                        >
                          <CategoryIcon category={obs.object?.category ?? ""} />
                          {obs.object?.name || obs.object?.catalogId}
                          {obs.visibilityRating && obs.visibilityRating >= 4 && (
                            <Star className="w-3 h-3 fill-current" />
                          )}
                        </Badge>
                      ))}
                      {observations.length > 8 && (
                        <Badge variant="secondary" className="font-mono">
                          +{observations.length - 8} more
                        </Badge>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant="secondary" className="gap-1.5" data-testid="badge-observation-count">
                    <CircleDot className="w-3 h-3" />
                    {observationCount} {observationCount === 1 ? "observation" : "observations"}
                  </Badge>
                  
                  {hasPhotos && (
                    <Badge 
                      variant="secondary" 
                      className="gap-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                      data-testid="badge-photo-count"
                    >
                      <Camera className="w-3 h-3" />
                      {photoCount} imaged
                    </Badge>
                  )}
                  
                  {bestRating >= 4 && (
                    <Badge 
                      variant="secondary" 
                      className="gap-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                      data-testid="badge-best-rating"
                    >
                      {Array.from({ length: bestRating }).map((_, i) => (
                        <Star key={i} className="w-3 h-3 fill-current" />
                      ))}
                    </Badge>
                  )}
                </div>

                {session.notes && (
                  <p className="text-sm text-muted-foreground mt-3 line-clamp-2 italic">
                    "{session.notes}"
                  </p>
                )}
              </div>

              <div className="flex lg:flex-col items-center gap-3 lg:gap-2 shrink-0">
                <div className="flex gap-2">
                  <ScoreCircle 
                    score={session.totalScore ?? 0} 
                    maxScore={10} 
                    label="Total"
                  />
                  <ScoreCircle 
                    score={session.planetScore ?? 0} 
                    maxScore={10} 
                    label="Planet"
                  />
                  <ScoreCircle 
                    score={session.dsoScore ?? 0} 
                    maxScore={10} 
                    label="DSO"
                  />
                </div>
              </div>
            </div>

            <Collapsible open={showConditions} onOpenChange={setShowConditions}>
              <div className="flex items-center justify-between mt-4 pt-3 border-t">
                <div className="flex items-center gap-4">
                  <ConditionIndicator 
                    icon={Cloud} 
                    value={avgCloudCover} 
                    maxValue={100} 
                    label="Cloud Cover"
                    suffix="%"
                    inverted
                  />
                  <ConditionIndicator 
                    icon={Eye} 
                    value={session.seeing} 
                    maxValue={3} 
                    label="Seeing"
                  />
                  <ConditionIndicator 
                    icon={Wind} 
                    value={session.jetstream} 
                    maxValue={2} 
                    label="Jetstream"
                  />
                  <ConditionIndicator 
                    icon={Droplets} 
                    value={session.humidity} 
                    maxValue={100} 
                    label="Humidity"
                    suffix="%"
                    inverted
                  />
                  {session.moonIllumination !== null && session.moonIllumination !== undefined && (
                    <ConditionIndicator 
                      icon={Moon} 
                      value={session.moonIllumination} 
                      maxValue={100} 
                      label="Moon Illumination"
                      suffix="%"
                      inverted
                    />
                  )}
                </div>
                
                <div className="flex items-center gap-2">
                  <CollapsibleTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="text-muted-foreground h-7 px-2"
                      onClick={(e) => e.stopPropagation()}
                      data-testid="button-toggle-conditions"
                    >
                      <span className="text-xs mr-1">Details</span>
                      <ChevronDown className={cn(
                        "w-3 h-3 transition-transform",
                        showConditions && "rotate-180"
                      )} />
                    </Button>
                  </CollapsibleTrigger>
                  
                  {onClick && (
                    <Button variant="ghost" size="sm" className="h-7 px-2" data-testid="button-view-session">
                      <span className="text-xs mr-1">View</span>
                      <ChevronRight className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </div>
              
              <CollapsibleContent>
                <div className="mt-3 p-3 bg-muted/30 rounded-lg space-y-2" data-testid="conditions-detail">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    {session.lowCloudPct !== null && (
                      <div>
                        <span className="text-muted-foreground">Low Clouds:</span>
                        <span className="ml-2 font-mono">{session.lowCloudPct}%</span>
                      </div>
                    )}
                    {session.midCloudPct !== null && (
                      <div>
                        <span className="text-muted-foreground">Mid Clouds:</span>
                        <span className="ml-2 font-mono">{session.midCloudPct}%</span>
                      </div>
                    )}
                    {session.highCloudPct !== null && (
                      <div>
                        <span className="text-muted-foreground">High Clouds:</span>
                        <span className="ml-2 font-mono">{session.highCloudPct}%</span>
                      </div>
                    )}
                    {session.seeing !== null && (
                      <div>
                        <span className="text-muted-foreground">Seeing:</span>
                        <span className="ml-2 font-mono">{session.seeing}/3</span>
                      </div>
                    )}
                    {session.jetstream !== null && (
                      <div>
                        <span className="text-muted-foreground">Jetstream:</span>
                        <span className="ml-2 font-mono">{session.jetstream}/2</span>
                      </div>
                    )}
                    {session.humidity !== null && (
                      <div>
                        <span className="text-muted-foreground">Humidity:</span>
                        <span className="ml-2 font-mono">{session.humidity}%</span>
                      </div>
                    )}
                    {session.moonIllumination !== null && (
                      <div>
                        <span className="text-muted-foreground">Moon:</span>
                        <span className="ml-2 font-mono">{session.moonIllumination}%</span>
                      </div>
                    )}
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
