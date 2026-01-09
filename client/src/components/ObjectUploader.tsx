import { useState, useRef } from "react";
import type { ReactNode, ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2, Upload, X, ImageIcon, Check } from "lucide-react";

interface UploadedFile {
  file: File;
  preview: string;
  uploadURL?: string;
  status: "pending" | "uploading" | "success" | "error";
}

interface UploadResult {
  successful: Array<{
    uploadURL: string;
    preview?: string;
  }>;
  failed: Array<{
    error: string;
  }>;
}

interface ObjectUploaderProps {
  maxNumberOfFiles?: number;
  maxFileSize?: number;
  onGetUploadParameters: () => Promise<{
    method: "PUT";
    url: string;
  }>;
  onComplete?: (result: UploadResult) => void;
  buttonClassName?: string;
  buttonVariant?: "default" | "outline" | "secondary" | "ghost";
  buttonSize?: "default" | "sm" | "lg" | "icon";
  children: ReactNode;
  disabled?: boolean;
}

export function ObjectUploader({
  maxNumberOfFiles = 1,
  maxFileSize = 10485760,
  onGetUploadParameters,
  onComplete,
  buttonClassName,
  buttonVariant = "outline",
  buttonSize = "default",
  children,
  disabled = false,
}: ObjectUploaderProps) {
  const [showModal, setShowModal] = useState(false);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    const validFiles = selectedFiles
      .filter(file => file.size <= maxFileSize)
      .filter(file => file.type.startsWith("image/"))
      .slice(0, maxNumberOfFiles - files.length);

    const newFiles: UploadedFile[] = validFiles.map(file => ({
      file,
      preview: URL.createObjectURL(file),
      status: "pending" as const,
    }));

    setFiles(prev => [...prev, ...newFiles].slice(0, maxNumberOfFiles));
    
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => {
      const removed = prev[index];
      if (removed.preview) {
        URL.revokeObjectURL(removed.preview);
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const cleanupAndClose = (filesToCleanup: UploadedFile[]) => {
    filesToCleanup.forEach(f => {
      if (f.preview) URL.revokeObjectURL(f.preview);
    });
    setFiles([]);
    setShowModal(false);
  };

  const uploadFiles = async () => {
    if (files.length === 0) return;

    setIsUploading(true);
    const successful: UploadResult["successful"] = [];
    const failed: UploadResult["failed"] = [];
    const currentFiles = [...files];

    for (let i = 0; i < currentFiles.length; i++) {
      const uploadFile = currentFiles[i];
      if (uploadFile.status !== "pending") continue;

      setFiles(prev => prev.map((f, idx) => 
        idx === i ? { ...f, status: "uploading" as const } : f
      ));

      try {
        const { url } = await onGetUploadParameters();
        
        const response = await fetch(url, {
          method: "PUT",
          body: uploadFile.file,
          headers: {
            "Content-Type": uploadFile.file.type,
          },
        });

        if (response.ok) {
          currentFiles[i] = { ...uploadFile, status: "success" as const, uploadURL: url };
          setFiles(prev => prev.map((f, idx) => 
            idx === i ? { ...f, status: "success" as const, uploadURL: url } : f
          ));
          successful.push({
            uploadURL: url.split("?")[0],
            preview: uploadFile.preview,
          });
        } else {
          throw new Error("Upload failed");
        }
      } catch (error) {
        currentFiles[i] = { ...uploadFile, status: "error" as const };
        setFiles(prev => prev.map((f, idx) => 
          idx === i ? { ...f, status: "error" as const } : f
        ));
        failed.push({ error: String(error) });
      }
    }

    setIsUploading(false);
    
    if (successful.length > 0 || failed.length > 0) {
      onComplete?.({ successful, failed });
    }

    if (successful.length > 0 && failed.length === 0) {
      cleanupAndClose(currentFiles);
    }
  };

  const handleClose = () => {
    if (!isUploading) {
      cleanupAndClose(files);
    }
  };

  return (
    <div>
      <Button 
        onClick={() => setShowModal(true)} 
        className={buttonClassName}
        variant={buttonVariant}
        size={buttonSize}
        disabled={disabled}
        type="button"
        data-testid="button-add-photos"
      >
        {children}
      </Button>

      <Dialog open={showModal} onOpenChange={(open) => !isUploading && handleClose()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Photos</DialogTitle>
            <DialogDescription>
              Select up to {maxNumberOfFiles} image(s), max {Math.round(maxFileSize / 1024 / 1024)}MB each
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple={maxNumberOfFiles > 1}
              onChange={handleFileSelect}
              className="hidden"
              data-testid="input-photo-file"
            />
            
            {files.length < maxNumberOfFiles && (
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center cursor-pointer hover:border-muted-foreground/50 transition-colors"
              >
                <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Click to select images
                </p>
              </div>
            )}

            {files.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {files.map((file, index) => (
                  <div key={index} className="relative aspect-square rounded-lg overflow-hidden bg-muted">
                    <img 
                      src={file.preview} 
                      alt={`Preview ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      {file.status === "pending" && (
                        <ImageIcon className="w-6 h-6 text-white" />
                      )}
                      {file.status === "uploading" && (
                        <Loader2 className="w-6 h-6 text-white animate-spin" />
                      )}
                      {file.status === "success" && (
                        <Check className="w-6 h-6 text-green-400" />
                      )}
                      {file.status === "error" && (
                        <X className="w-6 h-6 text-red-400" />
                      )}
                    </div>
                    {!isUploading && (
                      <button
                        type="button"
                        onClick={() => removeFile(index)}
                        className="absolute top-1 right-1 p-1 rounded-full bg-destructive text-destructive-foreground"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button 
                variant="outline" 
                onClick={handleClose}
                disabled={isUploading}
              >
                Cancel
              </Button>
              <Button 
                onClick={uploadFiles}
                disabled={files.length === 0 || isUploading || files.every(f => f.status === "success")}
                data-testid="button-upload-photos"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Upload {files.filter(f => f.status === "pending").length} Photo(s)
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
