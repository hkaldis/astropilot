# AstroPilot

**Your night sky, planned.** AstroPilot is an observing companion for amateur astronomers. It answers the
three questions that matter on any evening — *is tonight worth it, what should I look at with my telescope,
and where do I point?* — and keeps a simple observing log.

Live at [astropilot.space](https://astropilot.space).

## What's inside

| Area | What it does |
|---|---|
| **Tonight** | One clear verdict for the night (0–100) from an astronomy-specific forecast: cloud at three heights, seeing (jet-stream & wind shear), transparency (humidity, cirrus, aerosols), dew risk, darkness and moonlight. Hour-by-hour strip, 7-night outlook, best targets, planets, Moon, events, ISS passes and aurora (Kp). |
| **Sky chart** | Live all-sky planisphere for your exact location and time, with stars, constellations, planets, Moon and deep-sky objects; time slider and search. |
| **Explore** | ~1,000 objects (all Messier and Caldwell, bright NGC/IC from OpenNGC, classic doubles) ranked for *your* sky darkness, telescope and tonight's Moon. |
| **Object pages** | Tonight's altitude curve, honest difficulty for your sky, the eyepiece and filter to use (with a true-field framing preview), best months, finder notes. |
| **Plan** | Your target list scheduled into a run order that makes the most of the dark hours. |
| **Journal** | 15-second observation logging, sessions, Messier/Caldwell progress, stats and CSV export. |
| **Gear & locations** | Telescopes, eyepieces, Barlows, filters, cameras with computed optics; saved sites with time zone, elevation and Bortle/SQM. |

Works without an account (guest location and a typical instrument); an account saves locations, gear and the log.

## The science

- **Positions & times**: [astronomy-engine](https://github.com/cosinekitty/astronomy) — VSOP87, full lunar theory, IAU 2006
  precession, nutation, aberration and refraction. Nights are anchored to the site's local *solar* time, so twilight, darkness
  and "tonight" are correct anywhere on Earth (polar day/night included).
- **Sky brightness**: Bortle → zenith SQM, airmass extinction, and moonlight from the Krisciunas & Schaefer (1991) model at the
  object's position.
- **Visibility**: object surface brightness vs that sky, corrected for apparent size, aperture and altitude
  (`shared/astro/visibility.ts`).
- **Optics**: exit-pupil targets per object class, framing and seeing limits (`shared/astro/optics.ts`).
- **Forecast**: Open-Meteo NWP + CAMS aerosols (+ 7Timer when available), scored by `shared/astro/conditions.ts`.

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
  services/         forecast, space weather, satellites
  migrate.ts        additive, idempotent schema migration run on boot
```

## Deploying (Replit)

The production database is migrated automatically and **additively** on boot (new columns and indexes only —
existing users, sessions, locations, equipment and observations are preserved and shown in the new UI).

To update the Replit workspace from this repository, open the Replit **Shell** and run:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/hkaldis/astropilot/main/scripts/replit-update.sh)
```

It backs up the current code to `.backups/`, replaces the app code with `main`, installs and builds. Then press
**Deploy → Republish**. Required secrets: `DATABASE_URL`, `SESSION_SECRET`; optional: `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`
(Google sign-in), `PRIVATE_OBJECT_DIR` (photo uploads via Replit Object Storage); donations use the Replit Stripe connector.

## Credits & licences

Catalog data: OpenNGC by Mattia Verga (CC BY-SA 4.0). Star chart data: d3-celestial by Olaf Frohn (BSD-3-Clause), Hipparcos.
Weather: Open-Meteo (CC BY 4.0). Space weather: NOAA SWPC. Orbits: CelesTrak. Maps: © OpenStreetMap contributors.
