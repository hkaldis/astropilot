import { Link } from "wouter";
import { PageHeader, usePageTitle } from "@/components/common/Page";

const UPDATED = "4 October 2026";

function Prose({ children }: { children: React.ReactNode }) {
  return <div className="prose prose-sm max-w-2xl text-foreground/90 dark:prose-invert prose-headings:font-semibold prose-headings:text-foreground prose-a:text-primary prose-strong:text-foreground prose-li:my-0.5">{children}</div>;
}

function Privacy() {
  return (
    <Prose>
      <p>Last updated: {UPDATED}</p>
      <h2>What we store</h2>
      <ul>
        <li><strong>Account:</strong> your email address, name (optional) and a securely hashed password, or your Google account id if you sign in with Google.</li>
        <li><strong>Your observing data:</strong> saved locations (coordinates, sky darkness, time zone), equipment, target list, observing sessions, observations and any photos you upload.</li>
        <li><strong>Preferences:</strong> units, time format and defaults.</li>
      </ul>
      <p>If you use AstroPilot without an account, your chosen location and preferences stay in your browser's local storage and never reach our database.</p>
      <h2>Cookies and analytics</h2>
      <p>We use one essential cookie to keep you signed in. On astropilot.space we use Google Analytics to understand which features are used; it doesn't receive your observing data.</p>
      <h2>Services we rely on</h2>
      <ul>
        <li><strong>Open-Meteo</strong> — weather and geocoding. We send the coordinates of the place you're viewing, never your identity.</li>
        <li><strong>OpenStreetMap (Nominatim and map tiles)</strong> — place names and maps for coordinates you choose.</li>
        <li><strong>NOAA SWPC and CelesTrak</strong> — space weather and satellite orbits (no personal data sent).</li>
        <li><strong>Google</strong> — only if you choose "Continue with Google".</li>
        <li><strong>Stripe</strong> — only if you make a donation; we never see your card details.</li>
        <li><strong>Replit</strong> — hosting, database and photo storage.</li>
      </ul>
      <h2>Your control</h2>
      <p>
        You can export your journal as CSV and permanently delete your account and all associated data at any time from <Link href="/settings">Settings</Link>. We don't sell or share your data.
      </p>
      <h2>Contact</h2>
      <p>Questions: privacy@astropilot.space</p>
    </Prose>
  );
}

function Terms() {
  return (
    <Prose>
      <p>Last updated: {UPDATED}</p>
      <p>AstroPilot is provided free of charge, as is. By using it you agree to these terms.</p>
      <h2>Forecasts and calculations</h2>
      <p>
        Positions and times are computed with established astronomical algorithms and are accurate to well within practical observing needs. Weather, seeing and
        transparency are forecasts and estimates — the sky has the final word. Always check conditions on site.
      </p>
      <h2>Safety</h2>
      <p>Never point a telescope, binoculars or your eyes at the Sun without a certified solar filter. Observe from safe places and take care at night.</p>
      <h2>Your content</h2>
      <p>You own what you log. You're responsible for photos you upload and must have the right to share them. Don't upload unlawful content.</p>
      <h2>Availability</h2>
      <p>We work to keep AstroPilot running but can't guarantee uninterrupted service. We may change or discontinue features.</p>
      <h2>Contact</h2>
      <p>legal@astropilot.space</p>
    </Prose>
  );
}

function About() {
  return (
    <Prose>
      <p>
        AstroPilot is an observing companion for amateur astronomers. It answers three questions every clear evening: <em>is tonight worth it, what should I look at
        with my telescope, and where do I point?</em> — and then keeps a simple log of what you saw.
      </p>
      <h2>How it works</h2>
      <ul>
        <li>
          <strong>Sky positions</strong> come from <a href="https://github.com/cosinekitty/astronomy">astronomy-engine</a> (VSOP87 planetary theory, a full lunar model, IAU
          precession and nutation, aberration and atmospheric refraction), computed for your exact coordinates. Night times are anchored to your site's local solar
          time, so they're right wherever you are.
        </li>
        <li>
          <strong>Sky brightness</strong> combines your site's Bortle class (or SQM reading), atmospheric extinction with altitude and moonlight from the
          Krisciunas &amp; Schaefer (1991) model at each object's position.
        </li>
        <li>
          <strong>Visibility</strong> compares each object's surface brightness with that sky, corrected for its size, your aperture and its altitude, giving an honest
          easy-to-out-of-reach rating.
        </li>
        <li>
          <strong>The observing forecast</strong> uses Open-Meteo numerical weather models (cloud at three heights, humidity, dew point, wind and jet-stream winds) and
          aerosol forecasts to estimate cloud, seeing, transparency and dew risk hour by hour.
        </li>
        <li>
          <strong>The catalog</strong> includes all Messier and Caldwell objects plus bright NGC/IC galaxies, nebulae and clusters from{" "}
          <a href="https://github.com/mattiaverga/OpenNGC">OpenNGC</a> (CC BY-SA 4.0), and classic double stars. Star chart data from{" "}
          <a href="https://github.com/ofrohn/d3-celestial">d3-celestial</a> (Hipparcos).
        </li>
      </ul>
      <p>
        Built by Starboard Studio. Feedback is very welcome: hello@astropilot.space
      </p>
    </Prose>
  );
}

export default function LegalPage({ page }: { page: "privacy" | "terms" | "about" }) {
  const title = page === "privacy" ? "Privacy" : page === "terms" ? "Terms of use" : "About AstroPilot";
  usePageTitle(title);
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={title} />
      {page === "privacy" ? <Privacy /> : page === "terms" ? <Terms /> : <About />}
    </div>
  );
}
