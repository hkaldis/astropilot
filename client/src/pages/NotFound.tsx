import { Link } from "wouter";
import { usePageTitle } from "@/components/common/Page";
import { Button } from "@/components/ui/button";

export default function NotFoundPage() {
  usePageTitle("Not found");
  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <div className="animate-float font-display text-[5rem] leading-none text-muted-foreground/40">404</div>
      <h1 className="mt-2 font-display text-3xl">Lost in space</h1>
      <p className="mt-2 text-sm text-muted-foreground">This page doesn't exist — maybe it drifted below the horizon.</p>
      <div className="mt-6 flex justify-center gap-2">
        <Button asChild>
          <Link href="/">Tonight</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/explore">Explore objects</Link>
        </Button>
      </div>
    </div>
  );
}
