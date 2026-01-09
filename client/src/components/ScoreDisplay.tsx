import { cn } from "@/lib/utils";

interface ScoreDisplayProps {
  score: number;
  maxScore: number;
  label: string;
  size?: "sm" | "md" | "lg";
  variant?: "total" | "planet" | "dso";
}

export function ScoreDisplay({
  score,
  maxScore,
  label,
  size = "md",
  variant = "total",
}: ScoreDisplayProps) {
  const safeScore = score ?? 0;
  const percentage = (safeScore / maxScore) * 100;
  
  const getColorClass = () => {
    if (percentage >= 80) return "text-emerald-400";
    if (percentage >= 60) return "text-chart-4";
    if (percentage >= 40) return "text-chart-5";
    return "text-destructive";
  };

  const getStrokeColor = () => {
    if (percentage >= 80) return "#34d399";
    if (percentage >= 60) return "hsl(43 74% 65%)";
    if (percentage >= 40) return "hsl(27 87% 65%)";
    return "hsl(0 84% 60%)";
  };

  const sizes = {
    sm: { container: "w-16 h-16", text: "text-lg", label: "text-[10px]", stroke: 4 },
    md: { container: "w-24 h-24", text: "text-2xl", label: "text-xs", stroke: 5 },
    lg: { container: "w-32 h-32", text: "text-4xl", label: "text-sm", stroke: 6 },
  };

  const { container, text, label: labelSize, stroke } = sizes[size];
  const radius = 50 - stroke;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className={cn("relative", container)}>
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle
            cx="50"
            cy="50"
            r={radius}
            stroke="currentColor"
            strokeWidth={stroke}
            fill="none"
            className="text-muted/30"
          />
          <circle
            cx="50"
            cy="50"
            r={radius}
            stroke={getStrokeColor()}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-500 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={cn("font-mono font-bold", text, getColorClass())}>
            {safeScore.toFixed(0)}
          </span>
        </div>
      </div>
      <span className={cn("uppercase tracking-wider font-medium text-muted-foreground", labelSize)}>
        {label}
      </span>
    </div>
  );
}

interface ScoreBarProps {
  label: string;
  value: number;
  maxValue: number;
  segments?: number;
}

export function ScoreBar({ label, value, maxValue, segments = 5 }: ScoreBarProps) {
  const filledSegments = Math.round((value / maxValue) * segments);
  
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-medium text-muted-foreground w-20 truncate">{label}</span>
      <div className="flex gap-1 flex-1">
        {Array.from({ length: segments }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-2 flex-1 rounded-sm transition-colors",
              i < filledSegments ? "bg-primary" : "bg-muted/30"
            )}
          />
        ))}
      </div>
      <span className="font-mono text-xs text-muted-foreground w-8 text-right">
        {value}/{maxValue}
      </span>
    </div>
  );
}

interface VisibilityRatingProps {
  rating: 1 | 2 | 3 | 4 | 5;
  reason?: string;
}

const ratingLabels: Record<number, string> = {
  5: "Excellent",
  4: "Very Good",
  3: "Good",
  2: "Fair",
  1: "Poor",
};

export function VisibilityRating({ rating, reason }: VisibilityRatingProps) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <div className="flex gap-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <svg
              key={i}
              className={cn(
                "w-4 h-4",
                i < rating ? "text-chart-4 fill-chart-4" : "text-muted/30"
              )}
              viewBox="0 0 24 24"
            >
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          ))}
        </div>
        <span className="text-sm font-medium">{ratingLabels[rating]}</span>
      </div>
      {reason && (
        <p className="text-xs text-muted-foreground">{reason}</p>
      )}
    </div>
  );
}

interface InteractiveStarRatingProps {
  value: number | null;
  onChange: (rating: number) => void;
  label?: string;
}

export function InteractiveStarRating({ value, onChange, label }: InteractiveStarRatingProps) {
  return (
    <div className="space-y-2">
      {label && <label className="text-sm font-medium">{label}</label>}
      <div className="flex items-center gap-3">
        <div className="flex gap-1">
          {Array.from({ length: 5 }).map((_, i) => {
            const starValue = i + 1;
            const isFilled = value !== null && starValue <= value;
            return (
              <button
                key={i}
                type="button"
                onClick={() => onChange(starValue)}
                className="p-0.5 rounded transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                data-testid={`star-rating-${starValue}`}
              >
                <svg
                  className={cn(
                    "w-6 h-6 transition-colors",
                    isFilled ? "text-chart-4 fill-chart-4" : "text-muted/40 hover:text-chart-4/50"
                  )}
                  viewBox="0 0 24 24"
                >
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              </button>
            );
          })}
        </div>
        {value !== null && (
          <span className="text-sm font-medium text-muted-foreground">
            {ratingLabels[value]}
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Rate how well you saw this object
      </p>
    </div>
  );
}
