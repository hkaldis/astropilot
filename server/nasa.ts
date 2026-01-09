import { format, subDays } from "date-fns";

const NASA_API_KEY = process.env.NASA_API_KEY || "DEMO_KEY";
const NASA_BASE_URL = "https://api.nasa.gov";

export interface APODResponse {
  date: string;
  title: string;
  explanation: string;
  url: string;
  hdurl?: string;
  media_type: "image" | "video";
  copyright?: string;
  thumbnail_url?: string;
}

export interface GeomageticStorm {
  gstID: string;
  startTime: string;
  link: string;
  allKpIndex: Array<{
    observedTime: string;
    kpIndex: number;
    source: string;
  }>;
  linkedEvents?: Array<{
    activityID: string;
  }>;
}

export interface SolarFlare {
  flrID: string;
  beginTime: string;
  peakTime: string;
  endTime?: string;
  classType: string;
  sourceLocation?: string;
  activeRegionNum?: number;
  linkedEvents?: Array<{
    activityID: string;
  }>;
  link: string;
}

export interface SpaceWeatherNotification {
  messageType: string;
  messageID: string;
  messageURL: string;
  messageIssueTime: string;
  messageBody: string;
}

export interface SpaceWeatherSummary {
  currentConditions: "quiet" | "minor" | "moderate" | "strong" | "severe" | "extreme";
  recentStorms: GeomageticStorm[];
  recentFlares: SolarFlare[];
  auroraLikelihood: "low" | "moderate" | "high" | "very_high";
  kpIndex: number | null;
  notifications: SpaceWeatherNotification[];
  lastUpdated: string;
  summary: string;
  observingImpact: "none" | "minimal" | "minor" | "moderate" | "significant";
  observingAdvice: string;
}

let apodCache: { data: APODResponse | null; fetchedAt: number } = {
  data: null,
  fetchedAt: 0,
};

let spaceWeatherCache: { data: SpaceWeatherSummary | null; fetchedAt: number } = {
  data: null,
  fetchedAt: 0,
};

const APOD_CACHE_DURATION = 60 * 60 * 1000;
const SPACE_WEATHER_CACHE_DURATION = 15 * 60 * 1000;

export async function getAPOD(): Promise<APODResponse | null> {
  const now = Date.now();
  if (apodCache.data && now - apodCache.fetchedAt < APOD_CACHE_DURATION) {
    return apodCache.data;
  }

  try {
    const response = await fetch(
      `${NASA_BASE_URL}/planetary/apod?api_key=${NASA_API_KEY}`
    );

    if (!response.ok) {
      console.error("APOD API error:", response.status, response.statusText);
      return apodCache.data;
    }

    const data: APODResponse = await response.json();
    apodCache = { data, fetchedAt: now };
    return data;
  } catch (error) {
    console.error("Error fetching APOD:", error);
    return apodCache.data;
  }
}

export async function getSpaceWeather(): Promise<SpaceWeatherSummary> {
  const now = Date.now();
  if (spaceWeatherCache.data && now - spaceWeatherCache.fetchedAt < SPACE_WEATHER_CACHE_DURATION) {
    return spaceWeatherCache.data;
  }

  const endDate = format(new Date(), "yyyy-MM-dd");
  const startDate = format(subDays(new Date(), 7), "yyyy-MM-dd");

  try {
    const [gstResponse, flrResponse, notificationsResponse] = await Promise.all([
      fetch(
        `${NASA_BASE_URL}/DONKI/GST?startDate=${startDate}&endDate=${endDate}&api_key=${NASA_API_KEY}`
      ),
      fetch(
        `${NASA_BASE_URL}/DONKI/FLR?startDate=${startDate}&endDate=${endDate}&api_key=${NASA_API_KEY}`
      ),
      fetch(
        `${NASA_BASE_URL}/DONKI/notifications?startDate=${startDate}&endDate=${endDate}&type=all&api_key=${NASA_API_KEY}`
      ),
    ]);

    let storms: GeomageticStorm[] = [];
    let flares: SolarFlare[] = [];
    let notifications: SpaceWeatherNotification[] = [];

    if (gstResponse.ok) {
      const gstData = await gstResponse.json();
      storms = Array.isArray(gstData) ? gstData : [];
    }

    if (flrResponse.ok) {
      const flrData = await flrResponse.json();
      flares = Array.isArray(flrData) ? flrData : [];
    }

    if (notificationsResponse.ok) {
      const notifData = await notificationsResponse.json();
      notifications = Array.isArray(notifData) ? notifData.slice(0, 5) : [];
    }

    const latestKp = getLatestKpIndex(storms);
    const conditions = determineConditions(latestKp, storms, flares);
    const auroraLikelihood = determineAuroraLikelihood(latestKp);
    const significantFlares = flares.filter((f) => f.classType.startsWith("M") || f.classType.startsWith("X"));
    const { summary: summaryText, observingImpact, observingAdvice } = generateSpaceWeatherSummary(
      conditions,
      latestKp,
      auroraLikelihood,
      storms,
      significantFlares
    );

    const summaryData: SpaceWeatherSummary = {
      currentConditions: conditions,
      recentStorms: storms.slice(0, 3),
      recentFlares: significantFlares.slice(0, 5),
      auroraLikelihood,
      kpIndex: latestKp,
      notifications,
      lastUpdated: new Date().toISOString(),
      summary: summaryText,
      observingImpact,
      observingAdvice,
    };

    spaceWeatherCache = { data: summaryData, fetchedAt: now };
    return summaryData;
  } catch (error) {
    console.error("Error fetching space weather:", error);
    return (
      spaceWeatherCache.data || {
        currentConditions: "quiet",
        recentStorms: [],
        recentFlares: [],
        auroraLikelihood: "low",
        kpIndex: null,
        notifications: [],
        lastUpdated: new Date().toISOString(),
        summary: "Space weather data is temporarily unavailable. Please check back shortly.",
        observingImpact: "none",
        observingAdvice: "Unable to determine current conditions. Proceed with normal observation planning.",
      }
    );
  }
}

function getLatestKpIndex(storms: GeomageticStorm[]): number | null {
  if (storms.length === 0) return null;

  const allKp: { time: Date; kp: number }[] = [];
  for (const storm of storms) {
    if (storm.allKpIndex) {
      for (const kp of storm.allKpIndex) {
        allKp.push({
          time: new Date(kp.observedTime),
          kp: kp.kpIndex,
        });
      }
    }
  }

  if (allKp.length === 0) return null;

  allKp.sort((a, b) => b.time.getTime() - a.time.getTime());
  return allKp[0].kp;
}

function determineConditions(
  kpIndex: number | null,
  storms: GeomageticStorm[],
  flares: SolarFlare[]
): SpaceWeatherSummary["currentConditions"] {
  const hasXFlare = flares.some((f) => f.classType.startsWith("X"));
  const hasMFlare = flares.some((f) => f.classType.startsWith("M"));
  const recentStorms = storms.filter((s) => {
    const stormTime = new Date(s.startTime);
    const hoursSince = (Date.now() - stormTime.getTime()) / (1000 * 60 * 60);
    return hoursSince < 48;
  });

  if (kpIndex !== null) {
    if (kpIndex >= 8) return "extreme";
    if (kpIndex >= 7) return "severe";
    if (kpIndex >= 6) return "strong";
    if (kpIndex >= 5) return "moderate";
    if (kpIndex >= 4) return "minor";
  }

  if (hasXFlare || recentStorms.length > 0) return "moderate";
  if (hasMFlare) return "minor";

  return "quiet";
}

function determineAuroraLikelihood(kpIndex: number | null): SpaceWeatherSummary["auroraLikelihood"] {
  if (kpIndex === null) return "low";
  if (kpIndex >= 7) return "very_high";
  if (kpIndex >= 5) return "high";
  if (kpIndex >= 4) return "moderate";
  return "low";
}

function generateSpaceWeatherSummary(
  conditions: SpaceWeatherSummary["currentConditions"],
  kpIndex: number | null,
  auroraLikelihood: SpaceWeatherSummary["auroraLikelihood"],
  storms: GeomageticStorm[],
  flares: SolarFlare[]
): { summary: string; observingImpact: SpaceWeatherSummary["observingImpact"]; observingAdvice: string } {
  const parts: string[] = [];
  let observingImpact: SpaceWeatherSummary["observingImpact"] = "none";
  let observingAdvice = "";

  const xFlares = flares.filter(f => f.classType.startsWith("X"));
  const mFlares = flares.filter(f => f.classType.startsWith("M"));
  const recentStorms = storms.filter(s => {
    const hoursSince = (Date.now() - new Date(s.startTime).getTime()) / (1000 * 60 * 60);
    return hoursSince < 48;
  });
  const activeStorm = storms.find(s => {
    const hoursSince = (Date.now() - new Date(s.startTime).getTime()) / (1000 * 60 * 60);
    return hoursSince < 24;
  });

  // EXTREME CONDITIONS (Kp 8-9)
  if (conditions === "extreme") {
    parts.push("Extreme geomagnetic storm in progress.");
    if (kpIndex !== null) {
      parts.push(`Kp index has reached ${kpIndex}.`);
    }
    parts.push("Aurora visible at unusually low latitudes, potentially as far south as 40°N.");
    observingImpact = "significant";
    observingAdvice = "Exceptional aurora opportunity! However, extreme solar activity may cause GPS disruptions and affect goto telescope mounts.";
  }
  // SEVERE CONDITIONS (Kp 7)
  else if (conditions === "severe") {
    parts.push("Severe geomagnetic storm detected.");
    if (kpIndex !== null) {
      parts.push(`Current Kp index is ${kpIndex}.`);
    }
    parts.push("Strong aurora activity expected down to mid-latitudes (45-50°N).");
    observingImpact = "moderate";
    observingAdvice = "Great aurora viewing conditions! Some interference possible with sensitive electronic equipment.";
  }
  // STRONG CONDITIONS (Kp 6)
  else if (conditions === "strong") {
    parts.push("Strong geomagnetic activity underway.");
    if (kpIndex !== null) {
      parts.push(`Kp index at ${kpIndex}.`);
    }
    parts.push("Aurora likely visible at high latitudes (55°N and above).");
    observingImpact = "minor";
    observingAdvice = "Good conditions for aurora hunters at higher latitudes. Deep sky observing remains excellent.";
  }
  // MODERATE CONDITIONS (Kp 5)
  else if (conditions === "moderate") {
    if (activeStorm) {
      parts.push("Moderate geomagnetic storm activity.");
    } else if (xFlares.length > 0) {
      const strongestX = xFlares.sort((a, b) => 
        parseFloat(b.classType.slice(1)) - parseFloat(a.classType.slice(1))
      )[0];
      parts.push(`Major ${strongestX.classType} solar flare recorded.`);
      parts.push("Possible geomagnetic effects in the coming days.");
    } else {
      parts.push("Elevated solar activity detected.");
    }
    if (kpIndex !== null && kpIndex >= 5) {
      parts.push(`Kp index is ${kpIndex} - aurora possible at latitudes above 60°N.`);
    }
    observingImpact = "minimal";
    observingAdvice = "Normal observing conditions. Watch for aurora if you're at high latitudes.";
  }
  // MINOR CONDITIONS (Kp 4 or M-class flares)
  else if (conditions === "minor") {
    if (mFlares.length > 0) {
      if (mFlares.length === 1) {
        parts.push(`Minor solar flare (${mFlares[0].classType}) detected.`);
      } else {
        parts.push(`${mFlares.length} moderate solar flares recorded this week.`);
      }
      parts.push("No significant impact expected.");
    } else if (kpIndex !== null && kpIndex >= 4) {
      parts.push(`Slightly elevated geomagnetic activity (Kp ${kpIndex}).`);
      parts.push("Possible faint aurora at polar latitudes.");
    } else {
      parts.push("Minor solar activity detected.");
      parts.push("Conditions remain favorable for observation.");
    }
    observingImpact = "none";
    observingAdvice = "Excellent conditions for all types of astronomical observation.";
  }
  // QUIET CONDITIONS
  else {
    // Check how long it's been quiet
    if (storms.length === 0 && flares.length === 0) {
      parts.push("Solar activity is very quiet.");
      parts.push("No significant events recorded in the past week.");
    } else if (storms.length === 0) {
      parts.push("The Sun is calm with no geomagnetic storms.");
      if (flares.length > 0) {
        parts.push("Some minor flare activity, but no Earth-directed effects.");
      }
    } else {
      parts.push("Space weather is currently quiet.");
      parts.push("Recent activity has subsided.");
    }
    observingImpact = "none";
    observingAdvice = "Perfect conditions for deep sky observation. No solar interference expected.";
  }

  // Add aurora-specific context for non-extreme cases
  if (conditions !== "extreme" && conditions !== "severe") {
    if (auroraLikelihood === "high") {
      parts.push("Aurora hunters should watch the northern sky tonight.");
    } else if (auroraLikelihood === "moderate") {
      parts.push("Slight chance of aurora at high latitudes.");
    }
  }

  // Add recent significant events context
  if (conditions === "quiet" || conditions === "minor") {
    if (recentStorms.length > 0 && !activeStorm) {
      const lastStorm = recentStorms[0];
      const hoursSince = Math.round((Date.now() - new Date(lastStorm.startTime).getTime()) / (1000 * 60 * 60));
      if (hoursSince < 48) {
        parts.push(`A geomagnetic storm ended about ${hoursSince} hours ago.`);
      }
    }
  }

  // Handle edge case: no data available
  if (parts.length === 0) {
    parts.push("Space weather data is currently being updated.");
    observingAdvice = "Check back shortly for the latest conditions.";
  }

  return {
    summary: parts.join(" "),
    observingImpact,
    observingAdvice
  };
}
