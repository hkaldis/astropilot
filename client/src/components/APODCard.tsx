import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Sparkles, ExternalLink, Camera, Play, ImageIcon } from "lucide-react";
import { useState } from "react";

interface APODData {
  date: string;
  title: string;
  explanation: string;
  url: string;
  hdurl?: string;
  media_type: "image" | "video";
  copyright?: string;
  thumbnail_url?: string;
}

export function APODCard() {
  const [expanded, setExpanded] = useState(false);

  const { data: apod, isLoading, error } = useQuery<APODData>({
    queryKey: ["/api/nasa/apod"],
    staleTime: 1000 * 60 * 60,
    retry: 2,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-500" />
            <CardTitle className="text-base sm:text-lg">Picture of the Day</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <Skeleton className="aspect-video w-full rounded-lg mb-3" />
          <Skeleton className="h-4 w-3/4 mb-2" />
          <Skeleton className="h-3 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error || !apod) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-500" />
            <CardTitle className="text-base sm:text-lg">Picture of the Day</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6 text-muted-foreground">
            <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Unable to load today's picture</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const isVideo = apod.media_type === "video";
  const displayUrl = isVideo ? (apod.thumbnail_url || apod.url) : apod.url;
  const truncatedExplanation = apod.explanation.length > 200 
    ? apod.explanation.slice(0, 200) + "..." 
    : apod.explanation;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-5 h-5 text-amber-500 shrink-0" />
            <CardTitle className="text-base sm:text-lg truncate">Picture of the Day</CardTitle>
          </div>
          <Badge variant="secondary" className="shrink-0 text-xs">
            NASA
          </Badge>
        </div>
        <CardDescription className="text-xs sm:text-sm">
          {new Date(apod.date + "T12:00:00").toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
          })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative group">
          {isVideo ? (
            <div className="aspect-video w-full rounded-lg overflow-hidden bg-muted relative">
              <iframe
                src={apod.url}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                title={apod.title}
                data-testid="iframe-apod-video"
              />
            </div>
          ) : (
            <a
              href={apod.hdurl || apod.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block"
              data-testid="link-apod-fullsize"
            >
              <div className="aspect-video w-full rounded-lg overflow-hidden bg-muted relative">
                <img
                  src={displayUrl}
                  alt={apod.title}
                  className="w-full h-full object-cover transition-transform group-hover:scale-105"
                  loading="lazy"
                  data-testid="img-apod"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                  <ExternalLink className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                </div>
              </div>
            </a>
          )}
          {isVideo && (
            <Badge className="absolute top-2 right-2 bg-red-500/90">
              <Play className="w-3 h-3 mr-1" />
              Video
            </Badge>
          )}
        </div>

        <div className="space-y-2">
          <h3 className="font-semibold text-sm sm:text-base leading-tight">{apod.title}</h3>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            {expanded ? apod.explanation : truncatedExplanation}
          </p>
          {apod.explanation.length > 200 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
              className="text-xs h-auto py-1 px-2"
              data-testid="button-expand-apod"
            >
              {expanded ? "Show less" : "Read more"}
            </Button>
          )}
        </div>

        {apod.copyright && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground pt-1 border-t">
            <Camera className="w-3 h-3" />
            <span>{apod.copyright}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
