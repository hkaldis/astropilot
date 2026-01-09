import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Telescope,
  MapPin,
  CloudSun,
  Star,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  Rocket,
} from "lucide-react";
import { cn } from "@/lib/utils";
import faviconLogo from "@assets/favicon_1764867319619.png";

interface OnboardingTutorialProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
}

const TUTORIAL_STEPS = [
  {
    id: "welcome",
    title: "Welcome to AstroPilot",
    description: "Your intelligent companion for planning and tracking telescope observations. Let's get you started on your astronomical journey.",
    icon: Telescope,
    iconBg: "bg-primary/20",
    iconColor: "text-primary",
    illustration: (
      <div className="flex items-center justify-center gap-3 mb-6">
        <div className="relative">
          <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full scale-125" />
          <img 
            src={faviconLogo} 
            alt="AstroPilot" 
            className="w-20 h-20 relative z-10 object-contain"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Sparkles className="w-5 h-5 text-chart-4 animate-pulse" />
          <Star className="w-4 h-4 text-chart-2" />
          <Sparkles className="w-3 h-3 text-chart-5 animate-pulse delay-150" />
        </div>
      </div>
    ),
  },
  {
    id: "location",
    title: "Set Up Your Location",
    description: "Your observing location determines what objects are visible and when. We'll use it to calculate rise/set times, altitude, and light pollution levels using the Bortle scale.",
    icon: MapPin,
    iconBg: "bg-chart-2/20",
    iconColor: "text-chart-2",
    illustration: (
      <div className="flex items-center justify-center mb-6">
        <div className="relative">
          <div className="absolute inset-0 bg-chart-2/20 blur-xl rounded-full scale-150" />
          <div className="relative z-10 flex items-end gap-2">
            <div className="w-8 h-12 bg-muted/50 rounded-t-sm" />
            <div className="w-6 h-8 bg-muted/30 rounded-t-sm" />
            <MapPin className="w-14 h-14 text-chart-2 -mb-1" />
            <div className="w-5 h-6 bg-muted/40 rounded-t-sm" />
            <div className="w-7 h-10 bg-muted/50 rounded-t-sm" />
          </div>
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-24 h-1 bg-chart-2/30 rounded-full blur-sm" />
        </div>
      </div>
    ),
  },
  {
    id: "conditions",
    title: "Log Tonight's Conditions",
    description: "Track atmospheric conditions like cloud cover, seeing, and humidity. AstroPilot calculates observing quality scores to help you decide if it's a good night for planets or deep-sky objects.",
    icon: CloudSun,
    iconBg: "bg-chart-4/20",
    iconColor: "text-chart-4",
    illustration: (
      <div className="flex items-center justify-center mb-6">
        <div className="relative">
          <div className="absolute inset-0 bg-chart-4/10 blur-2xl rounded-full scale-150" />
          <div className="relative z-10 flex flex-col items-center gap-3">
            <CloudSun className="w-14 h-14 text-chart-4" />
            <div className="flex gap-4 text-sm">
              <div className="flex flex-col items-center">
                <div className="w-12 h-2 bg-chart-2 rounded-full" />
                <span className="text-xs text-muted-foreground mt-1">Clear</span>
              </div>
              <div className="flex flex-col items-center">
                <div className="w-12 h-2 bg-chart-4 rounded-full" />
                <span className="text-xs text-muted-foreground mt-1">Seeing</span>
              </div>
              <div className="flex flex-col items-center">
                <div className="w-12 h-2 bg-chart-5 rounded-full" />
                <span className="text-xs text-muted-foreground mt-1">Humidity</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: "observe",
    title: "Plan Your Observations",
    description: "Use the Sky Tonight tool to find what's visible. Get personalized recommendations based on your equipment, location, and current conditions. Track your observations and earn achievements!",
    icon: Star,
    iconBg: "bg-chart-5/20",
    iconColor: "text-chart-5",
    illustration: (
      <div className="flex items-center justify-center mb-6">
        <div className="relative">
          <div className="absolute inset-0 bg-chart-5/10 blur-2xl rounded-full scale-150" />
          <div className="relative z-10 grid grid-cols-3 gap-3">
            <div className="flex flex-col items-center p-2 rounded-lg bg-muted/30">
              <Star className="w-6 h-6 text-chart-5 mb-1" />
              <span className="text-xs text-muted-foreground">Galaxies</span>
            </div>
            <div className="flex flex-col items-center p-2 rounded-lg bg-muted/30">
              <Sparkles className="w-6 h-6 text-chart-2 mb-1" />
              <span className="text-xs text-muted-foreground">Nebulae</span>
            </div>
            <div className="flex flex-col items-center p-2 rounded-lg bg-muted/30">
              <div className="w-6 h-6 rounded-full bg-chart-4 mb-1" />
              <span className="text-xs text-muted-foreground">Planets</span>
            </div>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: "start",
    title: "Let's Get Started!",
    description: "Add your first observing location to unlock all of AstroPilot's features. You can add multiple locations for different observing sites.",
    icon: Rocket,
    iconBg: "bg-primary/20",
    iconColor: "text-primary",
    illustration: (
      <div className="flex items-center justify-center mb-6">
        <div className="relative">
          <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full scale-150" />
          <div className="relative z-10 flex flex-col items-center">
            <Rocket className="w-16 h-16 text-primary mb-2" />
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20">
              <MapPin className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-primary">Add Location</span>
            </div>
          </div>
        </div>
      </div>
    ),
  },
];

export function OnboardingTutorial({ open, onOpenChange, onComplete }: OnboardingTutorialProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [, navigate] = useLocation();

  useEffect(() => {
    if (open) {
      setCurrentStep(0);
    }
  }, [open]);

  const step = TUTORIAL_STEPS[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === TUTORIAL_STEPS.length - 1;

  const handleNext = () => {
    if (isLastStep) {
      localStorage.setItem("astropilot_tutorial_completed", "true");
      onOpenChange(false);
      onComplete?.();
      navigate("/locations");
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (!isFirstStep) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      return;
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent 
        className="sm:max-w-md p-0 gap-0 overflow-hidden [&>button]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <div className="p-6 pb-4">
          {step.illustration}
          
          <div className="text-center space-y-2">
            <h2 className="text-xl font-semibold tracking-tight" data-testid="text-tutorial-title">
              {step.title}
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {step.description}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-center gap-1.5 py-3">
          {TUTORIAL_STEPS.map((_, index) => (
            <div
              key={index}
              className={cn(
                "w-2 h-2 rounded-full transition-all duration-300",
                index === currentStep
                  ? "bg-primary w-6"
                  : index < currentStep
                  ? "bg-primary/50"
                  : "bg-muted"
              )}
              data-testid={`dot-step-${index}`}
            />
          ))}
        </div>

        <div className="flex items-center gap-2 p-4 pt-2 border-t bg-muted/30">
          <Button
            variant="ghost"
            onClick={handleBack}
            disabled={isFirstStep}
            className="flex-1"
            data-testid="button-tutorial-back"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
          <Button
            onClick={handleNext}
            className="flex-1"
            data-testid="button-tutorial-next"
          >
            {isLastStep ? (
              <>
                Proceed
                <MapPin className="w-4 h-4 ml-1" />
              </>
            ) : (
              <>
                Next
                <ChevronRight className="w-4 h-4 ml-1" />
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
