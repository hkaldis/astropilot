import { useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Home, Beer } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function DonationSuccess() {
  const [, setLocation] = useLocation();
  const searchParams = useSearch();
  const sessionId = new URLSearchParams(searchParams).get("session_id");

  const { data, isLoading, error } = useQuery<{
    success: boolean;
    amount: number;
    currency: string;
  }>({
    queryKey: ['/api/donations/verify', sessionId],
    queryFn: async () => {
      const response = await fetch(`/api/donations/verify/${sessionId}`);
      if (!response.ok) {
        throw new Error('Failed to verify donation');
      }
      return response.json();
    },
    enabled: !!sessionId,
  });

  const formatAmount = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: 0,
    }).format(amount / 100);
  };

  useEffect(() => {
    if (!sessionId) {
      const timer = setTimeout(() => setLocation("/"), 3000);
      return () => clearTimeout(timer);
    }
  }, [sessionId, setLocation]);

  if (!sessionId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <CardTitle>Invalid Session</CardTitle>
            <CardDescription>Redirecting to home...</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center py-8">
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
            <p className="mt-4 text-muted-foreground">Verifying your donation...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !data?.success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <CardTitle className="text-destructive">Something went wrong</CardTitle>
            <CardDescription>
              We couldn't verify your donation. If you were charged, please contact support.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button onClick={() => setLocation("/")} data-testid="button-go-home">
              <Home className="w-4 h-4 mr-2" />
              Go Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10 text-green-600 dark:text-green-400" />
            </div>
          </div>
          <CardTitle className="text-2xl">Thank You!</CardTitle>
          <CardDescription className="text-base">
            Your generous donation of {formatAmount(data.amount, data.currency)} has been received.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-center gap-2 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
            <Beer className="w-6 h-6 text-amber-500" />
            <p className="text-sm text-amber-700 dark:text-amber-300">
              Cheers! Your support means the world to us.
            </p>
          </div>
          
          <p className="text-center text-sm text-muted-foreground">
            Your contribution helps keep AstroPilot running and enables us to add new features for the astronomy community.
          </p>
          
          <div className="flex justify-center pt-2">
            <Button onClick={() => setLocation("/")} data-testid="button-back-home">
              <Home className="w-4 h-4 mr-2" />
              Back to AstroPilot
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
