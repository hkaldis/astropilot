import { cn } from "@/lib/utils";
import { Crown, Compass, Camera, Telescope, Star, Eye, Target, Sparkles } from "lucide-react";

interface LevelIconProps {
  level: number;
  size?: "sm" | "md" | "lg" | "xl";
  showBadge?: boolean;
  animated?: boolean;
  className?: string;
}

type Era = "stargazer" | "navigator" | "pioneer" | "master";

function getEra(level: number): Era {
  if (level <= 5) return "stargazer";
  if (level <= 10) return "navigator";
  if (level <= 15) return "pioneer";
  return "master";
}

const sizeClasses = {
  sm: { container: "w-10 h-10", text: "text-sm", badge: "w-4 h-4", badgeIcon: "w-2 h-2", ring: 2 },
  md: { container: "w-14 h-14", text: "text-xl", badge: "w-5 h-5", badgeIcon: "w-3 h-3", ring: 3 },
  lg: { container: "w-20 h-20", text: "text-3xl", badge: "w-7 h-7", badgeIcon: "w-4 h-4", ring: 4 },
  xl: { container: "w-28 h-28", text: "text-4xl", badge: "w-9 h-9", badgeIcon: "w-5 h-5", ring: 5 },
};

const eraStyles = {
  stargazer: {
    gradient: "from-slate-500 via-cyan-500 to-slate-600",
    ring: "stroke-cyan-400",
    ringBg: "stroke-slate-700/50",
    glow: "",
    badge: "from-cyan-500 to-slate-600",
    badgeIcon: Telescope,
  },
  navigator: {
    gradient: "from-indigo-500 via-purple-500 to-violet-600",
    ring: "stroke-purple-400",
    ringBg: "stroke-indigo-900/50",
    glow: "drop-shadow-[0_0_8px_rgba(139,92,246,0.3)]",
    badge: "from-purple-500 to-indigo-600",
    badgeIcon: Compass,
  },
  pioneer: {
    gradient: "from-amber-500 via-yellow-500 to-orange-500",
    ring: "stroke-yellow-400",
    ringBg: "stroke-amber-900/50",
    glow: "drop-shadow-[0_0_10px_rgba(245,158,11,0.4)]",
    badge: "from-yellow-400 to-amber-500",
    badgeIcon: Camera,
  },
  master: {
    gradient: "from-purple-600 via-pink-500 to-yellow-400",
    ring: "stroke-yellow-300",
    ringBg: "stroke-purple-900/50",
    glow: "drop-shadow-[0_0_15px_rgba(168,85,247,0.5)]",
    badge: "from-yellow-400 to-purple-500",
    badgeIcon: Crown,
  },
};

function getProgressInEra(level: number): number {
  const era = getEra(level);
  switch (era) {
    case "stargazer": return ((level - 1) / 4) * 100;
    case "navigator": return ((level - 6) / 4) * 100;
    case "pioneer": return ((level - 11) / 4) * 100;
    case "master": return level === 20 ? 100 : ((level - 16) / 3) * 100;
  }
}

function getMarkers(era: Era, level: number): number[] {
  if (era === "stargazer") {
    if (level >= 5) return [0];
    return [];
  }
  if (era === "navigator") {
    const markers = [];
    if (level >= 6) markers.push(0, 90, 180, 270);
    return markers;
  }
  if (era === "pioneer") {
    const markers = [];
    const count = Math.min(level - 10, 5);
    for (let i = 0; i < count; i++) {
      markers.push(i * 72);
    }
    return markers;
  }
  if (era === "master") {
    return [0, 45, 90, 135, 180, 225, 270, 315];
  }
  return [];
}

export function LevelIcon({ 
  level, 
  size = "md", 
  showBadge = true,
  animated = false,
  className 
}: LevelIconProps) {
  const era = getEra(level);
  const style = eraStyles[era];
  const sizeStyle = sizeClasses[size];
  const progress = getProgressInEra(level);
  const markers = getMarkers(era, level);
  const BadgeIcon = style.badgeIcon;
  
  const isMaxLevel = level === 20;
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div className={cn("relative", sizeStyle.container, className)}>
      <svg 
        className={cn(
          "w-full h-full -rotate-90",
          style.glow,
          animated && isMaxLevel && "animate-pulse"
        )} 
        viewBox="0 0 100 100"
      >
        <defs>
          <linearGradient id={`level-gradient-${level}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={era === "master" ? "#9333ea" : era === "pioneer" ? "#f59e0b" : era === "navigator" ? "#6366f1" : "#64748b"} />
            <stop offset="50%" stopColor={era === "master" ? "#ec4899" : era === "pioneer" ? "#eab308" : era === "navigator" ? "#a855f7" : "#06b6d4"} />
            <stop offset="100%" stopColor={era === "master" ? "#fbbf24" : era === "pioneer" ? "#f97316" : era === "navigator" ? "#7c3aed" : "#475569"} />
          </linearGradient>
          
          {isMaxLevel && (
            <filter id="glow-max">
              <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          )}
        </defs>
        
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          strokeWidth={sizeStyle.ring}
          className={style.ringBg}
        />
        
        {era !== "stargazer" && (
          <circle
            cx="50"
            cy="50"
            r={radius - 4}
            fill="none"
            strokeWidth={1}
            className="stroke-current opacity-20"
            style={{ color: era === "master" ? "#fbbf24" : era === "pioneer" ? "#f59e0b" : "#a855f7" }}
          />
        )}
        
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          strokeWidth={sizeStyle.ring + 1}
          stroke={`url(#level-gradient-${level})`}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={isMaxLevel ? 0 : strokeDashoffset}
          className="transition-all duration-700 ease-out"
          filter={isMaxLevel ? "url(#glow-max)" : undefined}
        />
        
        {markers.map((angle, i) => {
          const rad = (angle * Math.PI) / 180;
          const x = 50 + (radius + 2) * Math.cos(rad);
          const y = 50 + (radius + 2) * Math.sin(rad);
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={size === "sm" ? 1.5 : size === "md" ? 2 : 2.5}
              className={cn(
                "transition-all duration-300",
                era === "master" ? "fill-yellow-400" :
                era === "pioneer" ? "fill-amber-400" :
                era === "navigator" ? "fill-purple-400" :
                "fill-cyan-400"
              )}
            />
          );
        })}
        
        {isMaxLevel && (
          <>
            {[0, 60, 120, 180, 240, 300].map((angle, i) => {
              const rad = ((angle - 90) * Math.PI) / 180;
              const x1 = 50 + 35 * Math.cos(rad);
              const y1 = 50 + 35 * Math.sin(rad);
              const x2 = 50 + 48 * Math.cos(rad);
              const y2 = 50 + 48 * Math.sin(rad);
              return (
                <line
                  key={`ray-${i}`}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  strokeWidth={1.5}
                  className="stroke-yellow-400/60"
                  strokeLinecap="round"
                />
              );
            })}
          </>
        )}
      </svg>
      
      <div className={cn(
        "absolute inset-0 flex items-center justify-center rounded-full",
        `bg-gradient-to-br ${style.gradient}`,
        "m-auto",
        size === "sm" ? "w-7 h-7" : size === "md" ? "w-10 h-10" : size === "lg" ? "w-14 h-14" : "w-20 h-20"
      )}>
        <span className={cn(
          "font-bold text-white",
          sizeStyle.text,
          isMaxLevel && "drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]"
        )}>
          {level}
        </span>
      </div>
      
      {showBadge && (
        <div className={cn(
          "absolute -bottom-0.5 -right-0.5 rounded-full flex items-center justify-center shadow-lg",
          `bg-gradient-to-br ${style.badge}`,
          sizeStyle.badge,
          isMaxLevel && "animate-bounce"
        )}>
          <BadgeIcon className={cn(sizeStyle.badgeIcon, "text-white")} />
        </div>
      )}
      
      {isMaxLevel && animated && (
        <div className="absolute inset-0 rounded-full animate-ping opacity-20 bg-gradient-to-br from-yellow-400 to-purple-500" />
      )}
    </div>
  );
}

export function LevelIconCompact({ level, className }: { level: number; className?: string }) {
  const era = getEra(level);
  const style = eraStyles[era];
  
  return (
    <div className={cn(
      "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white",
      `bg-gradient-to-br ${style.gradient}`,
      style.glow,
      className
    )}>
      {level}
    </div>
  );
}
