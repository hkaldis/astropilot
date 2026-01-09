import { useLocation } from "wouter";
import { XCircle, Home, Beer } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function DonationCancel() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
              <XCircle className="w-10 h-10 text-muted-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl">Donation Cancelled</CardTitle>
          <CardDescription className="text-base">
            No worries! Your payment was not processed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-center gap-2 p-4 bg-muted rounded-lg">
            <Beer className="w-6 h-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Maybe next time when the stars align!
            </p>
          </div>
          
          <p className="text-center text-sm text-muted-foreground">
            You can always come back and support us later. Clear skies!
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
