import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Beer, Heart, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";

interface DonationProduct {
  id: string;
  productId: string;
  name: string;
  description: string;
  amount: number;
  currency: string;
  metadata: Record<string, string>;
}

interface DonationProductsResponse {
  products: DonationProduct[];
}

interface DonationDialogProps {
  testId?: string;
  trigger?: React.ReactNode;
}

export function DonationDialog({ testId = "button-donate", trigger }: DonationDialogProps) {
  const [open, setOpen] = useState(false);

  const { data, isLoading, error } = useQuery<DonationProductsResponse>({
    queryKey: ['/api/donations/products'],
    enabled: open,
  });

  const checkoutMutation = useMutation({
    mutationFn: async (priceId: string) => {
      const response = await apiRequest('POST', '/api/donations/checkout', { priceId });
      if (!response.ok) {
        throw new Error('Failed to create checkout session');
      }
      return response.json() as Promise<{ url: string }>;
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
  });

  const formatAmount = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: 0,
    }).format(amount / 100);
  };

  const getBeerIcon = (amount: number) => {
    if (amount >= 5000) return "text-amber-500";
    if (amount >= 1000) return "text-amber-400";
    return "text-amber-300";
  };

  const defaultTrigger = (
    <Button
      variant="ghost"
      size="sm"
      className="flex-1 justify-start"
      data-testid={testId}
    >
      <Beer className="w-4 h-4 mr-2" />
      Buy Me a Beer
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || defaultTrigger}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Beer className="w-5 h-5 text-amber-500" />
            Support AstroPilot
          </DialogTitle>
          <DialogDescription>
            If you enjoy using AstroPilot, consider buying me a beer! Your support helps keep the stars shining.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-3 py-4">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          )}
          
          {error && (
            <div className="text-center py-4">
              <p className="text-sm text-destructive">Unable to load donation options. Please try again later.</p>
            </div>
          )}
          
          {data?.products.map((product) => (
            <Card
              key={product.id}
              className="cursor-pointer hover-elevate transition-all"
              onClick={() => checkoutMutation.mutate(product.id)}
              data-testid={`card-donation-${product.amount}`}
            >
              <CardHeader className="py-3 px-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <Beer className={`w-6 h-6 ${getBeerIcon(product.amount)}`} />
                    <div>
                      <CardTitle className="text-base">{product.name}</CardTitle>
                      <CardDescription className="text-xs">{product.description}</CardDescription>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    disabled={checkoutMutation.isPending}
                    data-testid={`button-donate-${product.amount}`}
                  >
                    {checkoutMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      formatAmount(product.amount, product.currency)
                    )}
                  </Button>
                </div>
              </CardHeader>
            </Card>
          ))}
          
          {!isLoading && !error && (!data?.products || data.products.length === 0) && (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground">No donation options available at the moment.</p>
            </div>
          )}
        </div>
        
        <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
          <Heart className="w-3 h-3" />
          <span>Thank you for your support!</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
