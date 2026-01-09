import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Cloud, 
  CloudRain, 
  CloudSnow, 
  Sun, 
  CloudSun, 
  Wind, 
  Droplets,
  Eye,
  Sunrise,
  Sunset,
  AlertCircle,
  Star,
  MapPin,
  Compass,
  Calendar
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import type { Location } from "@shared/schema";

interface WeatherData {
  current: {
    temperature: number;
    humidity: number;
    cloudCover: number;
    windSpeed: number;
    windDirection: number;
    weatherCode: number;
    precipitation: number;
  };
  estimates: {
    seeing: number;
    transparency: number;
  };
  daily: Array<{
    date: string;
    sunrise: string;
    sunset: string;
    weatherCode: number;
    precipitationProbability: number;
  }>;
  goodObservingHours: string[];
  hourly: Array<{
    time: string;
    cloudCover: number;
    temperature: number;
    visibility: number;
  }>;
}

function getWeatherIcon(code: number, className = "w-5 h-5") {
  if (code === 0) return <Sun className={cn(className, "text-chart-5")} />;
  if (code <= 3) return <CloudSun className={cn(className, "text-chart-4")} />;
  if (code >= 61 && code <= 67) return <CloudRain className={cn(className, "text-primary")} />;
  if (code >= 71 && code <= 77) return <CloudSnow className={cn(className, "text-blue-300")} />;
  return <Cloud className={cn(className, "text-muted-foreground")} />;
}

function getWeatherDescription(code: number): string {
  if (code === 0) return "Clear sky";
  if (code <= 3) return "Partly cloudy";
  if (code >= 45 && code <= 48) return "Foggy";
  if (code >= 51 && code <= 55) return "Drizzle";
  if (code >= 61 && code <= 65) return "Rain";
  if (code >= 71 && code <= 77) return "Snow";
  if (code >= 80 && code <= 82) return "Showers";
  if (code >= 95) return "Thunderstorm";
  return "Cloudy";
}

function getWindDirection(degrees: number): string {
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const index = Math.round(degrees / 45) % 8;
  return directions[index];
}

function QualityIndicator({ value, max = 5, label }: { value: number; max?: number; label: string }) {
  const percentage = (value / max) * 100;
  
  let colorClass = "bg-destructive";
  if (percentage >= 80) colorClass = "bg-chart-2";
  else if (percentage >= 60) colorClass = "bg-chart-4";
  else if (percentage >= 40) colorClass = "bg-chart-5";
  
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono">{value}/{max}</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div 
          className={cn("h-full rounded-full transition-all", colorClass)}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function parseTimeString(timeStr: string): Date {
  if (timeStr.includes('T') && !timeStr.includes('Z') && !timeStr.includes('+')) {
    return new Date(timeStr + ':00');
  }
  return parseISO(timeStr);
}

function getCloudColor(cloudCover: number): string {
  if (cloudCover > 70) return "bg-destructive";
  if (cloudCover > 40) return "bg-chart-5";
  if (cloudCover > 20) return "bg-chart-4";
  return "bg-chart-2";
}

function CloudCoverChart({ hourly }: { hourly: WeatherData["hourly"] }) {
  const next12Hours = hourly.slice(0, 12);
  
  if (!next12Hours || next12Hours.length === 0) {
    return (
      <div className="space-y-2">
        <div className="text-sm font-medium">12-Hour Cloud Forecast</div>
        <div className="text-xs text-muted-foreground">No hourly data available</div>
      </div>
    );
  }
  
  return (
    <div className="space-y-3">
      <div className="text-sm font-medium">12-Hour Cloud Forecast</div>
      <div className="relative">
        <div className="flex gap-0.5">
          {next12Hours.map((hour, i) => {
            const cloudCover = hour.cloudCover ?? 0;
            const hourTime = parseTimeString(hour.time);
            const bgColor = getCloudColor(cloudCover);
            
            return (
              <div 
                key={i}
                className="flex-1 flex flex-col items-center"
                data-testid={`cloud-bar-${i}`}
              >
                <div className="text-[9px] text-muted-foreground mb-1 font-mono">
                  {cloudCover > 0 ? `${cloudCover}%` : "0"}
                </div>
                <div className="w-full h-12 bg-muted/30 rounded-sm flex items-end overflow-hidden">
                  <div 
                    className={cn("w-full transition-all rounded-t-sm", bgColor)}
                    style={{ height: `${Math.max(8, cloudCover)}%` }}
                    title={`${format(hourTime, "HH:mm")}: ${cloudCover}% cloud cover`}
                  />
                </div>
                <div className="text-[10px] text-muted-foreground mt-1">
                  {format(hourTime, "HH")}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-sm bg-chart-2" />
          <span>Clear</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-sm bg-chart-4" />
          <span>Few</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-sm bg-chart-5" />
          <span>Cloudy</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-sm bg-destructive" />
          <span>Overcast</span>
        </div>
      </div>
    </div>
  );
}

function ThreeDayForecast({ daily }: { daily: WeatherData["daily"] }) {
  if (!daily || daily.length < 2) return null;
  
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium flex items-center gap-2">
        <Calendar className="w-4 h-4" />
        3-Day Forecast
      </div>
      <div className="grid grid-cols-3 gap-2">
        {daily.slice(0, 3).map((day, i) => {
          const date = parseISO(day.date);
          const dayName = i === 0 ? "Today" : format(date, "EEE");
          
          return (
            <div 
              key={i}
              className="flex flex-col items-center p-2 rounded-md bg-muted/30"
            >
              <span className="text-xs text-muted-foreground">{dayName}</span>
              {getWeatherIcon(day.weatherCode, "w-5 h-5 my-1")}
              <div className="flex items-center gap-1 text-xs">
                <CloudRain className="w-3 h-3 text-muted-foreground" />
                <span className="font-mono">{day.precipitationProbability}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface WeatherCardProps {
  locations?: Location[];
  latitude?: number | null;
  longitude?: number | null;
  locationName?: string;
}

export function WeatherCard({ locations = [], latitude, longitude, locationName }: WeatherCardProps) {
  const [selectedLocationId, setSelectedLocationId] = useState<number | undefined>(
    locations.find(l => l.isFavorite)?.id || locations[0]?.id
  );
  
  const selectedLocation = locations.find(l => l.id === selectedLocationId);
  const effectiveLatitude = selectedLocation?.latitude ?? latitude;
  const effectiveLongitude = selectedLocation?.longitude ?? longitude;
  const effectiveLocationName = selectedLocation?.name ?? locationName;
  const effectiveBortle = selectedLocation?.bortle;

  const sortedLocations = [...locations].sort((a, b) => {
    if (a.isFavorite && !b.isFavorite) return -1;
    if (!a.isFavorite && b.isFavorite) return 1;
    return a.name.localeCompare(b.name);
  });

  const { data: weather, isLoading, error } = useQuery<WeatherData>({
    queryKey: ["/api/weather", effectiveLatitude, effectiveLongitude],
    queryFn: async () => {
      const response = await fetch(`/api/weather?latitude=${effectiveLatitude}&longitude=${effectiveLongitude}`);
      if (!response.ok) throw new Error("Failed to fetch weather");
      return response.json();
    },
    enabled: !!effectiveLatitude && !!effectiveLongitude,
    staleTime: 15 * 60 * 1000,
    refetchInterval: 30 * 60 * 1000,
  });

  if (!effectiveLatitude || !effectiveLongitude) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <AlertCircle className="w-8 h-8 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">
            {locations.length === 0 ? "Add a location to see weather data" : "Add coordinates to a location to see weather data"}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20" />
          <Skeleton className="h-16" />
        </CardContent>
      </Card>
    );
  }

  if (error || !weather) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <AlertCircle className="w-8 h-8 mx-auto text-destructive/50 mb-2" />
          <p className="text-sm text-muted-foreground">
            Unable to load weather data
          </p>
        </CardContent>
      </Card>
    );
  }

  const today = weather.daily[0];
  const isGoodForObserving = weather.estimates.seeing >= 3 && 
                             weather.estimates.transparency >= 3 && 
                             weather.current.cloudCover < 50;
  
  const currentVisibility = weather.hourly[0]?.visibility;
  const visibilityKm = currentVisibility ? Math.round(currentVisibility / 1000) : null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Cloud className="w-5 h-5" />
          Weather Conditions
        </CardTitle>
        {locations.length > 1 && (
          <Select 
            value={selectedLocationId?.toString()} 
            onValueChange={(v) => setSelectedLocationId(parseInt(v))}
          >
            <SelectTrigger className="h-10 w-full text-sm mt-2" data-testid="select-weather-location">
              <div className="flex items-center gap-2 truncate">
                <MapPin className="w-4 h-4 shrink-0" />
                {selectedLocation?.isFavorite && <Star className="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" />}
                <span className="truncate">{effectiveLocationName}</span>
                {effectiveBortle && <span className="text-muted-foreground shrink-0">(Bortle {effectiveBortle})</span>}
              </div>
            </SelectTrigger>
            <SelectContent>
              {sortedLocations.map((loc) => (
                <SelectItem key={loc.id} value={loc.id.toString()}>
                  <div className="flex items-center gap-2">
                    {loc.isFavorite && <Star className="w-3 h-3 text-amber-500 fill-amber-500" />}
                    <span>{loc.name}</span>
                    <span className="text-muted-foreground text-xs">(Bortle {loc.bortle})</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <CardDescription className="mt-1">
          Updated {format(new Date(), "HH:mm")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {getWeatherIcon(weather.current.weatherCode, "w-8 h-8")}
            <div>
              <div className="font-mono text-2xl">
                {Math.round(weather.current.temperature)}°C
              </div>
              <div className="text-sm text-muted-foreground">
                {getWeatherDescription(weather.current.weatherCode)}
              </div>
            </div>
          </div>
          <Badge 
            variant="outline"
            className={cn(
              isGoodForObserving 
                ? "border-chart-2 text-chart-2" 
                : "border-chart-5 text-chart-5"
            )}
          >
            {isGoodForObserving ? "Good for observing" : "Not ideal"}
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm py-2 border-y">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Cloud className="w-4 h-4" />
              <span>Cloud</span>
            </div>
            <span className="font-mono">{weather.current.cloudCover}%</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Droplets className="w-4 h-4" />
              <span>Humidity</span>
            </div>
            <span className="font-mono">{weather.current.humidity}%</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Wind className="w-4 h-4" />
              <span>Wind</span>
            </div>
            <span className="font-mono">{Math.round(weather.current.windSpeed)} km/h {getWindDirection(weather.current.windDirection)}</span>
          </div>
          {visibilityKm !== null && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Eye className="w-4 h-4" />
                <span>Visibility</span>
              </div>
              <span className="font-mono">{visibilityKm} km</span>
            </div>
          )}
          {weather.current.precipitation > 0 && (
            <div className="flex items-center justify-between col-span-2">
              <div className="flex items-center gap-2 text-muted-foreground">
                <CloudRain className="w-4 h-4" />
                <span>Precipitation</span>
              </div>
              <span className="font-mono">{weather.current.precipitation} mm</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <QualityIndicator 
            value={weather.estimates.seeing} 
            label="Seeing" 
          />
          <QualityIndicator 
            value={weather.estimates.transparency} 
            label="Transparency" 
          />
        </div>

        <CloudCoverChart hourly={weather.hourly} />

        <ThreeDayForecast daily={weather.daily} />

        {today && (
          <div className="flex items-center justify-between text-sm pt-2 border-t">
            <div className="flex items-center gap-2">
              <Sunrise className="w-4 h-4 text-chart-5" />
              <span>{format(parseISO(today.sunrise), "HH:mm")}</span>
            </div>
            <div className="flex items-center gap-2">
              <Sunset className="w-4 h-4 text-chart-5" />
              <span>{format(parseISO(today.sunset), "HH:mm")}</span>
            </div>
          </div>
        )}

        {weather.goodObservingHours.length > 0 && (
          <div className="p-3 rounded-md bg-chart-2/10 border border-chart-2/30">
            <div className="text-sm font-medium text-chart-2 mb-1">
              Good Observing Windows
            </div>
            <div className="text-xs text-muted-foreground">
              Clear skies expected: {weather.goodObservingHours.slice(0, 4).map(h => 
                format(parseTimeString(h), "HH:mm")
              ).join(", ")}
              {weather.goodObservingHours.length > 4 && ` +${weather.goodObservingHours.length - 4} more hours`}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
