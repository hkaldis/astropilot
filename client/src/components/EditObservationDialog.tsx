import { useState, useEffect, useRef, ChangeEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save, Star, X, Plus, Image as ImageIcon, Trash2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Observation, Eyepiece, Barlow, Filter, Camera, Telescope, CelestialObject, ObservationPhoto } from "@shared/schema";

interface ObservationWithObject extends Observation {
  object: CelestialObject;
}

interface EditObservationDialogProps {
  observation: ObservationWithObject | null;
  telescope: Telescope | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

interface PendingUpload {
  id: string;
  file: File;
  preview: string;
  status: "pending" | "uploading" | "success" | "error";
}

export function EditObservationDialog({
  observation,
  telescope,
  open,
  onOpenChange,
  onSaved,
}: EditObservationDialogProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [notes, setNotes] = useState(observation?.notes ?? "");
  const [visibilityRating, setVisibilityRating] = useState(observation?.visibilityRating ?? 0);
  const [eyepieceId, setEyepieceId] = useState<number | null>(observation?.eyepieceId ?? null);
  const [barlowId, setBarlowId] = useState<number | null>(observation?.barlowId ?? null);
  const [filterId, setFilterId] = useState<number | null>(observation?.filterId ?? null);
  const [cameraId, setCameraId] = useState<number | null>(observation?.cameraId ?? null);
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [isUploadingPhotos, setIsUploadingPhotos] = useState(false);

  const { data: eyepieces } = useQuery<Eyepiece[]>({
    queryKey: ["/api/eyepieces"],
    enabled: open,
  });

  const { data: barlows } = useQuery<Barlow[]>({
    queryKey: ["/api/barlows"],
    enabled: open,
  });

  const { data: filters } = useQuery<Filter[]>({
    queryKey: ["/api/filters"],
    enabled: open,
  });

  const { data: cameras } = useQuery<Camera[]>({
    queryKey: ["/api/cameras"],
    enabled: open,
  });

  const { data: existingPhotos, refetch: refetchPhotos } = useQuery<ObservationPhoto[]>({
    queryKey: ["/api/observations", observation?.id, "photos"],
    enabled: open && !!observation?.id,
  });

  useEffect(() => {
    if (open && observation) {
      setNotes(observation.notes ?? "");
      setVisibilityRating(observation.visibilityRating ?? 0);
      setEyepieceId(observation.eyepieceId ?? null);
      setBarlowId(observation.barlowId ?? null);
      setFilterId(observation.filterId ?? null);
      setCameraId(observation.cameraId ?? null);
      setPendingUploads([]);
    }
  }, [open, observation?.id, observation?.notes, observation?.visibilityRating, observation?.eyepieceId, observation?.barlowId, observation?.filterId, observation?.cameraId]);

  useEffect(() => {
    return () => {
      pendingUploads.forEach(p => URL.revokeObjectURL(p.preview));
    };
  }, []);

  const selectedEyepiece = eyepieces?.find(e => e.id === eyepieceId);
  const selectedBarlow = barlows?.find(b => b.id === barlowId);

  const magnification = telescope && selectedEyepiece
    ? (telescope.focalLength / selectedEyepiece.focalLength) * (selectedBarlow?.factor ?? 1)
    : observation?.magnification ?? null;

  const exitPupil = telescope && magnification
    ? telescope.aperture / magnification
    : observation?.exitPupil ?? null;

  const deletePhotoMutation = useMutation({
    mutationFn: async (photoId: number) => {
      if (!observation) throw new Error("No observation");
      return apiRequest("DELETE", `/api/observations/${observation.id}/photos/${photoId}`);
    },
    onSuccess: () => {
      refetchPhotos();
      toast({
        title: "Photo deleted",
        description: "The photo has been removed.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete photo.",
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = files
      .filter(file => file.size <= 10 * 1024 * 1024)
      .filter(file => file.type.startsWith("image/"));

    const newUploads: PendingUpload[] = validFiles.map(file => ({
      id: crypto.randomUUID(),
      file,
      preview: URL.createObjectURL(file),
      status: "pending" as const,
    }));

    setPendingUploads(prev => [...prev, ...newUploads]);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removePendingUpload = (id: string) => {
    setPendingUploads(prev => {
      const upload = prev.find(p => p.id === id);
      if (upload) {
        URL.revokeObjectURL(upload.preview);
      }
      return prev.filter(p => p.id !== id);
    });
  };

  const uploadPendingPhotos = async () => {
    if (!observation || pendingUploads.length === 0) return;

    setIsUploadingPhotos(true);
    const uploadResults: { success: boolean; id: string; imageUrl?: string }[] = [];

    for (const upload of pendingUploads) {
      setPendingUploads(prev => prev.map(p => 
        p.id === upload.id ? { ...p, status: "uploading" as const } : p
      ));

      try {
        const uploadResponse = await apiRequest("POST", "/api/objects/upload");
        const { uploadURL } = await uploadResponse.json();

        await fetch(uploadURL, {
          method: "PUT",
          body: upload.file,
          headers: { "Content-Type": upload.file.type },
        });

        await apiRequest("POST", `/api/observations/${observation.id}/photos`, {
          imageUrl: uploadURL.split("?")[0],
        });

        setPendingUploads(prev => prev.map(p => 
          p.id === upload.id ? { ...p, status: "success" as const } : p
        ));
        uploadResults.push({ success: true, id: upload.id, imageUrl: uploadURL });
      } catch (error) {
        setPendingUploads(prev => prev.map(p => 
          p.id === upload.id ? { ...p, status: "error" as const } : p
        ));
        uploadResults.push({ success: false, id: upload.id });
      }
    }

    setIsUploadingPhotos(false);

    const successCount = uploadResults.filter(r => r.success).length;
    if (successCount > 0) {
      toast({
        title: "Photos uploaded",
        description: `${successCount} photo(s) added to observation.`,
      });
      setPendingUploads(prev => prev.filter(p => p.status !== "success"));
      refetchPhotos();
    }
  };

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!observation) throw new Error("No observation to update");
      
      if (pendingUploads.length > 0) {
        await uploadPendingPhotos();
      }
      
      return apiRequest("PATCH", `/api/observations/${observation.id}`, {
        notes: notes || null,
        visibilityRating: visibilityRating || null,
        eyepieceId: eyepieceId,
        barlowId: barlowId,
        filterId: filterId,
        cameraId: cameraId,
        magnification: magnification,
        exitPupil: exitPupil ? parseFloat(exitPupil.toFixed(2)) : null,
        imagingDone: cameraId !== null || (existingPhotos && existingPhotos.length > 0) || pendingUploads.length > 0,
      });
    },
    onSuccess: () => {
      toast({
        title: "Observation updated",
        description: "Your changes have been saved.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
      pendingUploads.forEach(p => URL.revokeObjectURL(p.preview));
      setPendingUploads([]);
      onOpenChange(false);
      onSaved?.();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update observation. Please try again.",
        variant: "destructive",
      });
      console.error("Update error:", error);
    },
  });

  const handleSave = () => {
    updateMutation.mutate();
  };

  const getPhotoUrl = (photo: ObservationPhoto) => {
    if (photo.imageUrl.startsWith("http")) {
      return photo.imageUrl;
    }
    return photo.imageUrl;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Observation</DialogTitle>
          <DialogDescription>
            {observation?.object?.catalogId} - {observation?.object?.name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <Label>Visibility Rating</Label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((rating) => (
                <button
                  key={rating}
                  type="button"
                  onClick={() => setVisibilityRating(rating)}
                  className="p-1 hover:scale-110 transition-transform"
                  data-testid={`button-rating-${rating}`}
                >
                  <Star
                    className={`w-6 h-6 ${
                      rating <= visibilityRating
                        ? "text-chart-4 fill-chart-4"
                        : "text-muted-foreground/30"
                    }`}
                  />
                </button>
              ))}
              {visibilityRating > 0 && (
                <button
                  type="button"
                  onClick={() => setVisibilityRating(0)}
                  className="ml-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Eyepiece</Label>
              <Select
                value={eyepieceId?.toString() ?? "none"}
                onValueChange={(val) => setEyepieceId(val === "none" ? null : parseInt(val))}
              >
                <SelectTrigger data-testid="select-edit-eyepiece">
                  <SelectValue placeholder="Select eyepiece" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {eyepieces?.map((ep) => (
                    <SelectItem key={ep.id} value={ep.id.toString()}>
                      {ep.name} ({ep.focalLength}mm)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Barlow</Label>
              <Select
                value={barlowId?.toString() ?? "none"}
                onValueChange={(val) => setBarlowId(val === "none" ? null : parseInt(val))}
              >
                <SelectTrigger data-testid="select-edit-barlow">
                  <SelectValue placeholder="Select barlow" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {barlows?.map((b) => (
                    <SelectItem key={b.id} value={b.id.toString()}>
                      {b.name} ({b.factor}x)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Filter</Label>
              <Select
                value={filterId?.toString() ?? "none"}
                onValueChange={(val) => setFilterId(val === "none" ? null : parseInt(val))}
              >
                <SelectTrigger data-testid="select-edit-filter">
                  <SelectValue placeholder="Select filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {filters?.map((f) => (
                    <SelectItem key={f.id} value={f.id.toString()}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Camera</Label>
              <Select
                value={cameraId?.toString() ?? "none"}
                onValueChange={(val) => setCameraId(val === "none" ? null : parseInt(val))}
              >
                <SelectTrigger data-testid="select-edit-camera">
                  <SelectValue placeholder="Select camera" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {cameras?.map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {(magnification || exitPupil) && (
            <div className="flex gap-4 p-3 rounded-lg bg-muted/30 text-sm">
              {magnification && (
                <div>
                  <span className="text-muted-foreground">Magnification: </span>
                  <span className="font-mono font-medium">{Math.round(magnification)}x</span>
                </div>
              )}
              {exitPupil && (
                <div>
                  <span className="text-muted-foreground">Exit Pupil: </span>
                  <span className="font-mono font-medium">{exitPupil.toFixed(1)}mm</span>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="edit-notes">Notes</Label>
            <Textarea
              id="edit-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add your observation notes..."
              rows={3}
              data-testid="textarea-edit-notes"
            />
          </div>

          <div className="space-y-3">
            <Label>Photos</Label>
            
            {((existingPhotos && existingPhotos.length > 0) || pendingUploads.length > 0) && (
              <div className="grid grid-cols-4 gap-2">
                {existingPhotos?.map((photo) => (
                  <div 
                    key={photo.id} 
                    className="relative group aspect-square rounded-lg overflow-hidden bg-muted"
                  >
                    <img 
                      src={getPhotoUrl(photo)} 
                      alt="Observation photo" 
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => deletePhotoMutation.mutate(photo.id)}
                      disabled={deletePhotoMutation.isPending}
                      className="absolute top-1 right-1 p-1 rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                      data-testid={`button-delete-photo-${photo.id}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                
                {pendingUploads.map((upload) => (
                  <div 
                    key={upload.id} 
                    className="relative group aspect-square rounded-lg overflow-hidden bg-muted"
                  >
                    <img 
                      src={upload.preview} 
                      alt="Pending upload" 
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      {upload.status === "pending" && (
                        <ImageIcon className="w-5 h-5 text-white" />
                      )}
                      {upload.status === "uploading" && (
                        <Loader2 className="w-5 h-5 text-white animate-spin" />
                      )}
                      {upload.status === "error" && (
                        <X className="w-5 h-5 text-red-400" />
                      )}
                    </div>
                    {upload.status === "pending" && (
                      <button
                        type="button"
                        onClick={() => removePendingUpload(upload.id)}
                        className="absolute top-1 right-1 p-1 rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileSelect}
              className="hidden"
              data-testid="input-edit-photo-file"
            />
            
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingPhotos}
              data-testid="button-add-photos"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Photos
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              pendingUploads.forEach(p => URL.revokeObjectURL(p.preview));
              setPendingUploads([]);
              onOpenChange(false);
            }}
            disabled={updateMutation.isPending || isUploadingPhotos}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={updateMutation.isPending || isUploadingPhotos}
            data-testid="button-save-observation"
          >
            {(updateMutation.isPending || isUploadingPhotos) ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
