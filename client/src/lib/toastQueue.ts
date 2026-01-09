import { toast } from "@/hooks/use-toast";

interface QueuedToast {
  title: string;
  description?: string;
  variant?: "default" | "destructive";
  type?: "standard" | "badge" | "levelUp";
  badgeTier?: "bronze" | "silver" | "gold" | "special";
  level?: number;
  levelTitle?: string;
  duration?: number;
}

class ToastQueue {
  private queue: QueuedToast[] = [];
  private isProcessing = false;
  private defaultDelay = 800;
  private levelUpDelay = 1000;

  add(item: QueuedToast) {
    this.queue.push(item);
    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  addMultiple(items: QueuedToast[]) {
    this.queue.push(...items);
    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  private async processQueue() {
    if (this.queue.length === 0) {
      this.isProcessing = false;
      return;
    }

    this.isProcessing = true;
    const item = this.queue.shift()!;

    const formatTitle = () => {
      if (item.type === "badge") {
        return `🏆 Badge Earned: ${item.title}!`;
      }
      if (item.type === "levelUp") {
        return `⭐ Level Up! You're now Level ${item.level}!`;
      }
      return item.title;
    };

    const formatDescription = () => {
      if (item.type === "levelUp" && item.levelTitle) {
        return `You've become a ${item.levelTitle}!`;
      }
      return item.description;
    };

    toast({
      title: formatTitle(),
      description: formatDescription(),
      variant: item.variant,
      duration: item.duration || (item.type === "levelUp" ? 6000 : 4000),
    });

    const delay = item.type === "levelUp" ? this.levelUpDelay : this.defaultDelay;
    await new Promise(resolve => setTimeout(resolve, delay));

    this.processQueue();
  }

  clear() {
    this.queue = [];
    this.isProcessing = false;
  }
}

export const toastQueue = new ToastQueue();

export interface BadgeInfo {
  name: string;
  description: string;
  tier?: "bronze" | "silver" | "gold" | "special";
}

export interface LevelUpInfo {
  level: number;
  title: string;
  previousLevel: number;
}

export function showObservationToasts(
  observationMessage: string,
  newBadges: BadgeInfo[] = [],
  levelUp?: LevelUpInfo
) {
  toastQueue.add({
    title: observationMessage,
    type: "standard",
  });

  for (const badge of newBadges) {
    toastQueue.add({
      title: badge.name,
      description: badge.description,
      type: "badge",
      badgeTier: badge.tier || "bronze",
    });
  }

  if (levelUp) {
    toastQueue.add({
      title: `Level ${levelUp.level}`,
      type: "levelUp",
      level: levelUp.level,
      levelTitle: levelUp.title,
    });
  }
}
