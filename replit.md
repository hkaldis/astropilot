# AstroPilot

## Overview

AstroPilot is a multi-user web application for astronomers to plan, optimize, and log telescope observations. It offers features like equipment management, night condition scoring, celestial object catalogs, smart equipment recommendations, and observation session tracking. The application aims to provide data-driven insights for optimal viewing experiences, including gamification, real-time ephemeris calculations, and a seasonal star party calendar.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
-   **Framework:** React 18 with TypeScript, Vite for building, and Wouter for routing.
-   **State Management:** React Query for server state, React Context for themes, React Hook Form with Zod for validation, and a custom `useAuth` hook for authentication.
-   **UI/UX:** Radix UI, Tailwind CSS with a custom light/dark theme, and shadcn/ui components. Emphasizes "night-vision friendly precision," responsive mobile-first design, Inter font for UI, and JetBrains Mono for technical data.
-   **Auth Guard Pattern:** All authenticated React Query hooks must include `enabled: !!user` to prevent 401 errors.

### Backend
-   **Server:** Express.js with native Node.js HTTP server for WebSocket support.
-   **API:** RESTful JSON API with functional grouping and authentication middleware.
-   **Authentication:** Multi-provider (Google OAuth 2.0, email/password) via Passport.js, session-based with secure HTTP-only cookies (7-day TTL), PostgreSQL session store via `connect-pg-simple`, and bcrypt for password hashing (12 salt rounds).
-   **Build:** `esbuild` for server code bundling.

### Data Storage & Schema
-   **Database:** PostgreSQL via Neon serverless driver.
-   **ORM:** Drizzle ORM for type-safe queries.
-   **Core Models:** Users, Equipment, Locations, Celestial Objects, Observation Sessions, Observations, Object Settings, Night Conditions.
-   **Schema Highlights:** Enums for categories, rich metadata, computed scores (TotalScore, PlanetScore, DSOScore), and entity relationships.
-   **Migrations:** Drizzle Kit.

### Key Features & Business Logic
-   **Optics Calculation Engine:** Computes magnification, exit pupil, true FOV, and optical physics.
-   **Enhanced Equipment Recommendation Engine v3.0:** Physics-based suitability scoring with size/surface-brightness-aware exit pupil logic for compact galaxies and planetary nebulae, Bortle-weighted magnification adjustments for light pollution, enhanced double star handling with barlow suggestions, heuristic size fallbacks for objects without angular size data, ultra-small exit pupil penalties (<0.5mm), escalating FOV coverage penalties, and special handling for comets (tail-aware) and meteor showers. Includes `rankEyepieceCandidates` function that scores all eyepiece/barlow combinations and returns best option with alternates. Integrates optical modifiers (focal reducers, coma correctors).
-   **Night Scoring Algorithm v2.0:** Multiplicative gate system with weighted quality scores for various atmospheric conditions, including composite scores for Total, Planet, and DSO observations.
-   **Enhanced Filter Recommendation System:** Provides astronomically-accurate filter guidance with object-specific overrides and category-based rules.
-   **Location Geocoding:** Uses OpenStreetMap Nominatim for map-based location selection.
-   **Observation Tracking:** Stores recommended vs. actual equipment, supports multiple photos per observation via Replit Object Storage, and tracks camera settings.
-   **Gamification System:** Features 28 badge types, an XP leveling system (20 levels with astronomer-themed titles), and progress tracking for observations and achievements.
-   **Celestial Object Catalog:** Includes 143 detailed objects (Messier, solar system, NGC, comets, meteor showers) and transient object support.
-   **Real-Time Ephemeris:** High-precision planetary calculations using `astronomy-engine`.
-   **Coordinate Parsing:** Client-side RA/Dec parsers support multiple formats.
-   **Visibility Scoring:** Server-side `calculateQuickVisibility` handles overnight astronomical darkness windows and samples altitude during darkness.
-   **Seasonal Star Party Calendar:** Displays seasonal observing highlights and meteor shower calendars.
-   **Dynamic "Best for Tonight" Recommendations:** Weighted scoring displayed on the dashboard with filter options.
-   **Object Detail Sheet:** Interactive panel with visibility data, altitude charts, technical details, and personalized equipment recommendations.
-   **"Wow" Labeling System:** Marks 35 impressive celestial objects for easy filtering.
-   **Sky Tonight Tool:** Advanced visibility planning tool with per-object weather condition badges and multi-select filtering.
-   **Moon Interference Calculation:** Unified threshold-based logic for consistent moon interference levels.
-   **Equipment Analyzer:** Comprehensive tool for object suitability, filter awareness, magnification coverage gap analysis, and comparison of eyepiece/barlow combinations.
-   **Predefined Equipment Databases:** Searchable databases of over 270 telescopes, 120+ eyepieces, 40+ Barlows, 130+ filters, and 45+ cameras.
-   **Astrophotography Guide:** Provides camera settings recommendations by object category.
-   **Watch List System:** Personal observation target management with 30-day smart scheduling, priority levels, status workflow, observation window calculations, and a calendar view.
-   **Enhanced Observation Journal:** Tab-based interface with Sessions (history), Gallery (astrophoto grid), and Analytics (summary stats).

## External Dependencies

-   **Core Infrastructure:** Neon Serverless PostgreSQL, Google OAuth 2.0, Replit deployment environment, Replit Object Storage.
-   **Key Third-Party Services:** Google Fonts CDN, Radix UI, OpenStreetMap Nominatim API (geocoding), OpenStreetMap (map embed).
-   **Notable Packages:** `date-fns`, `zod`, `nanoid`, `ws`, `express-session`, `passport`, `passport-google-oauth20`, `passport-local`, `bcrypt`, `astronomy-engine`, `connect-pg-simple`, `react-leaflet`.
-   **APIs:** NASA DONKI (Space Weather), Where the ISS at? API, Open-Meteo (weather data with source tracking), Stripe (donation processing).
-   **Donation Feature:** "Buy Me a Beer" donation system using Stripe Checkout with 3 price points (5€, 10€, 50€). Products seeded via `scripts/seed-donations.ts`. Donation button in sidebar footer. Uses Replit Stripe connector for API key management.