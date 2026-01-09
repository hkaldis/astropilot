import { useEffect, useState } from "react";
import { Trophy, Zap, Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface StarParticle {
  id: number;
  x: number;
  y: number;
  size: number;
  delay: number;
  duration: number;
  color: string;
}

function generateStars(count: number, colors: string[]): StarParticle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 360 - 180,
    y: Math.random() * 360 - 180,
    size: Math.random() * 8 + 4,
    delay: Math.random() * 200,
    duration: Math.random() * 400 + 400,
    color: colors[Math.floor(Math.random() * colors.length)],
  }));
}

interface CelebratoryToastContentProps {
  type: "badge" | "levelUp";
  title: string;
  description?: string;
  badgeTier?: "bronze" | "silver" | "gold" | "special";
  level?: number;
  levelTitle?: string;
}

export function CelebratoryToastContent({
  type,
  title,
  description,
  badgeTier = "bronze",
  level,
  levelTitle,
}: CelebratoryToastContentProps) {
  const [stars, setStars] = useState<StarParticle[]>([]);
  const [animating, setAnimating] = useState(true);

  const starColors = type === "levelUp" 
    ? ["#a855f7", "#c084fc", "#fbbf24", "#ffffff", "#818cf8"]
    : badgeTier === "gold" 
    ? ["#fbbf24", "#f59e0b", "#fcd34d", "#ffffff"]
    : badgeTier === "special"
    ? ["#a855f7", "#ec4899", "#f472b6", "#ffffff"]
    : badgeTier === "silver"
    ? ["#94a3b8", "#cbd5e1", "#ffffff", "#e2e8f0"]
    : ["#d97706", "#f59e0b", "#fbbf24", "#ffffff"];

  const starCount = type === "levelUp" ? 12 : 8;

  useEffect(() => {
    setStars(generateStars(starCount, starColors));
    const timer = setTimeout(() => setAnimating(false), 800);
    return () => clearTimeout(timer);
  }, []);

  const getBorderGradient = () => {
    if (type === "levelUp") {
      return "bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500";
    }
    switch (badgeTier) {
      case "gold": return "bg-gradient-to-r from-yellow-400 via-yellow-500 to-amber-500";
      case "special": return "bg-gradient-to-r from-purple-500 via-pink-500 to-rose-500";
      case "silver": return "bg-gradient-to-r from-slate-300 via-slate-400 to-slate-300";
      default: return "bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600";
    }
  };

  const getIconBg = () => {
    if (type === "levelUp") {
      return "bg-gradient-to-br from-indigo-500 to-purple-600";
    }
    switch (badgeTier) {
      case "gold": return "bg-gradient-to-br from-yellow-400 to-amber-500";
      case "special": return "bg-gradient-to-br from-purple-500 to-pink-500";
      case "silver": return "bg-gradient-to-br from-slate-300 to-slate-400";
      default: return "bg-gradient-to-br from-amber-600 to-amber-700";
    }
  };

  return (
    <div className="relative overflow-visible">
      <div className={cn(
        "absolute -inset-[2px] rounded-lg opacity-75",
        getBorderGradient()
      )} />
      
      <div className="relative bg-background rounded-lg p-4">
        <div className="flex items-start gap-3">
          <div className="relative">
            <div className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center shadow-lg",
              getIconBg(),
              type === "levelUp" && "animate-pulse"
            )}>
              {type === "levelUp" ? (
                level !== undefined ? (
                  <span className="text-lg font-bold text-white">{level}</span>
                ) : (
                  <Zap className="w-5 h-5 text-white" />
                )
              ) : (
                <Trophy className="w-5 h-5 text-white" />
              )}
            </div>
            
            {animating && stars.map((star) => (
              <div
                key={star.id}
                className="absolute pointer-events-none"
                style={{
                  left: "50%",
                  top: "50%",
                  animation: `star-burst ${star.duration}ms ease-out ${star.delay}ms forwards`,
                  transform: `translate(-50%, -50%)`,
                  ["--star-x" as string]: `${star.x}px`,
                  ["--star-y" as string]: `${star.y}px`,
                }}
              >
                <Star
                  className="fill-current"
                  style={{
                    width: star.size,
                    height: star.size,
                    color: star.color,
                  }}
                />
              </div>
            ))}
          </div>
          
          <div className="flex-1 min-w-0">
            <p className={cn(
              "font-semibold text-sm",
              type === "levelUp" && "bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent"
            )}>
              {title}
            </p>
            {description && (
              <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                {description}
              </p>
            )}
            {type === "levelUp" && levelTitle && (
              <p className="text-xs text-purple-400 mt-1 font-medium">
                {levelTitle}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export const celebratoryToastStyles = `
@keyframes star-burst {
  0% {
    opacity: 1;
    transform: translate(-50%, -50%) translate(0, 0) scale(0);
  }
  50% {
    opacity: 1;
    transform: translate(-50%, -50%) translate(calc(var(--star-x) * 0.5), calc(var(--star-y) * 0.5)) scale(1);
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -50%) translate(var(--star-x), var(--star-y)) scale(0.5);
  }
}
`;
