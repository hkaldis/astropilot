import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, X, Camera, Clock, Settings2 } from "lucide-react";
import type { Observation, ObservationPhoto, CelestialObject } from "@shared/schema";
import { cn } from "@/lib/utils";

interface PhotoViewerDialogProps {
  observation: Observation & { object?: CelestialObject | null };
  open: boolean;
  onClose: () => void;
}

export function PhotoViewerDialog({ observation, open, onClose }: PhotoViewerDialogProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const { data: photos = [], isLoading } = useQuery<ObservationPhoto[]>({
    queryKey: ['/api/observations', observation.id, 'photos'],
    enabled: open && !!observation.id,
  });

  const selectedPhoto = photos[selectedIndex];

  const goToPrevious = () => {
    setSelectedIndex((prev) => (prev > 0 ? prev - 1 : photos.length - 1));
  };

  const goToNext = () => {
    setSelectedIndex((prev) => (prev < photos.length - 1 ? prev + 1 : 0));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-2 border-b">
          <DialogTitle className="flex items-center gap-3">
            <Camera className="w-5 h-5 text-primary" />
            <span>
              {observation.object?.name || "Observation"} Photos
            </span>
            {photos.length > 0 && (
              <Badge variant="secondary" className="ml-auto">
                {selectedIndex + 1} of {photos.length}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="relative">
          {isLoading ? (
            <div className="flex items-center justify-center h-96 bg-muted/30">
              <div className="text-muted-foreground">Loading photos...</div>
            </div>
          ) : photos.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-96 bg-muted/30">
              <Camera className="w-16 h-16 text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground">No photos for this observation</p>
            </div>
          ) : (
            <>
              <div className="relative bg-black flex items-center justify-center min-h-[400px] max-h-[60vh]">
                <img
                  src={selectedPhoto?.imageUrl}
                  alt={`Photo ${selectedIndex + 1}`}
                  className="max-w-full max-h-[60vh] object-contain"
                  data-testid={`photo-viewer-image-${selectedIndex}`}
                />

                {photos.length > 1 && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white"
                      onClick={goToPrevious}
                      data-testid="button-photo-previous"
                    >
                      <ChevronLeft className="w-6 h-6" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white"
                      onClick={goToNext}
                      data-testid="button-photo-next"
                    >
                      <ChevronRight className="w-6 h-6" />
                    </Button>
                  </>
                )}
              </div>

              {selectedPhoto && (
                <div className="p-4 border-t bg-muted/30">
                  <div className="flex flex-wrap gap-4 text-sm">
                    {selectedPhoto.exposure && (
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Exposure:</span>
                        <span className="font-mono">{selectedPhoto.exposure}</span>
                      </div>
                    )}
                    {selectedPhoto.iso && (
                      <div className="flex items-center gap-2">
                        <Settings2 className="w-4 h-4 text-muted-foreground" />
                        <span className="text-muted-foreground">ISO:</span>
                        <span className="font-mono">{selectedPhoto.iso}</span>
                      </div>
                    )}
                    {selectedPhoto.gain && (
                      <div className="flex items-center gap-2">
                        <Settings2 className="w-4 h-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Gain:</span>
                        <span className="font-mono">{selectedPhoto.gain}</span>
                      </div>
                    )}
                    {selectedPhoto.frameCount && (
                      <div className="flex items-center gap-2">
                        <Camera className="w-4 h-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Frames:</span>
                        <span className="font-mono">{selectedPhoto.frameCount}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {photos.length > 1 && (
                <div className="p-4 border-t">
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {photos.map((photo, index) => (
                      <button
                        key={photo.id}
                        onClick={() => setSelectedIndex(index)}
                        className={cn(
                          "shrink-0 w-16 h-16 rounded-md overflow-hidden border-2 transition-all",
                          index === selectedIndex
                            ? "border-primary ring-2 ring-primary/30"
                            : "border-transparent hover:border-muted-foreground/30"
                        )}
                        data-testid={`button-photo-thumbnail-${index}`}
                      >
                        <img
                          src={photo.imageUrl}
                          alt={`Thumbnail ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="p-4 border-t flex justify-end">
          <Button variant="outline" onClick={onClose} data-testid="button-close-photo-viewer">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
