import { Link } from "wouter";
import { CloudMoon, Compass, NotebookPen, Telescope } from "lucide-react";
import { PlacePicker, placeLabel } from "@/components/common/PlacePicker";
import { useSite } from "@/hooks/useSite";
import { useAuth } from "@/hooks/useAuth";
import { Logo } from "@/components/common/Glyphs";

const POINTS = [
  { icon: CloudMoon, title: "Is tonight worth it?", body: "A real observing forecast — clouds by layer, seeing, transparency, dew and moonlight — turned into one clear verdict and the best hours." },
  { icon: Telescope, title: "What should I look at?", body: "Targets ranked for your sky darkness, your telescope and tonight's Moon, with the eyepiece and filter to use." },
  { icon: Compass, title: "Where do I point?", body: "A live sky chart for your exact location and time, so you can find it at the eyepiece." },
  { icon: NotebookPen, title: "Remember it", body: "A quick observing log with Messier and Caldwell progress that grows with you." },
];

export function Welcome() {
  const { setGuestSite } = useSite();
  const { user } = useAuth();
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-10 py-2 lg:py-6">
      <section className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div>
          <Logo className="mb-6 lg:hidden" />
          <div className="eyebrow">Your observing companion</div>
          <h1 className="mt-3 font-display text-[2.8rem] leading-[0.98] tracking-tight sm:text-[3.6rem]">
            Know if tonight is <em className="text-primary">worth it</em> — and exactly what to see.
          </h1>
          <p className="mt-4 max-w-xl text-[1.02rem] text-muted-foreground">
            AstroPilot combines a professional-grade sky model with an astronomy-specific weather forecast for your exact spot. No guesswork, no clutter.
          </p>
          {!user && (
            <p className="mt-4 text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href="/login" className="link">
                Sign in
              </Link>
            </p>
          )}
        </div>
        <div className="panel p-5 sm:p-6">
          <h2 className="font-medium">Where do you observe from?</h2>
          <p className="mb-4 mt-1 text-sm text-muted-foreground">Everything is computed for your exact coordinates and time zone.</p>
          <PlacePicker
            onPick={(p) =>
              setGuestSite({
                name: placeLabel(p).split(",")[0],
                lat: p.latitude,
                lon: p.longitude,
                elevation: p.elevation,
                timezone: p.timezone,
                bortle: 5,
                sqm: null,
              })
            }
          />
          <p className="mt-3 text-2xs text-muted-foreground">Your position stays in this browser unless you save it to your account.</p>
        </div>
      </section>
      <section className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
        {POINTS.map(({ icon: Icon, title, body }) => (
          <div key={title} className="flex gap-4">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-medium">{title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{body}</p>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
