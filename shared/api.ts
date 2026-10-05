/** API contracts shared by server and client (AstroPilot 2). */
import type { Achievement } from "./achievements";
export type { Achievement, Tier as AchievementTier } from "./achievements";

export interface Preferences {
  units?: "metric" | "imperial";
  timeFormat?: "24h" | "12h";
  defaultLocationId?: number | null;
  defaultTelescopeId?: number | null;
  minAltitude?: number; // degrees, default 20
  experience?: "beginner" | "intermediate" | "advanced";
  onboarded?: boolean;
}

export interface ApiUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  authProvider: string | null;
  hasPassword: boolean;
  preferences: Preferences;
  createdAt: string | null;
}

export interface ApiFeatures {
  google: boolean;
  photos: boolean;
  donations: boolean;
}

export interface ApiLocation {
  id: number;
  name: string;
  latitude: number | null;
  longitude: number | null;
  bortle: number;
  sqm: number | null;
  elevation: number | null;
  timezone: string | null;
  notes: string | null;
  isFavorite: boolean;
  createdAt: string | null;
}

export interface LocationInput {
  name: string;
  latitude: number;
  longitude: number;
  bortle: number;
  sqm?: number | null;
  elevation?: number | null;
  timezone?: string | null;
  notes?: string | null;
  isFavorite?: boolean;
}

export interface GeoPlace {
  name: string;
  region: string | null; // admin1
  country: string | null;
  latitude: number;
  longitude: number;
  elevation: number | null;
  timezone: string | null;
}

export interface ApiTelescope {
  id: number;
  name: string;
  aperture: number; // mm
  focalLength: number; // mm
  type: string | null; // "reflector" | "refractor" | "sct" | "mak" | "dobsonian" | "binoculars" | ...
  obstructionRatio: number | null; // %
}
export interface ApiEyepiece {
  id: number;
  name: string;
  focalLength: number;
  apparentFov: number | null;
}
export interface ApiBarlow {
  id: number;
  name: string;
  factor: number;
}
export interface ApiFilter {
  id: number;
  name: string;
  type: string;
}
export interface ApiCamera {
  id: number;
  name: string;
  type: string;
  sensorSize: string | null;
}
export interface ApiGear {
  telescopes: ApiTelescope[];
  eyepieces: ApiEyepiece[];
  barlows: ApiBarlow[];
  filters: ApiFilter[];
  cameras: ApiCamera[];
}
export type GearKind = keyof ApiGear;

export interface ApiTarget {
  id: number;
  ref: string; // catalog id ("M31") or solar-system id ("jupiter")
  name: string;
  priority: "high" | "medium" | "low";
  notes: string | null;
  status: "planned" | "observed" | "dismissed";
  createdAt: string | null;
}

export interface SessionConditions {
  seeing?: number | null; // 1..5 (observer rating)
  transparency?: number | null; // 1..5
  temperatureC?: number | null;
  forecastScore?: number | null; // 0..100 snapshot
  moonIllumination?: number | null; // 0..1
  sqmReading?: number | null;
}

export interface ApiObservation {
  id: number;
  sessionId: number;
  ref: string | null; // catalog reference, null for legacy objects that can't be matched
  objectName: string;
  objectType: string | null;
  observedAt: string | null;
  telescopeId: number | null;
  eyepieceId: number | null;
  barlowId: number | null;
  filterId: number | null;
  cameraId: number | null;
  magnification: number | null;
  rating: number | null; // 1..5
  seeing: number | null;
  transparency: number | null;
  notes: string | null;
  photos: { id: number; url: string }[];
  createdAt: string | null;
}

export interface ApiSession {
  id: number;
  title: string | null;
  date: string; // start
  endDate: string | null;
  locationId: number | null;
  locationName: string | null;
  bortle: number;
  notes: string | null;
  conditions: SessionConditions | null;
  observationCount: number;
  observations?: ApiObservation[];
}

export interface ObservationInput {
  sessionId?: number; // omitted → find or create tonight's session at locationId
  locationId?: number | null;
  ref: string;
  observedAt?: string;
  telescopeId?: number | null;
  eyepieceId?: number | null;
  barlowId?: number | null;
  filterId?: number | null;
  cameraId?: number | null;
  magnification?: number | null;
  rating?: number | null;
  seeing?: number | null;
  transparency?: number | null;
  notes?: string | null;
}

export interface JournalStats {
  sessions: number;
  observations: number;
  uniqueObjects: number;
  hoursObserved: number;
  firstSession: string | null;
  lastSession: string | null;
  longestStreakNights: number; // consecutive nights with a session
  byType: Record<string, number>;
  observedRefs: string[]; // unique catalog refs seen
  messierSeen: number[]; // Messier numbers seen
  caldwellSeen: number[];
  planetsSeen: string[];
  perMonth: { month: string; observations: number }[]; // last 12 months, "YYYY-MM"
  achievements: Achievement[];
}

/** Light-pollution estimate for a point (GET /api/geo/sky-brightness). */
export interface SkyBrightnessEstimate {
  sqm: number; // estimated zenith sky brightness, mag/arcsec²
  ratio: number; // artificial / natural zenith brightness
  bortle: number; // approximate Bortle class derived from the zenith brightness
  source: string;
  attribution: string;
  url: string;
}

/** An observing site resolved on the client (saved location or a guest location). */
export interface ObservingSite {
  key: string; // "loc:12" | "guest"
  locationId: number | null;
  name: string;
  lat: number;
  lon: number;
  elevation: number | null;
  timezone: string | null;
  bortle: number;
  sqm: number | null;
  /** Where the sky darkness came from (guest sites): the light-pollution atlas, the user, or a default. */
  bortleSource?: "atlas" | "user" | "default";
}
