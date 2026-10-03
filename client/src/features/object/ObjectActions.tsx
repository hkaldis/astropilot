import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { BookmarkCheck, BookmarkPlus, Compass, Loader2 } from "lucide-react";
import type { ApiTarget } from "@shared/api";
import { api, queryClient } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { LogObservationButton, type LogObservationButtonProps } from "@/features/journal/LogObservationDialog";

const TARGETS_KEY = ["/api/targets"] as const;

function AddTargetButton({ refId, name }: { refId: string; name: string }) {
  const { isAuthenticated, isLoading } = useAuth();
  const targets = useQuery<ApiTarget[]>({ queryKey: TARGETS_KEY, enabled: isAuthenticated });
  const inList = !!targets.data?.some((t) => t.ref.toLowerCase() === refId.toLowerCase() && t.status === "planned");
  const add = useMutation({
    mutationFn: () => api<ApiTarget[]>("POST", "/api/targets", { ref: refId }),
    onSuccess: (list) => {
      queryClient.setQueryData(TARGETS_KEY, list);
      toast({ title: `${name} added to your targets`, description: "Find it under Plan when you're ready to observe." });
    },
    onError: (e: Error) => toast({ title: "Couldn't add it", description: e.message, variant: "destructive" }),
  });

  if (!isAuthenticated && !isLoading) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button>
            <BookmarkPlus /> Add to my targets
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72">
          <p className="text-sm font-medium">Keep a list of things to see</p>
          <p className="mt-1 text-sm text-muted-foreground">A free account saves your targets, gear and observing log across devices.</p>
          <div className="mt-3 flex gap-2">
            <Button asChild size="sm" className="flex-1">
              <Link href="/register">Create account</Link>
            </Button>
            <Button asChild size="sm" variant="outline" className="flex-1">
              <Link href="/login">Sign in</Link>
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    );
  }
  if (inList) {
    return (
      <Button asChild variant="subtle">
        <Link href="/plan">
          <BookmarkCheck /> In your targets
        </Link>
      </Button>
    );
  }
  return (
    <Button onClick={() => add.mutate()} disabled={add.isPending || isLoading}>
      {add.isPending ? <Loader2 className="animate-spin" /> : <BookmarkPlus />} Add to my targets
    </Button>
  );
}

export function ObjectActions({ refId, name, suggestion }: { refId: string; name: string; suggestion?: LogObservationButtonProps["suggestion"] }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center [&>*:first-child]:col-span-2">
      <AddTargetButton refId={refId} name={name} />
      <Button asChild variant="outline" className="px-3 sm:px-4">
        <Link href={`/sky?focus=${encodeURIComponent(refId)}`}>
          <Compass /> <span className="sm:hidden">Sky chart</span>
          <span className="hidden sm:inline">Show on sky chart</span>
        </Link>
      </Button>
      <LogObservationButton refId={refId} name={name} suggestion={suggestion} className="w-full px-3 sm:w-auto sm:px-4" />
    </div>
  );
}
