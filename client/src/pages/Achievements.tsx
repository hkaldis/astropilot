import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { ObjectDetailSheet } from "@/components/ObjectDetailSheet";
import { apiRequest } from "@/lib/queryClient";
import type { CelestialObject } from "@shared/schema";
import { 
  Trophy, 
  Star, 
  Award, 
  Medal, 
  Target, 
  Eye, 
  Camera, 
  Sparkles,
  Lock,
  CheckCircle2,
  Circle,
  Crown,
  Zap,
  Share2,
  Copy,
  Telescope,
  Moon,
  Mountain,
  Flame,
  Info,
  Download,
  Loader2,
  Image as ImageIcon
} from "lucide-react";
import { getLevelInfo } from "@shared/leveling";
import { LevelIcon } from "@/components/LevelIcon";

interface BadgeData {
  id: number;
  name: string;
  description: string;
  icon: string;
  category: string;
  tier: string;
  points: number;
  isSecret: boolean;
  requirement: any;
  earnedAt?: Date;
}

interface AchievementsData {
  earnedBadges: BadgeData[];
  availableBadges: BadgeData[];
  secretBadgesCount: number;
  totalPoints: number;
  stats: {
    totalObservations: number;
    totalSessions: number;
    totalPhotos: number;
    messierObjectsObserved: number;
    ngcObjectsObserved: number;
    planetsObserved: number;
    nebulaeObserved: number;
    galaxiesObserved: number;
    clustersObserved: number;
    doubleStarsObserved: number;
    currentStreak: number;
    longestStreak: number;
  };
  messier: {
    observed: number;
    total: number;
    percentComplete: number;
    certificateEarned: boolean;
  };
}

interface MessierProgressData {
  observedObjects: Array<{
    id: number;
    objectId: number;
    firstObservedAt: Date;
    observationCount: number;
    object: {
      id: number;
      catalogId: string;
      name: string;
      category: string;
    };
  }>;
  completionCount: number;
  totalMessier: number;
  percentComplete: number;
}

const tierColors: Record<string, string> = {
  bronze: "bg-amber-700 text-amber-50",
  silver: "bg-slate-400 text-slate-900",
  gold: "bg-yellow-500 text-yellow-950",
  special: "bg-gradient-to-r from-purple-500 to-pink-500 text-white",
};

const tierBorder: Record<string, string> = {
  bronze: "border-amber-600",
  silver: "border-slate-300",
  gold: "border-yellow-400",
  special: "border-purple-400",
};

const categoryIcons: Record<string, typeof Trophy> = {
  observation: Eye,
  imaging: Camera,
  catalog: Star,
  milestone: Target,
  special: Crown,
};

function BadgeCard({ badge, earned = false }: { badge: BadgeData; earned?: boolean }) {
  const IconComponent = categoryIcons[badge.category] || Award;
  const tierColor = tierColors[badge.tier] || "bg-muted";
  const borderColor = tierBorder[badge.tier] || "border-muted";

  return (
    <div
      className={`relative p-2 sm:p-4 rounded-lg border-2 ${borderColor} ${earned ? "bg-card" : "bg-muted/30 opacity-60"} transition-all hover-elevate`}
      data-testid={`badge-card-${badge.id}`}
    >
      {earned && (
        <div className="absolute -top-1.5 -right-1.5 sm:-top-2 sm:-right-2">
          <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 text-green-500" />
        </div>
      )}
      <div className="flex flex-col items-center text-center gap-1 sm:gap-2">
        <div className={`w-8 h-8 sm:w-12 sm:h-12 rounded-full ${tierColor} flex items-center justify-center`}>
          <IconComponent className="h-4 w-4 sm:h-6 sm:w-6" />
        </div>
        <div className="space-y-0.5 sm:space-y-1">
          <h4 className="font-semibold text-xs sm:text-sm leading-tight">{badge.name}</h4>
          <p className="text-[10px] sm:text-xs text-muted-foreground line-clamp-2 leading-tight">{badge.description}</p>
        </div>
        <Badge variant="outline" className="text-[10px] sm:text-xs">
          {badge.points} XP
        </Badge>
        {earned && badge.earnedAt && (
          <p className="text-[10px] sm:text-xs text-muted-foreground">
            {new Date(badge.earnedAt).toLocaleDateString()}
          </p>
        )}
      </div>
    </div>
  );
}

function MessierCertificate({ progress }: { progress: number }) {
  const isComplete = progress >= 110;
  
  return (
    <Card className={`relative overflow-hidden ${isComplete ? "border-yellow-400 border-2" : ""}`}>
      <div className={`absolute inset-0 bg-gradient-to-br ${isComplete ? "from-yellow-500/10 to-purple-500/10" : "from-muted/20 to-muted/5"}`} />
      <CardHeader className="relative pb-2 sm:pb-4">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className={`w-12 h-12 sm:w-16 sm:h-16 rounded-full flex items-center justify-center shrink-0 ${isComplete ? "bg-gradient-to-br from-yellow-400 to-yellow-600" : "bg-muted"}`}>
            {isComplete ? (
              <Crown className="h-6 w-6 sm:h-8 sm:w-8 text-yellow-950" />
            ) : (
              <Lock className="h-6 w-6 sm:h-8 sm:w-8 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0">
            <CardTitle className="text-base sm:text-xl">Messier Certificate</CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              {isComplete 
                ? "You've observed all 110 Messier objects!" 
                : "Complete all 110 Messier objects"}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="relative">
        <div className="space-y-3 sm:space-y-4">
          <div className="flex items-center justify-between text-xs sm:text-sm">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-mono font-bold">{progress} / 110</span>
          </div>
          <Progress value={(progress / 110) * 100} className="h-2 sm:h-3" />
          <div className="flex items-center justify-between text-xs sm:text-sm">
            <span className="text-muted-foreground">Completion</span>
            <span className="font-bold">{Math.round((progress / 110) * 100)}%</span>
          </div>
          {isComplete && (
            <div className="mt-3 sm:mt-4 p-3 sm:p-4 bg-gradient-to-r from-yellow-500/20 to-purple-500/20 rounded-lg text-center">
              <Sparkles className="h-5 w-5 sm:h-6 sm:w-6 mx-auto mb-2 text-yellow-500" />
              <p className="font-semibold text-sm sm:text-base text-yellow-600 dark:text-yellow-400">
                Achievement Unlocked!
              </p>
              <p className="text-xs sm:text-sm text-muted-foreground">
                You've earned the Messier Certificate
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface MessierGridProps {
  observedIds: Set<number>;
  observedData: Map<number, { count: number; firstObserved: Date }>;
  onObjectClick: (messierNum: number) => void;
}

function MessierGrid({ observedIds, observedData, onObjectClick }: MessierGridProps) {
  const messierNumbers = Array.from({ length: 110 }, (_, i) => i + 1);
  
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-lg">Messier Catalog Progress</CardTitle>
            <CardDescription className="flex items-center gap-1">
              <Info className="h-3 w-3" />
              Tap any object to view details
            </CardDescription>
          </div>
          <Badge variant="outline" className="font-mono">
            {observedIds.size}/110
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-10 sm:grid-cols-11 md:grid-cols-11 gap-1 sm:gap-1.5">
          {messierNumbers.map((num) => {
            const observed = observedIds.has(num);
            const data = observedData.get(num);
            return (
              <button
                key={num}
                onClick={() => onObjectClick(num)}
                className={`aspect-square flex items-center justify-center text-[10px] sm:text-xs font-mono rounded transition-all hover-elevate active-elevate-2 ${
                  observed 
                    ? "bg-green-500 text-white" 
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
                title={`M${num} - ${observed ? `Observed ${data?.count || 1}x` : "Not yet observed"}`}
                data-testid={`messier-${num}`}
              >
                {num}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-4 mt-4 text-xs sm:text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 sm:w-4 sm:h-4 rounded bg-green-500" />
            <span>Observed</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 sm:w-4 sm:h-4 rounded bg-muted" />
            <span>Not observed</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function LevelCard({ totalXP }: { totalXP: number }) {
  const levelInfo = getLevelInfo(totalXP);
  
  return (
    <Card className="relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-pink-500/10" />
      <CardContent className="relative pt-4 sm:pt-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
          <div className="flex items-center gap-3 sm:gap-4">
            <LevelIcon 
              level={levelInfo.level} 
              size="lg" 
              showBadge={true}
              animated={levelInfo.isMaxLevel}
            />
            <div>
              <h2 className="text-lg sm:text-2xl font-bold" data-testid="user-title">{levelInfo.title}</h2>
              <p className="text-xs sm:text-sm text-muted-foreground">Level {levelInfo.level}</p>
            </div>
          </div>
          
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between text-xs sm:text-sm">
              <span className="text-muted-foreground">Experience Points</span>
              <span className="font-mono font-bold text-indigo-500" data-testid="total-xp">{levelInfo.currentXP} XP</span>
            </div>
            {!levelInfo.isMaxLevel ? (
              <>
                <Progress value={levelInfo.progressPercent} className="h-2 sm:h-3" />
                <div className="flex items-center justify-between text-[10px] sm:text-xs text-muted-foreground gap-1">
                  <span>{levelInfo.xpIntoLevel} / {levelInfo.xpNeededForNext} XP to next</span>
                  <span className="shrink-0">Next: Lv.{levelInfo.level + 1}</span>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2 p-2 bg-gradient-to-r from-yellow-500/20 to-purple-500/20 rounded-lg">
                <Crown className="w-4 h-4 text-yellow-500" />
                <span className="text-xs sm:text-sm font-medium">Maximum Level Reached!</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatsOverview({ stats, totalXP }: { stats: AchievementsData["stats"]; totalXP: number }) {
  const primaryStats = [
    { label: "Observations", value: stats?.totalObservations || 0, icon: Eye },
    { label: "Sessions", value: stats?.totalSessions || 0, icon: Target },
    { label: "Photos", value: stats?.totalPhotos || 0, icon: Camera },
  ];
  
  const objectStats = [
    { label: "Messier", value: stats?.messierObjectsObserved || 0, icon: Star },
    { label: "NGC", value: stats?.ngcObjectsObserved || 0, icon: Circle },
    { label: "Planets", value: stats?.planetsObserved || 0, icon: Circle },
    { label: "Nebulae", value: stats?.nebulaeObserved || 0, icon: Sparkles },
    { label: "Galaxies", value: stats?.galaxiesObserved || 0, icon: Sparkles },
    { label: "Clusters", value: stats?.clustersObserved || 0, icon: Circle },
    { label: "Double Stars", value: stats?.doubleStarsObserved || 0, icon: Circle },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg sm:text-xl">Your Statistics</CardTitle>
        <CardDescription>Lifetime observation stats</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          {primaryStats.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.label}
                className="flex flex-col items-center p-2 sm:p-3 bg-primary/10 rounded-lg"
              >
                <Icon className="h-4 w-4 sm:h-5 sm:w-5 text-primary mb-1" />
                <span className="text-lg sm:text-2xl font-bold">{item.value}</span>
                <span className="text-[10px] sm:text-xs text-muted-foreground text-center">{item.label}</span>
              </div>
            );
          })}
        </div>
        
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
          {objectStats.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.label}
                className="flex flex-col items-center p-2 bg-muted/50 rounded-lg"
              >
                <Icon className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground mb-0.5" />
                <span className="text-sm sm:text-lg font-bold">{item.value}</span>
                <span className="text-[9px] sm:text-[10px] text-muted-foreground text-center leading-tight">{item.label}</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  achievements: AchievementsData | undefined;
  messierProgress: MessierProgressData | undefined;
}

function ShareAchievementsDialog({ open, onOpenChange, achievements, messierProgress }: ShareDialogProps) {
  const { toast } = useToast();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [imageFormat, setImageFormat] = useState<'landscape' | 'square'>('landscape');
  
  const levelInfo = getLevelInfo(achievements?.totalPoints || 0);
  const badgeCount = achievements?.earnedBadges.length || 0;
  const messierCount = messierProgress?.completionCount || 0;
  const stats = achievements?.stats;
  const shareUrl = `${window.location.origin}`;
  
  useEffect(() => {
    if (open) {
      generateImage();
    } else {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
        setImageUrl(null);
      }
    }
  }, [open, imageFormat]);
  
  const generateImage = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/user/share-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ format: imageFormat }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to generate image');
      }
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setImageUrl(url);
    } catch (error) {
      console.error('Error generating share image:', error);
      toast({
        title: "Failed to generate image",
        description: "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleDownload = () => {
    if (!imageUrl) return;
    
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = `astropilot-achievements-${imageFormat}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast({
      title: "Image downloaded",
      description: "Share it on your favorite social platform!",
    });
  };
  
  const handleCopyImage = async () => {
    if (!imageUrl) return;
    
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ]);
      toast({
        title: "Image copied",
        description: "Paste it anywhere to share!",
      });
    } catch {
      toast({
        title: "Failed to copy image",
        description: "Try downloading instead",
        variant: "destructive",
      });
    }
  };
  
  
  const [canShareFiles, setCanShareFiles] = useState(false);
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);

  useEffect(() => {
    if (imageUrl) {
      fetch(imageUrl)
        .then(res => res.blob())
        .then(blob => {
          setImageBlob(blob);
          const file = new File([blob], 'test.png', { type: 'image/png' });
          const canShare = typeof navigator.share === 'function' && 
                          typeof navigator.canShare === 'function' &&
                          navigator.canShare({ files: [file] });
          setCanShareFiles(canShare);
        })
        .catch(() => setImageBlob(null));
    }
  }, [imageUrl]);

  const handleShare = async () => {
    if (!imageBlob) return;
    
    const file = new File([imageBlob], `astropilot-achievements-${imageFormat}.png`, { type: 'image/png' });
    const shareText = `I'm a Level ${levelInfo.level} ${levelInfo.title} on AstroPilot! ${badgeCount} badges earned, ${messierCount}/110 Messier objects observed.`;
    
    try {
      await navigator.share({
        title: `${levelInfo.title} - AstroPilot`,
        text: shareText,
        url: shareUrl,
        files: [file],
      });
      onOpenChange(false);
      toast({
        title: "Shared successfully",
        description: "Your achievements have been shared!",
      });
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        toast({
          title: "Share failed",
          description: "Please try downloading the image instead.",
          variant: "destructive",
        });
      }
    }
  };

  const handleCopyAll = async () => {
    if (!imageBlob) return;
    
    const shareText = `I'm a Level ${levelInfo.level} ${levelInfo.title} on AstroPilot! ${badgeCount} badges earned, ${messierCount}/110 Messier objects observed. ${shareUrl}`;
    
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': imageBlob })
      ]);
      await navigator.clipboard.writeText(shareText);
      toast({
        title: "Ready to share",
        description: "Image and text copied. Open any app and paste!",
      });
    } catch {
      try {
        await navigator.clipboard.writeText(shareText);
        handleDownload();
        toast({
          title: "Text copied, image downloaded",
          description: "Open any app, paste the text, and attach the image!",
        });
      } catch {
        handleDownload();
      }
    }
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5" />
            Share Your Achievements
          </DialogTitle>
          <DialogDescription>
            Download or share this beautiful infographic of your stargazing journey
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="flex gap-2 justify-center">
            <Button
              variant={imageFormat === 'landscape' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setImageFormat('landscape')}
              data-testid="button-format-landscape"
            >
              Landscape (1200×630)
            </Button>
            <Button
              variant={imageFormat === 'square' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setImageFormat('square')}
              data-testid="button-format-square"
            >
              Square (1080×1080)
            </Button>
          </div>
          
          <div className="relative rounded-lg border overflow-hidden bg-muted/50">
            {isLoading ? (
              <div className={`flex items-center justify-center bg-gradient-to-br from-indigo-950 via-slate-900 to-purple-950 ${imageFormat === 'landscape' ? 'aspect-[1200/630]' : 'aspect-square'}`}>
                <div className="flex flex-col items-center gap-3 text-white">
                  <Loader2 className="h-8 w-8 animate-spin" />
                  <p className="text-sm">Generating your share card...</p>
                </div>
              </div>
            ) : imageUrl ? (
              <img 
                src={imageUrl} 
                alt="Achievement share card" 
                className="w-full h-auto"
                data-testid="img-share-preview"
              />
            ) : (
              <div className={`flex items-center justify-center bg-muted ${imageFormat === 'landscape' ? 'aspect-[1200/630]' : 'aspect-square'}`}>
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <ImageIcon className="h-8 w-8" />
                  <p className="text-sm">Failed to generate image</p>
                  <Button size="sm" onClick={generateImage}>
                    Try Again
                  </Button>
                </div>
              </div>
            )}
          </div>
          
          {canShareFiles ? (
            <Button
              size="lg"
              className="w-full gap-2 text-base"
              onClick={handleShare}
              disabled={!imageBlob || isLoading}
              data-testid="button-share"
            >
              <Share2 className="h-5 w-5" />
              Share to Any App
            </Button>
          ) : (
            <div className="space-y-3">
              <Button
                size="lg"
                className="w-full gap-2 text-base"
                onClick={handleCopyAll}
                disabled={!imageBlob || isLoading}
                data-testid="button-copy-all"
              >
                <Copy className="h-5 w-5" />
                Copy Image and Text
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                After copying, open X, Instagram, Facebook, TikTok, or any app and paste
              </p>
            </div>
          )}
          
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 gap-2"
              onClick={handleDownload}
              disabled={!imageUrl || isLoading}
              data-testid="button-download-image"
            >
              <Download className="h-4 w-4" />
              Download
            </Button>
            <Button
              variant="outline"
              className="flex-1 gap-2"
              onClick={handleCopyImage}
              disabled={!imageUrl || isLoading}
              data-testid="button-copy-image"
            >
              <Copy className="h-4 w-4" />
              Copy Image Only
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Achievements() {
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [selectedObject, setSelectedObject] = useState<CelestialObject | null>(null);
  const [objectSheetOpen, setObjectSheetOpen] = useState(false);
  const { user } = useAuth();
  
  const { data: achievements, isLoading: achievementsLoading } = useQuery<AchievementsData>({
    queryKey: ["/api/user/achievements"],
    enabled: !!user,
  });

  const { data: messierProgress, isLoading: messierLoading } = useQuery<MessierProgressData>({
    queryKey: ["/api/user/messier-progress"],
    enabled: !!user,
  });
  
  const { data: celestialObjects } = useQuery<CelestialObject[]>({
    queryKey: ["/api/objects"],
    enabled: !!user,
  });

  const isLoading = achievementsLoading || messierLoading;

  const handleMessierClick = (messierNum: number) => {
    const catalogId = `M${messierNum}`;
    const object = celestialObjects?.find(o => o.catalogId === catalogId);
    if (object) {
      setSelectedObject(object);
      setObjectSheetOpen(true);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
        <Skeleton className="h-48" />
      </div>
    );
  }

  const observedMessierIds = new Set(
    messierProgress?.observedObjects.map((o) => {
      const match = o.object.catalogId.match(/^M(\d+)$/);
      return match ? parseInt(match[1]) : 0;
    }).filter(Boolean) || []
  );
  
  const observedMessierData = new Map<number, { count: number; firstObserved: Date }>();
  messierProgress?.observedObjects.forEach((o) => {
    const match = o.object.catalogId.match(/^M(\d+)$/);
    if (match) {
      const num = parseInt(match[1]);
      observedMessierData.set(num, { 
        count: o.observationCount, 
        firstObserved: new Date(o.firstObservedAt) 
      });
    }
  });

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between gap-2 sm:gap-4 flex-wrap">
        <div className="flex items-center gap-2 sm:gap-3">
          <Trophy className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" data-testid="achievements-title">
              Achievements
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Track your progress and earn badges
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShareDialogOpen(true)}
          className="gap-2"
          data-testid="button-share-achievements"
        >
          <Share2 className="w-4 h-4" />
          <span className="hidden sm:inline">Share</span>
        </Button>
      </div>
      
      <ShareAchievementsDialog
        open={shareDialogOpen}
        onOpenChange={setShareDialogOpen}
        achievements={achievements}
        messierProgress={messierProgress}
      />
      
      <ObjectDetailSheet
        object={selectedObject}
        open={objectSheetOpen}
        onOpenChange={setObjectSheetOpen}
      />

      <LevelCard totalXP={achievements?.totalPoints || 0} />

      <StatsOverview 
        stats={achievements?.stats || {} as any} 
        totalXP={achievements?.totalPoints || 0} 
      />

      <Tabs defaultValue="badges" className="space-y-4">
        <ScrollArea className="w-full whitespace-nowrap">
          <TabsList className="inline-flex w-auto">
            <TabsTrigger value="badges" data-testid="tab-badges" className="gap-1 sm:gap-2">
              <Award className="h-4 w-4" />
              <span className="hidden xs:inline">Badges</span>
              <span className="xs:hidden">Badges</span>
              <span className="hidden sm:inline">({achievements?.earnedBadges.length || 0})</span>
            </TabsTrigger>
            <TabsTrigger value="messier" data-testid="tab-messier" className="gap-1 sm:gap-2">
              <Star className="h-4 w-4" />
              <span>Messier</span>
            </TabsTrigger>
            <TabsTrigger value="available" data-testid="tab-available" className="gap-1 sm:gap-2">
              <Target className="h-4 w-4" />
              <span className="hidden sm:inline">Available</span>
              <span className="sm:hidden">Avail.</span>
              <span className="hidden sm:inline">({achievements?.availableBadges.length || 0})</span>
            </TabsTrigger>
          </TabsList>
          <ScrollBar orientation="horizontal" className="invisible" />
        </ScrollArea>

        <TabsContent value="badges" className="space-y-4">
          {achievements?.earnedBadges && achievements.earnedBadges.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-4">
              {achievements.earnedBadges.map((badge) => (
                <BadgeCard key={badge.id} badge={badge} earned />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-8 sm:py-12">
                <Medal className="h-12 w-12 sm:h-16 sm:w-16 text-muted-foreground mb-4" />
                <h3 className="text-base sm:text-lg font-semibold mb-2">No Badges Yet</h3>
                <p className="text-sm text-muted-foreground text-center max-w-md px-4">
                  Start observing celestial objects to earn your first badge! 
                  Your first observation will unlock the "First Light" badge.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="messier" className="space-y-4">
          <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
            <MessierCertificate progress={messierProgress?.completionCount || 0} />
            <Card>
              <CardHeader className="pb-2 sm:pb-4">
                <CardTitle className="text-base sm:text-lg">Messier Progress Tiers</CardTitle>
                <CardDescription className="text-xs sm:text-sm">Earn badges as you progress</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 sm:space-y-4">
                {[
                  { name: "Explorer", fullName: "Messier Explorer", count: 10, tier: "bronze" },
                  { name: "Hunter", fullName: "Messier Hunter", count: 25, tier: "bronze" },
                  { name: "Enthusiast", fullName: "Messier Enthusiast", count: 50, tier: "silver" },
                  { name: "Expert", fullName: "Messier Expert", count: 75, tier: "silver" },
                  { name: "Master", fullName: "Messier Master", count: 100, tier: "gold" },
                  { name: "Certificate", fullName: "Messier Certificate", count: 110, tier: "special" },
                ].map((tier) => {
                  const progress = messierProgress?.completionCount || 0;
                  const complete = progress >= tier.count;
                  return (
                    <div
                      key={tier.name}
                      className={`flex items-center justify-between p-2 sm:p-3 rounded-lg gap-2 ${complete ? "bg-green-500/10" : "bg-muted/50"}`}
                    >
                      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                        {complete ? (
                          <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 text-green-500 shrink-0" />
                        ) : (
                          <Circle className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground shrink-0" />
                        )}
                        <span className={`text-sm sm:text-base truncate ${complete ? "font-semibold" : ""}`}>
                          <span className="sm:hidden">{tier.name}</span>
                          <span className="hidden sm:inline">{tier.fullName}</span>
                        </span>
                      </div>
                      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                        <span className="text-xs sm:text-sm text-muted-foreground">{tier.count}</span>
                        <Badge variant="outline" className={`text-[10px] sm:text-xs ${tierColors[tier.tier]}`}>
                          {tier.tier}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
          <MessierGrid 
            observedIds={observedMessierIds} 
            observedData={observedMessierData}
            onObjectClick={handleMessierClick}
          />
        </TabsContent>

        <TabsContent value="available" className="space-y-4">
          {achievements?.availableBadges && achievements.availableBadges.length > 0 ? (
            <>
              <p className="text-sm text-muted-foreground">
                Keep observing to unlock these badges!
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-4">
                {achievements.availableBadges.map((badge) => (
                  <BadgeCard key={badge.id} badge={badge} />
                ))}
              </div>
            </>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-8 sm:py-12">
                <Crown className="h-12 w-12 sm:h-16 sm:w-16 text-yellow-500 mb-4" />
                <h3 className="text-base sm:text-lg font-semibold mb-2">All Badges Earned!</h3>
                <p className="text-sm text-muted-foreground text-center max-w-md px-4">
                  Congratulations! You've unlocked every available badge. 
                  Keep exploring the night sky!
                </p>
              </CardContent>
            </Card>
          )}
          
          {(achievements?.secretBadgesCount || 0) > 0 && (
            <Card className="mt-4">
              <CardContent className="flex items-center gap-3 sm:gap-4 py-4 sm:py-6">
                <Lock className="h-6 w-6 sm:h-8 sm:w-8 text-muted-foreground shrink-0" />
                <div>
                  <h4 className="font-semibold text-sm sm:text-base">Secret Badges</h4>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    There are {achievements?.secretBadgesCount} hidden badges waiting to be discovered...
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
