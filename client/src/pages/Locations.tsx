import { useState, useCallback, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useAuth } from "@/hooks/useAuth";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Plus, MapPin, Trash2, Search, Crosshair, Map, Loader2, ExternalLink, Edit2, Star, Calendar, Moon, Sun, Sparkles, Eye, CloudMoon, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Location } from "@shared/schema";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const locationSchema = z.object({
  name: z.string().min(1, "Name is required"),
  bortle: z.number().min(1).max(9),
  latitude: z.coerce.number().min(-90).max(90).optional().nullable(),
  longitude: z.coerce.number().min(-180).max(180).optional().nullable(),
  notes: z.string().optional().nullable(),
});

const bortleDescriptions: Record<number, { label: string; description: string; color: string }> = {
  1: { label: "Excellent Dark", description: "Zodiacal light, gegenschein visible", color: "bg-chart-3" },
  2: { label: "Typical Dark", description: "Airglow visible, M33 easy", color: "bg-chart-3/80" },
  3: { label: "Rural", description: "Some light pollution on horizon", color: "bg-emerald-500" },
  4: { label: "Rural/Suburban", description: "Light domes visible", color: "bg-chart-4" },
  5: { label: "Suburban", description: "Milky Way faint overhead", color: "bg-chart-4/80" },
  6: { label: "Bright Suburban", description: "Milky Way invisible", color: "bg-chart-5" },
  7: { label: "Suburban/Urban", description: "M31 barely visible", color: "bg-chart-5/80" },
  8: { label: "City Sky", description: "M44, M31 invisible to naked eye", color: "bg-destructive" },
  9: { label: "Inner City", description: "Only Moon, planets, bright stars", color: "bg-destructive/80" },
};

interface GeocodingResult {
  display_name: string;
  lat: string;
  lon: string;
  place_id: number;
  address?: {
    house_number?: string;
    road?: string;
    neighbourhood?: string;
    suburb?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    county?: string;
    state?: string;
    country?: string;
    postcode?: string;
  };
  type?: string;
  class?: string;
}

const COUNTRY_CODES: Record<string, string> = {
  "greece": "gr", "ελλάδα": "gr", "hellas": "gr",
  "usa": "us", "united states": "us", "america": "us",
  "uk": "gb", "united kingdom": "gb", "england": "gb", "britain": "gb",
  "germany": "de", "deutschland": "de",
  "france": "fr",
  "italy": "it", "italia": "it",
  "spain": "es", "españa": "es",
  "netherlands": "nl", "holland": "nl",
  "belgium": "be",
  "austria": "at",
  "switzerland": "ch",
  "portugal": "pt",
  "poland": "pl",
  "sweden": "se",
  "norway": "no",
  "denmark": "dk",
  "finland": "fi",
  "ireland": "ie",
  "canada": "ca",
  "australia": "au",
  "japan": "jp",
  "china": "cn",
  "india": "in",
  "brazil": "br",
  "mexico": "mx",
  "cyprus": "cy",
  "turkey": "tr",
};

function parseAddressQuery(query: string): { 
  street?: string; 
  housenumber?: string;
  city?: string; 
  postalcode?: string; 
  country?: string;
  countrycode?: string;
} {
  const parts = query.split(",").map(p => p.trim());
  const result: { street?: string; housenumber?: string; city?: string; postalcode?: string; country?: string; countrycode?: string } = {};
  
  if (parts.length >= 2) {
    const streetPart = parts[0];
    const houseMatch = streetPart.match(/^(.+?)\s+(\d+[a-zA-Z]?)$/);
    if (houseMatch) {
      result.street = houseMatch[1];
      result.housenumber = houseMatch[2];
    } else {
      const houseFirstMatch = streetPart.match(/^(\d+[a-zA-Z]?)\s+(.+)$/);
      if (houseFirstMatch) {
        result.housenumber = houseFirstMatch[1];
        result.street = houseFirstMatch[2];
      } else {
        result.street = streetPart;
      }
    }
    
    if (parts.length >= 3) {
      const cityPostal = parts[1];
      const postalMatch = cityPostal.match(/^(\d{4,6})\s*(.*)$/);
      if (postalMatch) {
        result.postalcode = postalMatch[1];
        result.city = postalMatch[2] || undefined;
      } else {
        result.city = cityPostal;
      }
      result.country = parts[parts.length - 1];
    } else {
      result.city = parts[1];
    }
  }
  
  if (result.country) {
    const countryLower = result.country.toLowerCase();
    result.countrycode = COUNTRY_CODES[countryLower];
  }
  
  return result;
}

function getLocationName(result: GeocodingResult): string {
  if (result.address) {
    const addr = result.address;
    const city = addr.city || addr.town || addr.village || addr.municipality || addr.county;
    const country = addr.country;
    
    if (city && country) {
      return `${city}, ${country}`;
    }
    if (country) {
      return country;
    }
    if (city) {
      return city;
    }
  }
  const parts = result.display_name.split(",");
  if (parts.length >= 2) {
    return `${parts[0].trim()}, ${parts[parts.length - 1].trim()}`;
  }
  return parts[0]?.trim() || result.display_name;
}

function getLocationContext(result: GeocodingResult): string | null {
  if (result.address) {
    const addr = result.address;
    const parts: string[] = [];
    
    if (addr.road) {
      if (addr.house_number) {
        parts.push(`${addr.road} ${addr.house_number}`);
      } else {
        parts.push(addr.road);
      }
    }
    if (addr.suburb || addr.neighbourhood) {
      parts.push(addr.suburb || addr.neighbourhood || '');
    }
    if (addr.state || addr.county) {
      const region = addr.state || addr.county;
      if (region && !parts.includes(region)) {
        parts.push(region);
      }
    }
    
    if (parts.length > 0) {
      return parts.filter(Boolean).slice(0, 2).join(', ');
    }
  }
  return null;
}

function AddressSearch({ onSelect }: { onSelect: (lat: number, lon: number, name: string) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodingResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const { toast } = useToast();

  const searchAddress = useCallback(async () => {
    if (!query.trim()) return;
    
    setIsSearching(true);
    try {
      const parsed = parseAddressQuery(query);
      let data: GeocodingResult[] = [];
      
      if (parsed.street) {
        const params = new URLSearchParams({
          format: "json",
          addressdetails: "1",
          limit: "10",
          layer: "address",
        });
        
        if (parsed.housenumber) {
          params.append("street", `${parsed.housenumber} ${parsed.street}`);
        } else {
          params.append("street", parsed.street);
        }
        if (parsed.city) params.append("city", parsed.city);
        if (parsed.postalcode) params.append("postalcode", parsed.postalcode);
        if (parsed.countrycode) {
          params.append("countrycodes", parsed.countrycode);
        } else if (parsed.country) {
          params.append("country", parsed.country);
        }
        
        const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
        const response = await fetch(url, {
          headers: {
            "Accept": "application/json",
            "User-Agent": "AstroPilot/1.0",
          },
        });
        
        if (response.ok) {
          data = await response.json();
        }
        
        if (data.length === 0) {
          const fallbackParams = new URLSearchParams({
            format: "json",
            q: query,
            addressdetails: "1",
            limit: "10",
          });
          if (parsed.countrycode) {
            fallbackParams.append("countrycodes", parsed.countrycode);
          }
          
          const fallbackUrl = `https://nominatim.openstreetmap.org/search?${fallbackParams.toString()}`;
          const fallbackResponse = await fetch(fallbackUrl, {
            headers: {
              "Accept": "application/json",
              "User-Agent": "AstroPilot/1.0",
            },
          });
          
          if (fallbackResponse.ok) {
            data = await fallbackResponse.json();
          }
        }
      } else {
        const params = new URLSearchParams({
          format: "json",
          q: query,
          addressdetails: "1",
          limit: "10",
        });
        
        const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
        const response = await fetch(url, {
          headers: {
            "Accept": "application/json",
            "User-Agent": "AstroPilot/1.0",
          },
        });
        
        if (response.ok) {
          data = await response.json();
        }
      }
      
      const sorted = data.sort((a, b) => {
        const aHasHouseNum = a.address?.house_number != null;
        const bHasHouseNum = b.address?.house_number != null;
        if (aHasHouseNum && !bHasHouseNum) return -1;
        if (!aHasHouseNum && bHasHouseNum) return 1;
        
        const aIsAddress = a.class === "place" || a.class === "building" || a.type === "house";
        const bIsAddress = b.class === "place" || b.class === "building" || b.type === "house";
        if (aIsAddress && !bIsAddress) return -1;
        if (!aIsAddress && bIsAddress) return 1;
        return 0;
      });
      
      setResults(sorted);
      
      if (sorted.length === 0) {
        toast({ 
          title: "No results found", 
          description: "The exact address may not be in OpenStreetMap. Try just the street and city." 
        });
      }
    } catch (error) {
      toast({ title: "Search failed", description: "Could not search for address", variant: "destructive" });
    } finally {
      setIsSearching(false);
    }
  }, [query, toast]);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          placeholder="Street 123, 12345 City, Country"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), searchAddress())}
          data-testid="input-address-search"
        />
        <Button 
          type="button" 
          variant="secondary" 
          onClick={searchAddress} 
          disabled={isSearching || !query.trim()}
          data-testid="button-search-address"
        >
          {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Tip: For best results, use format: Street, Postal City, Country
      </p>
      
      {results.length > 0 && (
        <div className="border rounded-md max-h-48 overflow-y-auto">
          {results.map((result) => (
            <button
              key={result.place_id}
              type="button"
              className="w-full text-left px-3 py-2 hover:bg-muted text-sm border-b last:border-b-0 hover-elevate"
              onClick={() => {
                onSelect(parseFloat(result.lat), parseFloat(result.lon), getLocationName(result));
                setResults([]);
                setQuery("");
              }}
              data-testid={`result-address-${result.place_id}`}
            >
              <div className="flex items-start gap-2">
                <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <div className="font-medium">{getLocationName(result)}</div>
                  {getLocationContext(result) && (
                    <div className="text-xs text-muted-foreground truncate">{getLocationContext(result)}</div>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MapClickHandler({ onSelect }: { onSelect: (lat: number, lon: number) => void }) {
  useMapEvents({
    click: (e) => {
      // Stop propagation to prevent dialog from closing
      e.originalEvent.stopPropagation();
      e.originalEvent.preventDefault();
      onSelect(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function MapUpdater({ latitude, longitude }: { latitude: number | null | undefined; longitude: number | null | undefined }) {
  const map = useMap();
  
  useEffect(() => {
    if (latitude != null && longitude != null) {
      map.flyTo([latitude, longitude], 15, { duration: 0.5 });
    }
  }, [latitude, longitude, map]);
  
  return null;
}

function DraggableMarker({ 
  latitude, 
  longitude, 
  onDragEnd 
}: { 
  latitude: number; 
  longitude: number; 
  onDragEnd: (lat: number, lon: number) => void;
}) {
  const markerRef = useCallback((node: L.Marker | null) => {
    if (node) {
      node.on("dragend", () => {
        const latlng = node.getLatLng();
        onDragEnd(latlng.lat, latlng.lng);
      });
    }
  }, [onDragEnd]);

  return (
    <Marker 
      position={[latitude, longitude]} 
      draggable={true}
      ref={markerRef}
    />
  );
}

function MapPicker({ 
  latitude, 
  longitude, 
  onSelect 
}: { 
  latitude: number | null | undefined;
  longitude: number | null | undefined;
  onSelect: (lat: number, lon: number) => void;
}) {
  const [isLocating, setIsLocating] = useState(false);
  const { toast } = useToast();

  const getCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      toast({ title: "Geolocation not supported", variant: "destructive" });
      return;
    }
    
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        onSelect(position.coords.latitude, position.coords.longitude);
        setIsLocating(false);
        toast({ title: "Location detected", description: "Coordinates have been filled in. You can drag the pin to adjust." });
      },
      (error) => {
        setIsLocating(false);
        let message = "Could not get your location";
        if (error.code === error.PERMISSION_DENIED) {
          message = "Location permission denied. Please allow location access in your browser.";
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          message = "Location unavailable";
        } else if (error.code === error.TIMEOUT) {
          message = "Location request timed out";
        }
        toast({ title: message, variant: "destructive" });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, [onSelect, toast]);

  const hasCoordinates = latitude != null && longitude != null;
  
  const defaultCenter: [number, number] = useMemo(() => {
    if (hasCoordinates) {
      return [latitude!, longitude!];
    }
    return [38.0, 23.7];
  }, [hasCoordinates, latitude, longitude]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-sm font-medium">Click map or drag pin to set location</span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={getCurrentLocation}
            disabled={isLocating}
            data-testid="button-use-current-location"
          >
            {isLocating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
            ) : (
              <Crosshair className="w-3.5 h-3.5 mr-1.5" />
            )}
            Use My Location
          </Button>
          {hasCoordinates && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              asChild
            >
              <a
                href={`https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=14/${latitude}/${longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="link-open-map"
              >
                <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                Open Map
              </a>
            </Button>
          )}
        </div>
      </div>
      
      <div 
        className="relative rounded-md overflow-hidden border bg-muted h-56 [&_.leaflet-control-attribution]:pointer-events-none [&_.leaflet-control-attribution_a]:pointer-events-none" 
        data-testid="map-container"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <MapContainer
          center={defaultCenter}
          zoom={hasCoordinates ? 15 : 4}
          className="w-full h-full z-0"
          style={{ height: "100%", width: "100%" }}
          attributionControl={false}
        >
          <TileLayer
            attribution=""
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapClickHandler onSelect={onSelect} />
          <MapUpdater latitude={latitude} longitude={longitude} />
          {hasCoordinates && (
            <DraggableMarker
              latitude={latitude!}
              longitude={longitude!}
              onDragEnd={onSelect}
            />
          )}
        </MapContainer>
        {!hasCoordinates && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60 pointer-events-none z-10">
            <p className="text-sm text-muted-foreground bg-background/80 px-3 py-1.5 rounded-md">
              Click anywhere on the map to place a pin
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function AddLocationDialog({ open, onOpenChange, editingLocation }: { open: boolean; onOpenChange: (open: boolean) => void; editingLocation?: Location }) {
  const { toast } = useToast();
  const [coordsTab, setCoordsTab] = useState<string>("search");
  
  const form = useForm<z.infer<typeof locationSchema>>({
    resolver: zodResolver(locationSchema),
    defaultValues: { name: "", bortle: 5, latitude: null, longitude: null, notes: "" },
  });

  useEffect(() => {
    if (open && editingLocation) {
      form.reset({
        name: editingLocation.name,
        bortle: editingLocation.bortle,
        latitude: editingLocation.latitude,
        longitude: editingLocation.longitude,
        notes: editingLocation.notes || "",
      });
    } else if (open && !editingLocation) {
      form.reset({ name: "", bortle: 5, latitude: null, longitude: null, notes: "" });
    }
  }, [open, editingLocation, form]);

  const bortleValue = form.watch("bortle");
  const latitude = form.watch("latitude");
  const longitude = form.watch("longitude");

  const mutation = useMutation({
    mutationFn: async (data: z.infer<typeof locationSchema>) => {
      if (editingLocation) {
        await apiRequest("PATCH", `/api/locations/${editingLocation.id}`, data);
      } else {
        await apiRequest("POST", "/api/locations", data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      toast({ title: editingLocation ? "Location updated successfully" : "Location added successfully" });
      onOpenChange(false);
      form.reset();
    },
    onError: () => {
      toast({ title: editingLocation ? "Failed to update location" : "Failed to add location", variant: "destructive" });
    },
  });

  const handleAddressSelect = (lat: number, lon: number, name: string) => {
    form.setValue("latitude", lat);
    form.setValue("longitude", lon);
    if (!form.getValues("name")) {
      form.setValue("name", name);
    }
  };

  const handleMapSelect = (lat: number, lon: number) => {
    form.setValue("latitude", lat);
    form.setValue("longitude", lon);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="max-w-lg max-h-[90vh] overflow-y-auto"
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{editingLocation ? "Edit Location" : "Add Observing Location"}</DialogTitle>
          <DialogDescription>{editingLocation ? "Update location details" : "Add a new observing site with its light pollution rating."}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Location Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Backyard, Dark Sky Park" {...field} data-testid="input-location-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="bortle"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel>Bortle Scale</FormLabel>
                    {latitude != null && longitude != null && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs"
                        asChild
                      >
                        <a
                          href={`https://lightpollutionmap.app/?lat=${latitude}&lng=${longitude}&zoom=10`}
                          target="_blank"
                          rel="noopener noreferrer"
                          data-testid="link-lookup-bortle"
                        >
                          <ExternalLink className="w-3 h-3 mr-1" />
                          Look up Bortle
                        </a>
                      </Button>
                    )}
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-2xl font-bold">{field.value}</span>
                      <Badge className={cn("font-medium", bortleDescriptions[field.value].color)}>
                        {bortleDescriptions[field.value].label}
                      </Badge>
                    </div>
                    <FormControl>
                      <Slider
                        min={1}
                        max={9}
                        step={1}
                        value={[field.value]}
                        onValueChange={(v) => field.onChange(v[0])}
                        className="py-2"
                        data-testid="slider-bortle"
                      />
                    </FormControl>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>1 (Darkest)</span>
                      <span>9 (Brightest)</span>
                    </div>
                    <FormDescription className="text-xs">
                      {bortleDescriptions[field.value].description}
                    </FormDescription>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-4">
              <FormLabel>Coordinates</FormLabel>
              <Tabs value={coordsTab} onValueChange={setCoordsTab}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="search" data-testid="tab-search-address">
                    <Search className="w-3.5 h-3.5 mr-1.5" />
                    Search Address
                  </TabsTrigger>
                  <TabsTrigger value="manual" data-testid="tab-manual-coords">
                    <Map className="w-3.5 h-3.5 mr-1.5" />
                    Enter Manually
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="search" className="space-y-4 mt-4">
                  <AddressSearch onSelect={handleAddressSelect} />
                  <MapPicker 
                    latitude={latitude} 
                    longitude={longitude} 
                    onSelect={handleMapSelect}
                  />
                </TabsContent>
                
                <TabsContent value="manual" className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="latitude"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Latitude</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              step="0.0001" 
                              placeholder="e.g., 40.7128" 
                              value={field.value ?? ""} 
                              onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                              data-testid="input-location-latitude" 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="longitude"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Longitude</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              step="0.0001" 
                              placeholder="e.g., -74.0060" 
                              value={field.value ?? ""} 
                              onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                              data-testid="input-location-longitude" 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <MapPicker 
                    latitude={latitude} 
                    longitude={longitude} 
                    onSelect={handleMapSelect}
                  />
                </TabsContent>
              </Tabs>
              
              {latitude != null && longitude != null && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted px-3 py-2 rounded-md">
                  <MapPin className="w-3.5 h-3.5" />
                  <span className="font-mono">{latitude.toFixed(4)}, {longitude.toFixed(4)}</span>
                </div>
              )}
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (optional)</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Any notes about this location..." 
                      className="resize-none" 
                      rows={3} 
                      value={field.value ?? ""} 
                      onChange={field.onChange}
                      data-testid="input-location-notes" 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-save-location">
                {mutation.isPending ? (editingLocation ? "Updating..." : "Adding...") : (editingLocation ? "Update Location" : "Add Location")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// Seasonal astronomy data - optimal viewing periods by hemisphere
const SEASONAL_OBJECTS = {
  winter: {
    name: "Winter",
    months: [12, 1, 2],
    northernHemisphere: {
      highlights: ["Orion Nebula (M42)", "Pleiades (M45)", "Crab Nebula (M1)", "Beehive Cluster (M44)"],
      constellations: ["Orion", "Taurus", "Gemini", "Auriga"],
      description: "Best for Orion complex and winter clusters"
    },
    southernHemisphere: {
      highlights: ["Omega Centauri", "Carina Nebula", "Large Magellanic Cloud", "47 Tucanae"],
      constellations: ["Carina", "Centaurus", "Crux", "Tucana"],
      description: "Prime season for southern deep sky objects"
    }
  },
  spring: {
    name: "Spring",
    months: [3, 4, 5],
    northernHemisphere: {
      highlights: ["Virgo Galaxy Cluster", "Leo Triplet", "M81/M82", "Whirlpool Galaxy (M51)"],
      constellations: ["Virgo", "Leo", "Ursa Major", "Canes Venatici"],
      description: "Galaxy season - ideal for DSO imaging"
    },
    southernHemisphere: {
      highlights: ["Eta Carinae", "Jewel Box Cluster", "Centaurus A", "Southern Cross"],
      constellations: ["Centaurus", "Crux", "Carina", "Vela"],
      description: "Rich Milky Way regions visible"
    }
  },
  summer: {
    name: "Summer",
    months: [6, 7, 8],
    northernHemisphere: {
      highlights: ["Ring Nebula (M57)", "Dumbbell Nebula (M27)", "Hercules Cluster (M13)", "Swan Nebula (M17)"],
      constellations: ["Lyra", "Cygnus", "Sagittarius", "Scorpius"],
      description: "Milky Way core season - best for nebulae"
    },
    southernHemisphere: {
      highlights: ["Tarantula Nebula", "Sculptor Galaxy", "Phoenix Cluster"],
      constellations: ["Sagittarius", "Scorpius", "Sculptor", "Grus"],
      description: "Galactic center at zenith for southern observers"
    }
  },
  autumn: {
    name: "Autumn",
    months: [9, 10, 11],
    northernHemisphere: {
      highlights: ["Andromeda Galaxy (M31)", "Triangulum Galaxy (M33)", "Double Cluster", "Pacman Nebula"],
      constellations: ["Andromeda", "Pegasus", "Perseus", "Cassiopeia"],
      description: "Best for Local Group galaxies"
    },
    southernHemisphere: {
      highlights: ["Small Magellanic Cloud", "Sculptor Dwarf Galaxy", "NGC 253"],
      constellations: ["Sculptor", "Fornax", "Phoenix", "Eridanus"],
      description: "Southern galaxy groups visible"
    }
  }
};

// Meteor showers with peak dates
const METEOR_SHOWERS = [
  { name: "Quadrantids", peak: "Jan 3-4", zhr: 120, moon: "varies" },
  { name: "Lyrids", peak: "Apr 21-22", zhr: 20, moon: "varies" },
  { name: "Eta Aquariids", peak: "May 5-6", zhr: 50, moon: "varies" },
  { name: "Perseids", peak: "Aug 12-13", zhr: 100, moon: "varies" },
  { name: "Orionids", peak: "Oct 21-22", zhr: 20, moon: "varies" },
  { name: "Leonids", peak: "Nov 17-18", zhr: 15, moon: "varies" },
  { name: "Geminids", peak: "Dec 13-14", zhr: 150, moon: "varies" },
];

// Get current season based on latitude
function getCurrentSeason(latitude: number | null | undefined): 'winter' | 'spring' | 'summer' | 'autumn' {
  const month = new Date().getMonth() + 1;
  const isNorthern = (latitude ?? 45) >= 0;
  
  if ([12, 1, 2].includes(month)) return isNorthern ? 'winter' : 'summer';
  if ([3, 4, 5].includes(month)) return isNorthern ? 'spring' : 'autumn';
  if ([6, 7, 8].includes(month)) return isNorthern ? 'summer' : 'winter';
  return isNorthern ? 'autumn' : 'spring';
}

// Get hemisphere-specific data
function getSeasonalData(season: keyof typeof SEASONAL_OBJECTS, latitude: number | null | undefined) {
  const isNorthern = (latitude ?? 45) >= 0;
  const data = SEASONAL_OBJECTS[season];
  return isNorthern ? data.northernHemisphere : data.southernHemisphere;
}

// Seasonal Calendar Dialog
function SeasonalCalendarDialog({ 
  open, 
  onOpenChange, 
  location 
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void; 
  location: Location;
}) {
  const [selectedSeason, setSelectedSeason] = useState<'winter' | 'spring' | 'summer' | 'autumn'>(
    getCurrentSeason(location.latitude)
  );
  
  const isNorthern = (location.latitude ?? 45) >= 0;
  const seasonData = SEASONAL_OBJECTS[selectedSeason];
  const hemisphereData = getSeasonalData(selectedSeason, location.latitude);
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Seasonal Observing Calendar
          </DialogTitle>
          <DialogDescription>
            Optimal viewing targets for {location.name} ({isNorthern ? "Northern" : "Southern"} Hemisphere)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Season Tabs */}
          <Tabs value={selectedSeason} onValueChange={(v) => setSelectedSeason(v as any)}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="winter" data-testid="tab-winter">
                <CloudMoon className="w-4 h-4 mr-1.5" />
                Winter
              </TabsTrigger>
              <TabsTrigger value="spring" data-testid="tab-spring">
                <Sun className="w-4 h-4 mr-1.5" />
                Spring
              </TabsTrigger>
              <TabsTrigger value="summer" data-testid="tab-summer">
                <Sparkles className="w-4 h-4 mr-1.5" />
                Summer
              </TabsTrigger>
              <TabsTrigger value="autumn" data-testid="tab-autumn">
                <Moon className="w-4 h-4 mr-1.5" />
                Autumn
              </TabsTrigger>
            </TabsList>

            {(['winter', 'spring', 'summer', 'autumn'] as const).map((season) => {
              const data = getSeasonalData(season, location.latitude);
              const seasonInfo = SEASONAL_OBJECTS[season];
              const isCurrent = getCurrentSeason(location.latitude) === season;
              
              return (
                <TabsContent key={season} value={season} className="space-y-4">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-lg">{seasonInfo.name} Highlights</h3>
                    {isCurrent && (
                      <Badge variant="secondary" className="text-xs">
                        Current Season
                      </Badge>
                    )}
                  </div>
                  
                  <p className="text-sm text-muted-foreground">{data.description}</p>
                  
                  <div className="grid md:grid-cols-2 gap-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Eye className="w-4 h-4" />
                          Best Objects
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ul className="space-y-1.5">
                          {data.highlights.map((obj, i) => (
                            <li key={i} className="text-sm flex items-center gap-2">
                              <Sparkles className="w-3 h-3 text-amber-500" />
                              {obj}
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                    
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Star className="w-4 h-4" />
                          Key Constellations
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-wrap gap-2">
                          {data.constellations.map((c, i) => (
                            <Badge key={i} variant="outline" className="text-xs">
                              {c}
                            </Badge>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                  
                  {/* Dark sky recommendations based on Bortle */}
                  <Card className="bg-muted/50">
                    <CardContent className="pt-4">
                      <div className="flex items-start gap-3">
                        <MapPin className="w-4 h-4 mt-0.5 text-muted-foreground" />
                        <div className="space-y-1">
                          <p className="text-sm font-medium">Site Suitability: Bortle {location.bortle}</p>
                          <p className="text-xs text-muted-foreground">
                            {location.bortle <= 3 
                              ? "Excellent for all seasonal highlights including faint nebulae and galaxy details."
                              : location.bortle <= 5
                              ? "Good for bright Messier objects and star clusters. Consider filters for nebulae."
                              : location.bortle <= 7
                              ? "Best for planets, Moon, and brightest deep-sky objects. Use narrowband filters."
                              : "Limited to planets, Moon, and double stars. Seek darker sites for DSO."
                            }
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              );
            })}
          </Tabs>
          
          {/* Meteor Shower Calendar */}
          <div className="border-t pt-4">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              Annual Meteor Showers
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {METEOR_SHOWERS.map((shower, i) => (
                <Card key={i} className="p-3">
                  <p className="font-medium text-sm">{shower.name}</p>
                  <p className="text-xs text-muted-foreground">{shower.peak}</p>
                  <Badge variant="secondary" className="text-xs mt-1">
                    ZHR ~{shower.zhr}
                  </Badge>
                </Card>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              ZHR = Zenithal Hourly Rate (meteors/hour under ideal conditions)
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LocationCard({ location, onDelete, onEdit, onToggleFavorite, isTogglingFavorite }: { 
  location: Location; 
  onDelete: () => void; 
  onEdit: () => void;
  onToggleFavorite: () => void;
  isTogglingFavorite?: boolean;
}) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const bortle = bortleDescriptions[location.bortle];
  const hasCoordinates = location.latitude != null && location.longitude != null;
  
  return (
    <Card className="hover-elevate group" data-testid={`card-location-${location.id}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
            <CardTitle className="text-lg truncate">{location.name}</CardTitle>
            {location.isFavorite && (
              <Star className="w-4 h-4 text-amber-500 fill-amber-500 shrink-0" />
            )}
          </div>
          <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 hover:opacity-100">
            <Button
              variant="ghost"
              size="icon"
              className={cn("h-7 w-7", location.isFavorite && "text-amber-500")}
              onClick={onToggleFavorite}
              disabled={isTogglingFavorite}
              data-testid={`button-favorite-location-${location.id}`}
            >
              <Star className={cn("w-3.5 h-3.5", location.isFavorite && "fill-current")} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onEdit}
              data-testid={`button-edit-location-${location.id}`}
            >
              <Edit2 className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive"
              onClick={onDelete}
              data-testid={`button-delete-location-${location.id}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-mono text-3xl font-bold">{location.bortle}</span>
            <div>
              <Badge className={cn("font-medium", bortle.color)}>{bortle.label}</Badge>
            </div>
          </div>
        </div>
        
        <p className="text-sm text-muted-foreground">{bortle.description}</p>
        
        {hasCoordinates && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <a
                href={`https://www.openstreetmap.org/?mlat=${location.latitude}&mlon=${location.longitude}#map=14/${location.latitude}/${location.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
                data-testid={`link-map-location-${location.id}`}
              >
                <Map className="w-3 h-3" />
                {location.latitude?.toFixed(4)}, {location.longitude?.toFixed(4)}
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
              <a
                href={`https://www.lightpollutionmap.info/#zoom=10&lat=${location.latitude}&lon=${location.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                data-testid={`link-bortle-location-${location.id}`}
              >
                <Lightbulb className="w-3 h-3" />
                Look up Bortle
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
          </div>
        )}
        
        {location.notes && (
          <p className="text-sm text-muted-foreground border-t pt-3">{location.notes}</p>
        )}
        
        {/* Seasonal Viewing Section */}
        {(() => {
          const currentSeason = getCurrentSeason(location.latitude);
          const seasonData = getSeasonalData(currentSeason, location.latitude);
          const seasonName = SEASONAL_OBJECTS[currentSeason].name;
          
          return (
            <div className="border-t pt-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span className="font-medium">{seasonName} Highlights</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setCalendarOpen(true)}
                  data-testid={`button-calendar-location-${location.id}`}
                >
                  <Calendar className="w-3 h-3 mr-1" />
                  View Calendar
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{seasonData.description}</p>
              <div className="flex flex-wrap gap-1">
                {seasonData.highlights.slice(0, 2).map((obj, i) => (
                  <Badge key={i} variant="outline" className="text-xs">
                    {obj.split(' (')[0]}
                  </Badge>
                ))}
                {seasonData.highlights.length > 2 && (
                  <Badge variant="secondary" className="text-xs">
                    +{seasonData.highlights.length - 2} more
                  </Badge>
                )}
              </div>
            </div>
          );
        })()}
      </CardContent>
      
      <SeasonalCalendarDialog
        open={calendarOpen}
        onOpenChange={setCalendarOpen}
        location={location}
      />
    </Card>
  );
}

export default function Locations() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | undefined>();
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: locations, isLoading } = useQuery<Location[]>({
    queryKey: ["/api/locations"],
    enabled: !!user,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/locations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      toast({ title: "Location deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete location", variant: "destructive" });
    },
  });

  const favoriteMutation = useMutation({
    mutationFn: async ({ id, isFavorite }: { id: number; isFavorite: boolean }) => {
      await apiRequest("PATCH", `/api/locations/${id}`, { isFavorite });
    },
    onSuccess: (_, { isFavorite }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      toast({ 
        title: isFavorite ? "Location set as favorite" : "Removed from favorites",
        description: isFavorite ? "This location will be shown first in the conditions widget" : undefined
      });
    },
    onError: () => {
      toast({ title: "Failed to update favorite status", variant: "destructive" });
    },
  });

  const handleEdit = (location: Location) => {
    setEditingLocation(location);
    setDialogOpen(true);
  };

  const handleDialogChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) setEditingLocation(undefined);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Observing Locations</h1>
          <p className="text-muted-foreground">Manage your observing sites and their light pollution ratings</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} data-testid="button-add-location">
          <Plus className="w-4 h-4 mr-2" />
          Add Location
        </Button>
      </div>

      {isLoading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-56" />)}
        </div>
      ) : locations?.length ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {locations.map((location) => (
            <LocationCard
              key={location.id}
              location={location}
              onEdit={() => handleEdit(location)}
              onDelete={() => deleteMutation.mutate(location.id)}
              onToggleFavorite={() => favoriteMutation.mutate({ 
                id: location.id, 
                isFavorite: !location.isFavorite 
              })}
              isTogglingFavorite={favoriteMutation.isPending}
            />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-16 text-center">
            <MapPin className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-2">No locations added yet</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Add your observing locations to get personalized viewing recommendations based on light pollution levels.
            </p>
            <Button onClick={() => setDialogOpen(true)} data-testid="button-add-first-location">
              <Plus className="w-4 h-4 mr-2" />
              Add Your First Location
            </Button>
          </CardContent>
        </Card>
      )}

      <AddLocationDialog open={dialogOpen} onOpenChange={handleDialogChange} editingLocation={editingLocation} />
    </div>
  );
}
