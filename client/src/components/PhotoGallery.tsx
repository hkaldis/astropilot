import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { 
  Camera, 
  Image, 
  Calendar, 
  Star, 
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Clock,
  Settings2,
  MapPin,
  ExternalLink,
  X
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { ObservationPhoto, Observation, CelestialObject, ObservationSession } from "@shared/schema";

type PhotoWithDetails = ObservationPhoto & {
  observation: Observation & {
    object: CelestialObject;
    session: ObservationSession;
  };
};

const categoryColors: Record<string, string> = {
  planet: "border-amber-500/50 bg-amber-500/10",
  galaxy: "border-purple-500/50 bg-purple-500/10",
  nebula: "border-pink-500/50 bg-pink-500/10",
  emission_nebula: "border-pink-500/50 bg-pink-500/10",
  planetary_nebula: "border-cyan-500/50 bg-cyan-500/10",
  open_cluster: "border-blue-500/50 bg-blue-500/10",
  globular_cluster: "border-indigo-500/50 bg-indigo-500/10",
  double_star: "border-cyan-500/50 bg-cyan-500/10",
  supernova_remnant: "border-red-500/50 bg-red-500/10",
  moon: "border-slate-500/50 bg-slate-500/10",
  comet: "border-teal-500/50 bg-teal-500/10",
  meteor_shower: "border-yellow-500/50 bg-yellow-500/10",
};

function PhotoCard({ photo, onClick, onViewSession }: { photo: PhotoWithDetails; onClick: () => void; onViewSession: () => void }) {
  const category = photo.observation.object?.category ?? "";
  const sessionDate = photo.observation.session?.date 
    ? format(new Date(photo.observation.session.date), "MMM d, yyyy")
    : format(new Date(photo.createdAt ?? new Date()), "MMM d, yyyy");
  
  return (
    <div
      className={cn(
        "relative aspect-square rounded-lg overflow-hidden border-2 hover-elevate cursor-pointer group",
        categoryColors[category] ?? "border-border bg-muted/10"
      )}
      data-testid={`photo-card-${photo.id}`}
    >
      <button 
        className="w-full h-full" 
        onClick={onClick}
        aria-label={`View ${photo.observation.object?.name ?? "photo"}`}
      >
        <img
          src={photo.imageUrl}
          alt={photo.observation.object?.name ?? "Observation photo"}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      </button>
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <div className="absolute bottom-0 left-0 right-0 p-3 text-white pointer-events-auto">
          <p className="font-medium text-sm truncate">{photo.observation.object?.name}</p>
          <button
            onClick={(e) => { e.stopPropagation(); onViewSession(); }}
            className="text-xs opacity-80 hover:opacity-100 hover:underline flex items-center gap-1 mt-0.5"
            data-testid={`link-session-${photo.id}`}
          >
            <Calendar className="w-3 h-3" />
            {sessionDate}
          </button>
        </div>
      </div>
      <Badge 
        variant="secondary" 
        className="absolute top-2 right-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
      >
        {photo.observation.object?.catalogId}
      </Badge>
    </div>
  );
}

function PhotoViewerModal({ 
  photos, 
  currentIndex, 
  onClose, 
  onNavigate 
}: { 
  photos: PhotoWithDetails[]; 
  currentIndex: number; 
  onClose: () => void;
  onNavigate: (index: number) => void;
}) {
  const photo = photos[currentIndex];
  if (!photo) return null;

  const goToPrevious = () => {
    const newIndex = currentIndex > 0 ? currentIndex - 1 : photos.length - 1;
    onNavigate(newIndex);
  };

  const goToNext = () => {
    const newIndex = currentIndex < photos.length - 1 ? currentIndex + 1 : 0;
    onNavigate(newIndex);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl max-h-[95vh] p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-2 border-b">
          <DialogTitle className="flex items-center gap-3">
            <Camera className="w-5 h-5 text-primary" />
            <span>{photo.observation.object?.name}</span>
            <Badge variant="secondary" className="font-mono text-xs">
              {photo.observation.object?.catalogId}
            </Badge>
            <Badge variant="outline" className="ml-auto">
              {currentIndex + 1} of {photos.length}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="relative flex-1 min-h-0">
          <div className="relative bg-black flex items-center justify-center" style={{ height: "60vh" }}>
            <img
              src={photo.imageUrl}
              alt={photo.observation.object?.name ?? "Photo"}
              className="max-w-full max-h-full object-contain"
            />

            {photos.length > 1 && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white"
                  onClick={goToPrevious}
                  data-testid="button-prev-photo"
                >
                  <ChevronLeft className="w-6 h-6" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white"
                  onClick={goToNext}
                  data-testid="button-next-photo"
                >
                  <ChevronRight className="w-6 h-6" />
                </Button>
              </>
            )}
          </div>

          <div className="p-4 border-t bg-background">
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                <span>{format(new Date(photo.observation.session?.date ?? photo.createdAt ?? new Date()), "MMMM d, yyyy")}</span>
              </div>
              {photo.exposure && (
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  <span>{photo.exposure}s exposure</span>
                </div>
              )}
              {photo.iso && (
                <div className="flex items-center gap-2">
                  <Settings2 className="w-4 h-4" />
                  <span>ISO {photo.iso}</span>
                </div>
              )}
              {photo.gain && (
                <div className="flex items-center gap-2">
                  <span>Gain {photo.gain}</span>
                </div>
              )}
              {photo.frameCount && (
                <div className="flex items-center gap-2">
                  <span>{photo.frameCount} frames stacked</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="p-4 border-t flex justify-end">
          <Button variant="outline" onClick={onClose} data-testid="button-close-gallery-viewer">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PhotoGallery({ onNavigateToSession }: { onNavigateToSession?: (sessionId: number) => void }) {
  const { user } = useAuth();
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);

  const { data: photos, isLoading } = useQuery<PhotoWithDetails[]>({
    queryKey: ['/api/photos'],
    enabled: !!user,
  });

  const filteredPhotos = photos?.filter(photo => {
    if (categoryFilter === "all") return true;
    return photo.observation.object?.category === categoryFilter;
  }) ?? [];

  const categories = Array.from(new Set(photos?.map(p => p.observation.object?.category).filter(Boolean) ?? []));

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Image className="w-5 h-5" />
            <h2 className="text-lg font-semibold">Photo Gallery</h2>
          </div>
          <Skeleton className="w-32 h-9" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <Skeleton key={i} className="aspect-square rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!photos || photos.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <Camera className="w-16 h-16 text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-medium mb-2">No astrophotos yet</h3>
          <p className="text-muted-foreground text-center max-w-md">
            Your astrophotography gallery will appear here once you add photos to your observations.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Image className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">Photo Gallery</h2>
          <Badge variant="secondary">{photos.length} photos</Badge>
        </div>
        
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[180px]" data-testid="select-category-filter">
            <SelectValue placeholder="Filter by category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat} value={cat!}>
                {cat!.replace(/_/g, ' ')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {filteredPhotos.map((photo, index) => (
          <PhotoCard
            key={photo.id}
            photo={photo}
            onClick={() => setSelectedPhotoIndex(index)}
            onViewSession={() => onNavigateToSession?.(photo.observation.session?.id ?? photo.observation.sessionId)}
          />
        ))}
      </div>

      {filteredPhotos.length === 0 && categoryFilter !== "all" && (
        <div className="text-center py-8 text-muted-foreground">
          <p>No photos in this category</p>
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => setCategoryFilter("all")}>
            Show all photos
          </Button>
        </div>
      )}

      {selectedPhotoIndex !== null && (
        <PhotoViewerModal
          photos={filteredPhotos}
          currentIndex={selectedPhotoIndex}
          onClose={() => setSelectedPhotoIndex(null)}
          onNavigate={setSelectedPhotoIndex}
        />
      )}
    </div>
  );
}
