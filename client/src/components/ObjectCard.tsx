import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Star, Sparkles } from "lucide-react";
import type { CelestialObject } from "@shared/schema";

interface ObjectCardProps {
  object: CelestialObject;
  onClick?: () => void;
  isFavorite?: boolean;
  hasObserved?: boolean;
}

const categoryColors: Record<string, string> = {
  planet: "bg-chart-4/20 text-chart-4 border-chart-4/30",
  moon: "bg-muted text-muted-foreground border-muted-foreground/30",
  nebula: "bg-chart-2/20 text-chart-2 border-chart-2/30",
  emission_nebula: "bg-chart-2/20 text-chart-2 border-chart-2/30",
  reflection_nebula: "bg-sky-500/20 text-sky-500 border-sky-500/30",
  dark_nebula: "bg-slate-500/20 text-slate-400 border-slate-400/30",
  mixed_nebula: "bg-chart-2/20 text-chart-2 border-chart-2/30",
  open_cluster: "bg-chart-3/20 text-chart-3 border-chart-3/30",
  globular_cluster: "bg-chart-3/20 text-chart-3 border-chart-3/30",
  planetary_nebula: "bg-chart-2/20 text-chart-2 border-chart-2/30",
  galaxy: "bg-chart-1/20 text-chart-1 border-chart-1/30",
  double_star: "bg-chart-5/20 text-chart-5 border-chart-5/30",
  asterism: "bg-muted text-muted-foreground border-muted-foreground/30",
  supernova_remnant: "bg-chart-2/20 text-chart-2 border-chart-2/30",
  comet: "bg-teal-500/20 text-teal-400 border-teal-500/30",
  meteor_shower: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
};

const difficultyColors: Record<string, string> = {
  easy: "bg-emerald-500/20 text-emerald-400",
  moderate: "bg-chart-4/20 text-chart-4",
  challenging: "bg-chart-5/20 text-chart-5",
  difficult: "bg-destructive/20 text-destructive",
  expert: "bg-chart-2/20 text-chart-2",
};

const categoryLabels: Record<string, string> = {
  planet: "Planet",
  moon: "Moon",
  nebula: "Nebula",
  emission_nebula: "Emission Neb.",
  reflection_nebula: "Reflection Neb.",
  dark_nebula: "Dark Nebula",
  mixed_nebula: "Mixed Nebula",
  open_cluster: "Open Cluster",
  globular_cluster: "Globular",
  planetary_nebula: "Planetary Neb.",
  galaxy: "Galaxy",
  double_star: "Double Star",
  asterism: "Asterism",
  supernova_remnant: "SNR",
  comet: "Comet",
  meteor_shower: "Meteor Shower",
};

export function ObjectCard({ object, onClick, isFavorite, hasObserved }: ObjectCardProps) {
  return (
    <Card
      className={cn(
        "hover-elevate cursor-pointer transition-shadow",
        hasObserved && "border-l-4 border-l-primary"
      )}
      onClick={onClick}
      data-testid={`card-object-${object.catalogId}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-muted-foreground">
                {object.catalogId}
              </span>
              {object.isHot && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Sparkles className="w-3.5 h-3.5 text-chart-4" data-testid={`icon-wow-${object.catalogId}`} />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Impressive object - a must-see!</p>
                  </TooltipContent>
                </Tooltip>
              )}
              {isFavorite && (
                <Star className="w-3.5 h-3.5 text-chart-4 fill-chart-4" />
              )}
            </div>
            <h3 className="font-semibold truncate">{object.name}</h3>
          </div>
          {object.magnitude && (
            <span className="font-mono text-xs text-muted-foreground shrink-0">
              mag {object.magnitude.toFixed(1)}
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5 mb-3">
          <Badge
            variant="outline"
            className={cn("text-[10px]", categoryColors[object.category])}
          >
            {categoryLabels[object.category]}
          </Badge>
          {object.difficulty && (
            <Badge
              variant="secondary"
              className={cn("text-[10px] capitalize", difficultyColors[object.difficulty])}
            >
              {object.difficulty}
            </Badge>
          )}
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          {object.constellation && (
            <span>{object.constellation}</span>
          )}
          <div className="flex items-center gap-2">
            {object.category === "double_star" && object.separation != null && (
              <span className="font-mono">{object.separation.toFixed(1)}"</span>
            )}
            {object.size && (
              <span className="font-mono">{object.size}</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
