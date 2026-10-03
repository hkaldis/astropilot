/** Observation photos: thumbnail grid, full-screen lightbox, add & delete. Only rendered when photos are enabled. */
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ImagePlus, Loader2, Trash2, X } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { useDeletePhoto, useUploadPhotos, photoProblem } from "./api";

export interface Photo {
  id: number;
  url: string;
}

export function PhotoGrid({ photos, sessionId, observationName }: { photos: Photo[]; sessionId: number; observationName: string }) {
  const [index, setIndex] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const del = useDeletePhoto(sessionId);
  useEffect(() => setConfirming(false), [index]);
  if (!photos.length) return null;
  const current = index !== null ? (photos[index] ?? null) : null;
  return (
    <>
      <ul className="flex flex-wrap gap-2" aria-label={`Photos of ${observationName}`}>
        {photos.map((p, i) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => setIndex(i)}
              className="block h-20 w-20 overflow-hidden rounded-md border bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-24 sm:w-24"
              aria-label={`Open photo ${i + 1} of ${photos.length}`}
            >
              <img src={p.url} alt="" loading="lazy" className="h-full w-full object-cover" />
            </button>
          </li>
        ))}
      </ul>
      <DialogPrimitive.Root open={current !== null} onOpenChange={(o) => !o && setIndex(null)}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/90 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content
            className="fixed inset-0 z-50 flex flex-col focus:outline-none"
            onKeyDown={(e) => {
              if (index === null) return;
              if (e.key === "ArrowRight") setIndex((index + 1) % photos.length);
              if (e.key === "ArrowLeft") setIndex((index - 1 + photos.length) % photos.length);
            }}
          >
            <DialogPrimitive.Title className="sr-only">
              {observationName} — photo {index !== null ? index + 1 : ""} of {photos.length}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">Use the arrow keys to move between photos.</DialogPrimitive.Description>
            <div className="flex items-center justify-between gap-2 p-3 text-white" style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
              <span className="num text-sm text-white/70">
                {index !== null ? index + 1 : ""} / {photos.length}
              </span>
              <div className="flex items-center gap-1">
                {current && confirming && (
                  <>
                    <span className="mr-1 text-sm text-white/80">Delete this photo?</span>
                    <Button variant="ghost" size="sm" className="text-white hover:bg-white/10 hover:text-white" onClick={() => setConfirming(false)}>
                      Keep
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={del.isPending}
                      onClick={() => {
                        const id = current.id;
                        setIndex(photos.length > 1 ? Math.max(0, (index ?? 0) - 1) : null);
                        del.mutate(id, {
                          onSuccess: () => toast({ title: "Photo deleted" }),
                          onError: (e: any) => toast({ title: "Couldn't delete the photo", description: e.message, variant: "destructive" }),
                        });
                      }}
                    >
                      Delete
                    </Button>
                  </>
                )}
                {current && !confirming && (
                  <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 hover:text-white" aria-label="Delete this photo" onClick={() => setConfirming(true)}>
                    <Trash2 />
                  </Button>
                )}
                <DialogPrimitive.Close asChild>
                  <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 hover:text-white" aria-label="Close">
                    <X />
                  </Button>
                </DialogPrimitive.Close>
              </div>
            </div>
            <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-6">
              {current && <img src={current.url} alt={`${observationName}, photo ${(index ?? 0) + 1}`} className="max-h-full max-w-full rounded-md object-contain" />}
              {photos.length > 1 && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute left-2 top-1/2 -translate-y-1/2 text-white hover:bg-white/10 hover:text-white"
                    aria-label="Previous photo"
                    onClick={() => index !== null && setIndex((index - 1 + photos.length) % photos.length)}
                  >
                    <ChevronLeft />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-white hover:bg-white/10 hover:text-white"
                    aria-label="Next photo"
                    onClick={() => index !== null && setIndex((index + 1) % photos.length)}
                  >
                    <ChevronRight />
                  </Button>
                </>
              )}
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}

/** "Add photo" control for an existing observation. */
export function AddPhotoButton({ observationId, sessionId, count }: { observationId: number; sessionId: number; count: number }) {
  const input = useRef<HTMLInputElement>(null);
  const upload = useUploadPhotos(sessionId);
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!upload.isPending) setLeft(0);
  }, [upload.isPending]);
  if (count >= 12) return null;
  return (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={() => input.current?.click()} disabled={upload.isPending}>
        {upload.isPending ? <Loader2 className="animate-spin" /> : <ImagePlus />}
        {upload.isPending ? `Uploading${left > 1 ? ` ${left}` : ""}…` : "Add photo"}
      </Button>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []).slice(0, 12 - count);
          e.target.value = "";
          const bad = files.map(photoProblem).find(Boolean);
          if (bad) {
            toast({ title: "Can't add that photo", description: bad, variant: "destructive" });
            return;
          }
          if (!files.length) return;
          setLeft(files.length);
          upload.mutate(
            { observationId, files },
            {
              onSuccess: (r) => toast({ title: r.length > 1 ? `${r.length} photos added` : "Photo added" }),
              onError: (err: any) => toast({ title: "Upload failed", description: err.message, variant: "destructive" }),
            },
          );
        }}
      />
    </>
  );
}
