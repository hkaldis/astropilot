export interface Level {
  level: number;
  title: string;
  minXP: number;
  maxXP: number;
}

export const LEVELS: Level[] = [
  { level: 1, title: "Novice Stargazer", minXP: 0, maxXP: 49 },
  { level: 2, title: "Curious Observer", minXP: 50, maxXP: 149 },
  { level: 3, title: "Night Sky Explorer", minXP: 150, maxXP: 299 },
  { level: 4, title: "Cosmic Wanderer", minXP: 300, maxXP: 499 },
  { level: 5, title: "Telescope Apprentice", minXP: 500, maxXP: 749 },
  { level: 6, title: "Starfield Navigator", minXP: 750, maxXP: 1049 },
  { level: 7, title: "Deep Sky Hunter", minXP: 1050, maxXP: 1399 },
  { level: 8, title: "Nebula Seeker", minXP: 1400, maxXP: 1799 },
  { level: 9, title: "Galaxy Voyager", minXP: 1800, maxXP: 2299 },
  { level: 10, title: "Celestial Cartographer", minXP: 2300, maxXP: 2899 },
  { level: 11, title: "Astrophotographer", minXP: 2900, maxXP: 3599 },
  { level: 12, title: "Observatory Keeper", minXP: 3600, maxXP: 4399 },
  { level: 13, title: "Constellation Master", minXP: 4400, maxXP: 5299 },
  { level: 14, title: "Messier Champion", minXP: 5300, maxXP: 6299 },
  { level: 15, title: "Deep Space Pioneer", minXP: 6300, maxXP: 7499 },
  { level: 16, title: "Cosmic Sage", minXP: 7500, maxXP: 8899 },
  { level: 17, title: "Star Whisperer", minXP: 8900, maxXP: 10499 },
  { level: 18, title: "Galactic Scholar", minXP: 10500, maxXP: 12299 },
  { level: 19, title: "Celestial Virtuoso", minXP: 12300, maxXP: 14299 },
  { level: 20, title: "Master Astronomer", minXP: 14300, maxXP: Infinity },
];

export interface LevelInfo {
  level: number;
  title: string;
  currentXP: number;
  xpForCurrentLevel: number;
  xpForNextLevel: number;
  xpIntoLevel: number;
  xpNeededForNext: number;
  progressPercent: number;
  isMaxLevel: boolean;
}

export function getLevelInfo(totalXP: number): LevelInfo {
  const xp = Math.max(0, totalXP);
  
  let currentLevel = LEVELS[0];
  for (const level of LEVELS) {
    if (xp >= level.minXP) {
      currentLevel = level;
    } else {
      break;
    }
  }
  
  const isMaxLevel = currentLevel.level === LEVELS.length;
  const nextLevel = isMaxLevel ? currentLevel : LEVELS[currentLevel.level];
  
  const xpIntoLevel = xp - currentLevel.minXP;
  const xpNeededForNext = isMaxLevel ? 0 : nextLevel.minXP - currentLevel.minXP;
  const progressPercent = isMaxLevel ? 100 : Math.min(100, (xpIntoLevel / xpNeededForNext) * 100);
  
  return {
    level: currentLevel.level,
    title: currentLevel.title,
    currentXP: xp,
    xpForCurrentLevel: currentLevel.minXP,
    xpForNextLevel: isMaxLevel ? currentLevel.minXP : nextLevel.minXP,
    xpIntoLevel,
    xpNeededForNext,
    progressPercent,
    isMaxLevel,
  };
}

export function getXPForBadgeTier(tier: string): number {
  switch (tier) {
    case 'bronze': return 10;
    case 'silver': return 25;
    case 'gold': return 50;
    case 'platinum': return 100;
    case 'special': return 200;
    default: return 10;
  }
}
