import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useTheme } from "@/components/ThemeProvider";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Mail, Lock, AlertCircle } from "lucide-react";
import { SiGoogle } from "react-icons/si";
import { Alert, AlertDescription } from "@/components/ui/alert";
import astroPilotLogo from "@assets/Dark_mode_logo_1764867508003.png";
import starboardDarkLogo from "@assets/darkmode-starboard_1764868891632.png";
import starboardLightLogo from "@assets/lightmode-starboard_1764868894879.png";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function Login() {
  const [, setLocation] = useLocation();
  const { login, isLoggingIn } = useAuth();
  const { toast } = useToast();
  const { theme } = useTheme();
  const [error, setError] = useState<string | null>(null);

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    setError(null);
    try {
      await login(data);
      setLocation("/");
    } catch (err: any) {
      const message = err?.message || "Failed to log in. Please check your credentials.";
      setError(message);
    }
  };

  const handleGoogleLogin = () => {
    window.location.href = "/api/auth/google";
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="fixed top-0 inset-x-0 z-50 border-b bg-background/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center p-1.5 overflow-hidden">
              <img src={astroPilotLogo} alt="AstroPilot" className="w-full h-full object-contain" />
            </div>
            <span className="font-semibold text-lg">AstroPilot</span>
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center pt-16 px-4 pb-8">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1 text-center">
            <CardTitle className="text-2xl font-bold">Welcome back</CardTitle>
            <CardDescription>Sign in to your AstroPilot account</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button
              variant="outline"
              className="w-full"
              onClick={handleGoogleLogin}
              data-testid="button-google-login"
            >
              <SiGoogle className="w-4 h-4 mr-2" />
              Continue with Google
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Or continue with email</span>
              </div>
            </div>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            {...field}
                            type="email"
                            placeholder="you@example.com"
                            className="pl-9"
                            data-testid="input-email"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            {...field}
                            type="password"
                            placeholder="Enter your password"
                            className="pl-9"
                            data-testid="input-password"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" className="w-full" disabled={isLoggingIn} data-testid="button-submit-login">
                  {isLoggingIn ? "Signing in..." : "Sign in"}
                </Button>
              </form>
            </Form>

            <p className="text-center text-sm text-muted-foreground">
              Don't have an account?{" "}
              <Link href="/register" className="text-primary hover:underline" data-testid="link-register">
                Create one
              </Link>
            </p>

            <p className="text-center text-xs text-muted-foreground pt-2">
              By signing in, you agree to our{" "}
              <Link href="/terms" className="text-primary hover:underline" data-testid="link-terms">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link href="/privacy" className="text-primary hover:underline" data-testid="link-privacy">
                Privacy Policy
              </Link>
            </p>
          </CardContent>
        </Card>

        <a 
          href="https://starboardstudio.com" 
          target="_blank" 
          rel="noopener noreferrer"
          className="flex flex-col items-center gap-2 mt-8 transition-opacity hover:opacity-80"
          data-testid="link-starboard-studio"
        >
          <span className="text-xs text-muted-foreground">Developed by</span>
          <img 
            src={theme === "dark" ? starboardDarkLogo : starboardLightLogo}
            alt="Starboard Studio"
            className="h-8 object-contain"
          />
        </a>
      </main>
    </div>
  );
}
