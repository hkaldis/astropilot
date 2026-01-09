import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Pencil, Trash2, Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface EquipmentSpec {
  label: string;
  value: string | number;
  unit?: string;
}

interface EquipmentCardProps {
  title: string;
  icon?: React.ReactNode;
  specs: EquipmentSpec[];
  badge?: string;
  onEdit?: () => void;
  onDelete?: () => void;
  className?: string;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
}

export function EquipmentCard({
  title,
  icon,
  specs,
  badge,
  onEdit,
  onDelete,
  className,
  isFavorite,
  onToggleFavorite,
}: EquipmentCardProps) {
  return (
    <Card className={cn("hover-elevate transition-shadow group", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0 flex-1">
            {icon && <span className="text-muted-foreground shrink-0 mt-0.5">{icon}</span>}
            <CardTitle className="text-base font-semibold break-words">{title}</CardTitle>
            {isFavorite && (
              <Star className="w-4 h-4 text-chart-4 fill-chart-4 shrink-0 mt-0.5" />
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
            {onToggleFavorite && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onToggleFavorite}
                    className="h-7 w-7"
                    data-testid={`button-favorite-${title.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <Star className={cn("h-3.5 w-3.5", isFavorite ? "text-chart-4 fill-chart-4" : "")} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {isFavorite ? "Remove as favorite" : "Set as favorite"}
                </TooltipContent>
              </Tooltip>
            )}
            {onEdit && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onEdit}
                className="h-7 w-7"
                data-testid={`button-edit-${title.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
            {onDelete && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onDelete}
                className="h-7 w-7 text-destructive"
                data-testid={`button-delete-${title.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
        {badge && <Badge variant="secondary" className="w-fit mt-1">{badge}</Badge>}
      </CardHeader>
      <CardContent>
        <div className="divide-y divide-border">
          {specs.map((spec, index) => (
            <div key={index} className="flex justify-between py-2 first:pt-0 last:pb-0">
              <span className="text-sm font-medium text-muted-foreground">{spec.label}</span>
              <span className="text-sm font-mono">
                {spec.value}{spec.unit && <span className="text-muted-foreground ml-1">{spec.unit}</span>}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
