import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Heart, Loader2 } from "lucide-react";
import { api, apiGet } from "@/lib/api";
import { useFeatures } from "@/hooks/useAuth";
import { EmptyState, PageHeader, Skel, usePageTitle } from "@/components/common/Page";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

interface Product {
  id: string;
  name: string;
  description: string | null;
  amount: number | null;
  currency: string;
}

function money(amount: number | null, currency: string) {
  if (amount === null) return "";
  return new Intl.NumberFormat(undefined, { style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: 0 }).format(amount / 100);
}

function Thanks() {
  const id = new URLSearchParams(location.search).get("session_id");
  const q = useQuery<{ success: boolean; amount: number | null; currency: string | null }>({
    queryKey: ["donation-verify", id],
    queryFn: () => apiGet(`/api/donations/verify/${encodeURIComponent(id!)}`),
    enabled: !!id,
  });
  return (
    <EmptyState
      icon={<Heart className="h-5 w-5 text-gold" />}
      title={q.data?.success ? `Thank you${q.data.amount ? ` for your ${money(q.data.amount, q.data.currency ?? "eur")}` : ""}!` : q.isLoading ? "Confirming your donation…" : "Thank you!"}
      description="Your support keeps AstroPilot free, ad-free and improving. Clear skies!"
      action={
        <Button asChild>
          <Link href="/">Back to tonight</Link>
        </Button>
      }
    />
  );
}

export default function SupportPage() {
  usePageTitle("Support AstroPilot");
  const [path] = useLocation();
  const features = useFeatures();
  const q = useQuery<{ products: Product[] }>({ queryKey: ["/api/donations/products"], enabled: features.donations, retry: 0 });
  const checkout = useMutation({
    mutationFn: (priceId: string) => api<{ url: string }>("POST", "/api/donations/checkout", { priceId }),
    onSuccess: (r) => {
      if (r.url) location.href = r.url;
    },
    onError: (e: any) => toast({ title: "Couldn't start checkout", description: e.message, variant: "destructive" }),
  });

  if (path.startsWith("/support/thanks")) return <Thanks />;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <PageHeader title="Support AstroPilot" description="AstroPilot is free and ad-free. If it helps you get more out of clear nights, you can buy the team a beer." />
      {!features.donations ? (
        <EmptyState title="Donations aren't available here" description="Thanks for thinking of it!" />
      ) : q.isLoading ? (
        <Skel className="h-32 w-full" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          {(q.data?.products ?? []).map((p) => (
            <button
              key={p.id}
              onClick={() => checkout.mutate(p.id)}
              disabled={checkout.isPending}
              className="panel flex flex-col items-center gap-1 p-6 text-center transition-colors hover:border-primary/50 hover:bg-primary/[0.04]"
            >
              <span className="num text-2xl font-semibold">{money(p.amount, p.currency)}</span>
              <span className="text-sm font-medium">{p.name}</span>
              {p.description && <span className="text-xs text-muted-foreground">{p.description}</span>}
            </button>
          ))}
          {checkout.isPending && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground sm:col-span-3">
              <Loader2 className="h-4 w-4 animate-spin" /> Opening secure checkout…
            </p>
          )}
        </div>
      )}
    </div>
  );
}
