# AstroPilot

**Your night sky, planned.** AstroPilot is an observing companion for amateur astronomers. It answers the
three questions that matter on any evening — *is tonight worth it, what should I look at with my telescope,
and where do I point?* — and keeps a simple observing log.

Live at [astropilot.space](https://astropilot.space).

## What's inside

| Area | What it does |
|---|---|
| **Tonight** | One clear verdict for the night (0–100) from an astronomy-specific forecast: cloud at three heights, seeing (jet-stream & wind shear), transparency (humidity, cirrus, aerosols), dew risk, darkness and moonlight. Hour-by-hour strip, 7-night outlook, best targets, planets, Moon, events, ISS passes and aurora (Kp). |
| **Sky chart** | Live all-sky planisphere for your exact location and time, with stars, constellations, planets, Moon, the planets' moons and deep-sky objects; time slider and search. |
| **Explore** | ~1,000 objects (all Messier and Caldwell, bright NGC/IC from OpenNGC, classic doubles) ranked for *your* sky darkness, telescope and tonight's Moon, plus the planets and the moons your instrument can reach tonight. |
| **Object pages** | Tonight's altitude curve, honest difficulty for your sky, the eyepiece and filter to use (with a true-field framing preview), best months, finder notes. |
| **Plan** | Your target list scheduled into a run order that makes the most of the dark hours. |
| **Journal** | 15-second observation logging, sessions, Messier/Caldwell progress, achievements (computed from the log, retroactive), stats and CSV export. |
| **Gear & locations** | Telescopes, eyepieces, Barlows, filters, cameras with computed optics; saved sites with time zone, elevation and Bortle/SQM (estimated automatically from the 2025 light-pollution atlas). |

Works without an account (guest location and a typical instrument); an account saves locations, gear and the log.

## The science

- **Positions & times**: [astronomy-engine](https://github.com/cosinekitty/astronomy) — VSOP87, full lunar theory, IAU 2006
  precession, nutation, aberration and refraction. Nights are anchored to the site's local *solar* time, so twilight, darkness
  and "tonight" are correct anywhere on Earth (polar day/night included); twilight is judged on the Sun's geometric altitude.
  Planet magnitudes follow Mallama & Hilton (2018), as JPL Horizons does (`shared/astro/planets.ts`).
- **Sky brightness**: Bortle → zenith SQM, airmass extinction, and moonlight from the Krisciunas & Schaefer (1991) model at the
  object's position. A new site's zenith SQM / Bortle is estimated from D. J. Lorenz's World Atlas of Artificial Night Sky
  Brightness (2025, VIIRS) binary tiles (`server/services/lightPollution.ts`, `GET /api/geo/sky-brightness`).
- **Visibility**: threshold-contrast detection (Blackwell 1946 / Crumey 2014 regimes: Ricco below ~20′, Piper to ~75′,
  de Vries–Rose background scaling), the best magnification the instrument offers, separate bright cores/regions,
  twilight (skycalc's Meinel fit) and moonlight; constants fitted to ~210 observing judgments
  (`shared/astro/visibility.ts`).
- **Events**: IMO J2000 solar-longitude meteor peaks with the radiant's height and the Moon at the site, topocentric
  conjunctions/occultations, eclipses timed and judged at the site over all contacts (`shared/astro/events.ts`); comets from JPL SBDB + Horizons
  (`server/services/comets.ts`, `shared/astro/comets.ts`); the planets' moons — Jupiter's computed in the
  app with transits, shadow transits, eclipses and occultations, the others from JPL Horizons
  (`shared/astro/moons.ts`, `server/services/moons.ts`).
- **Optics**: exit-pupil targets per object class, framing and seeing limits (`shared/astro/optics.ts`).
- **Forecast**: Open-Meteo NWP + CAMS aerosols (+ 7Timer when available), on true UTC hours at the site's elevation, scored by
  `shared/astro/conditions.ts`.
- **Aurora**: NOAA Kp over the site's dark hours against its corrected geomagnetic latitude, interpolated in a grid traced
  through the IGRF-14 field (`server/services/spaceWeather.ts`, `server/data/cgm-latitude.json`).

## Development

Requirements: Node 20.11+, PostgreSQL 14+.

```bash
cp .env.example .env          # set DATABASE_URL and SESSION_SECRET
npm install
npm run db:push               # first time only: creates the tables
npm run dev                   # http://localhost:5000 (PORT in .env)
```

Useful scripts: `npm run check` (types), `npm test` (unit tests), `npm run build && npm start` (production),
`npm run data:catalog` / `npm run data:sky` (regenerate catalog & star data, see `shared/data/README.md`).

### Layout

```
client/src
  pages/            route components (lazy-loaded)
  features/         tonight, sky, explore, object, journal, gear, locations
  components/       layout shell, common UI, shadcn/ui primitives
  hooks/            auth, site (observing location), prefs, active scope, catalog
shared/
  astro/            the astronomy engine (pure TypeScript, used by client and server)
  data/             catalog + star chart data (generated)
  schema.ts         Drizzle schema (backwards compatible with AstroPilot 1)
  api.ts            API contracts
server/
  routes/           one module per feature
  services/         forecast, space weather, satellites, light pollution, comets, moons
  photoStore.ts     photo storage (Postgres by default; Replit Object Storage while on Replit)
  migrate.ts        additive, idempotent schema migration run on boot
```

## Hosting

AstroPilot runs on [Render](https://render.com) from [`render.yaml`](render.yaml): a web service and a
PostgreSQL database; every push to `main` deploys automatically. Photos are stored in the database.
A [`Dockerfile`](Dockerfile) is included for other hosts. **[docs/hosting.md](docs/hosting.md)** has the
one-time move from Replit (data copy with `scripts/move-off-replit.sh`, domain switch) and day-to-day notes.

The database is migrated automatically and **additively** on boot (new columns, indexes and tables only —
existing users, logins, locations, equipment and observations are preserved).

While the app still runs on Replit, update that workspace with
`bash <(curl -fsSL https://raw.githubusercontent.com/hkaldis/astropilot/main/scripts/replit-update.sh)` in the
Replit **Shell**, then **Deploy → Republish**.

## Credits & licences

Catalog data: OpenNGC by Mattia Verga (CC BY-SA 4.0). Star chart data: d3-celestial by Olaf Frohn (BSD-3-Clause), Hipparcos.
Weather: Open-Meteo (CC BY 4.0). Space weather: NOAA SWPC. Orbits: CelesTrak (SatNOGS and AMSAT as fallbacks). Maps: © OpenStreetMap contributors.
Light pollution: World Atlas of Artificial Night Sky Brightness, D. J. Lorenz (2025), from VIIRS data by the Earth Observation
Group, Colorado School of Mines — https://djlorenz.github.io/astronomy/lp/. Comets and the moons of Mars, Saturn, Uranus and Neptune: NASA/JPL Small-Body Database and Horizons.
Meteor showers: International Meteor Organization working list.
