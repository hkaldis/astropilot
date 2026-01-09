const WHERETHEISS_BASE_URL = "https://api.wheretheiss.at/v1";
const OPEN_NOTIFY_BASE_URL = "http://api.open-notify.org";

export interface ISSPosition {
  latitude: number;
  longitude: number;
  altitude: number;
  velocity: number;
  visibility: "daylight" | "eclipsed";
  timestamp: number;
}

export interface ISSPass {
  risetime: number;
  duration: number;
}

export interface Astronaut {
  name: string;
  craft: string;
}

export interface ISSTrackingData {
  position: ISSPosition | null;
  passes: ISSPass[];
  astronauts: Astronaut[];
  astronautCount: number;
  lastUpdated: string;
  overLocation: string | null;
}

let positionCache: { data: ISSPosition | null; fetchedAt: number } = {
  data: null,
  fetchedAt: 0,
};

let astronautsCache: { data: Astronaut[]; fetchedAt: number } = {
  data: [],
  fetchedAt: 0,
};

const POSITION_CACHE_DURATION = 10 * 1000;
const ASTRONAUTS_CACHE_DURATION = 60 * 60 * 1000;
const PASSES_CACHE_DURATION = 30 * 60 * 1000;

const passesCache: Map<string, { data: ISSPass[]; fetchedAt: number }> = new Map();

export async function getISSPosition(): Promise<ISSPosition | null> {
  const now = Date.now();
  if (positionCache.data && now - positionCache.fetchedAt < POSITION_CACHE_DURATION) {
    return positionCache.data;
  }

  try {
    const response = await fetch(
      `${WHERETHEISS_BASE_URL}/satellites/25544`
    );

    if (!response.ok) {
      console.error("ISS Position API error:", response.status, response.statusText);
      return positionCache.data;
    }

    const data = await response.json();
    
    const position: ISSPosition = {
      latitude: data.latitude,
      longitude: data.longitude,
      altitude: data.altitude,
      velocity: data.velocity,
      visibility: data.visibility === "daylight" ? "daylight" : "eclipsed",
      timestamp: data.timestamp,
    };

    positionCache = { data: position, fetchedAt: now };
    return position;
  } catch (error) {
    console.error("Error fetching ISS position:", error);
    return positionCache.data;
  }
}

export async function getAstronauts(): Promise<Astronaut[]> {
  const now = Date.now();
  if (astronautsCache.data.length > 0 && now - astronautsCache.fetchedAt < ASTRONAUTS_CACHE_DURATION) {
    return astronautsCache.data;
  }

  try {
    const response = await fetch(`${OPEN_NOTIFY_BASE_URL}/astros.json`);

    if (!response.ok) {
      console.error("Astronauts API error:", response.status, response.statusText);
      return astronautsCache.data;
    }

    const data = await response.json();
    
    if (data.message === "success" && Array.isArray(data.people)) {
      const astronauts: Astronaut[] = data.people.map((p: { name: string; craft: string }) => ({
        name: p.name,
        craft: p.craft,
      }));
      astronautsCache = { data: astronauts, fetchedAt: now };
      return astronauts;
    }

    return astronautsCache.data;
  } catch (error) {
    console.error("Error fetching astronauts:", error);
    return astronautsCache.data;
  }
}

export async function getISSPasses(latitude: number, longitude: number, passes: number = 5): Promise<ISSPass[]> {
  // Note: The Open Notify iss-pass.json API has been deprecated.
  // Pass predictions would require TLE-based calculations using astronomy libraries.
  // For now, we return an empty array and the UI handles this gracefully.
  return [];
}

function getLocationName(lat: number, lon: number): string {
  if (lat >= -90 && lat < -60) return "Antarctica";
  if (lat >= 60 && lat <= 90) return "Arctic Region";
  
  if (lon >= -180 && lon < -100) {
    if (lat >= 15 && lat < 50) return "Pacific Ocean (near N. America)";
    if (lat >= -50 && lat < 15) return "South Pacific Ocean";
    return "Pacific Ocean";
  }
  if (lon >= -100 && lon < -30) {
    if (lat >= 25 && lat < 50) return "North America";
    if (lat >= 0 && lat < 25) return "Central America / Caribbean";
    if (lat >= -60 && lat < 0) return "South America";
    return "Atlantic Ocean";
  }
  if (lon >= -30 && lon < 30) {
    if (lat >= 35 && lat < 70) return "Europe";
    if (lat >= 0 && lat < 35) return "Africa";
    if (lat >= -35 && lat < 0) return "South Atlantic";
    return "Atlantic Ocean";
  }
  if (lon >= 30 && lon < 60) {
    if (lat >= 35 && lat < 70) return "Eastern Europe / Russia";
    if (lat >= 0 && lat < 35) return "Middle East";
    if (lat >= -35 && lat < 0) return "East Africa / Indian Ocean";
    return "Indian Ocean";
  }
  if (lon >= 60 && lon < 100) {
    if (lat >= 25 && lat < 70) return "Central Asia";
    if (lat >= 0 && lat < 25) return "South Asia";
    if (lat >= -50 && lat < 0) return "Indian Ocean";
    return "Indian Ocean";
  }
  if (lon >= 100 && lon < 140) {
    if (lat >= 20 && lat < 50) return "East Asia";
    if (lat >= -10 && lat < 20) return "Southeast Asia";
    if (lat >= -50 && lat < -10) return "Australia";
    return "Pacific Ocean";
  }
  if (lon >= 140 && lon <= 180) {
    if (lat >= 30 && lat < 50) return "Japan / North Pacific";
    if (lat >= -50 && lat < 30) return "Pacific Ocean";
    return "Pacific Ocean";
  }
  
  return "Over the Ocean";
}

export async function getISSTrackingData(latitude?: number, longitude?: number): Promise<ISSTrackingData> {
  try {
    const [position, astronauts] = await Promise.all([
      getISSPosition(),
      getAstronauts(),
    ]);

    let passes: ISSPass[] = [];
    if (latitude !== undefined && longitude !== undefined) {
      passes = await getISSPasses(latitude, longitude);
    }

    const issAstronauts = astronauts.filter(a => a.craft === "ISS");

    return {
      position,
      passes,
      astronauts: issAstronauts,
      astronautCount: issAstronauts.length,
      lastUpdated: new Date().toISOString(),
      overLocation: position ? getLocationName(position.latitude, position.longitude) : null,
    };
  } catch (error) {
    console.error("Error fetching ISS tracking data:", error);
    return {
      position: null,
      passes: [],
      astronauts: [],
      astronautCount: 0,
      lastUpdated: new Date().toISOString(),
      overLocation: null,
    };
  }
}
