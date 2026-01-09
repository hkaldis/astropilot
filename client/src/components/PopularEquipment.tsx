import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Copy, Camera, Smartphone } from "lucide-react";
import { useState } from "react";

// Popular equipment data
export const popularTelescopes = [
  { name: "Celestron 130 SLT", aperture: 130, focalLength: 650, type: "Reflector" },
  { name: "Sky-Watcher 10\" Dobsonian", aperture: 254, focalLength: 1200, type: "Reflector" },
  { name: "Celestron 8\" SchmidtCassegrain", aperture: 203, focalLength: 2032, type: "Catadioptric" },
  { name: "Sky-Watcher 120mm ED Refractor", aperture: 120, focalLength: 840, type: "Refractor" },
  { name: "Orion 8\" Dob", aperture: 203, focalLength: 1200, type: "Reflector" },
];

export const popularEyepieces = [
  { name: "Celestron 25mm Orthoscopic", focalLength: 25, apparentFov: 49 },
  { name: "Baader 8mm Hyperion", focalLength: 8, apparentFov: 68 },
  { name: "Sky-Watcher 20mm Wide Angle", focalLength: 20, apparentFov: 68 },
  { name: "Explore Scientific 68° 24mm", focalLength: 24, apparentFov: 68 },
  { name: "Meade 32mm Series 4000", focalLength: 32, apparentFov: 52 },
  { name: "Televue Delos 7mm", focalLength: 7, apparentFov: 72 },
];

export const popularBarlows = [
  { name: "Celestron 1.5x Barlow", factor: 1.5 },
  { name: "Meade 2x Barlow", factor: 2 },
  { name: "Orion 2x Shorty Barlow", factor: 2 },
];

export const popularFilters = [
  { name: "Orion UHC Filter 1.25\"", type: "uhc" },
  { name: "Celestron OIII Filter", type: "oiii" },
  { name: "Lumicon Light Pollution Filter", type: "light_pollution" },
  { name: "Celestron Moon Filter", type: "moon" },
];

export const popularOpticalModifiers = [
  // SCT Focal Reducers
  { name: "Celestron f/6.3 Reducer", type: "focal_reducer", factor: 0.63, notes: "Standard SCT reducer, 105mm backfocus" },
  { name: "Meade f/6.3 Reducer", type: "focal_reducer", factor: 0.63, notes: "Standard SCT reducer" },
  { name: "Celestron EdgeHD 0.7x Reducer", type: "focal_reducer", factor: 0.7, notes: "For EdgeHD scopes only" },
  { name: "Starizona SCT Corrector IV", type: "focal_reducer", factor: 0.63, notes: "Premium SCT reducer with coma correction" },
  { name: "Starizona Night Owl 0.4x", type: "focal_reducer", factor: 0.4, notes: "Ultra-fast imaging, f/2 capable" },
  
  // Newtonian Reducers/Correctors
  { name: "Starizona Nexus 0.75x", type: "focal_reducer", factor: 0.75, notes: "Premium Newtonian reducer, f/4 to f/3" },
  { name: "Sharpstar 0.95x MPCC", type: "coma_corrector", factor: 0.95, notes: "Reducing coma corrector for Newtonians" },
  { name: "TS Optics 0.95x Maxfield", type: "coma_corrector", factor: 0.95, notes: "Budget Newtonian corrector" },
  { name: "GSO 0.75x Reducer", type: "focal_reducer", factor: 0.75, notes: "Budget Newtonian reducer" },
  
  // Refractor Reducers
  { name: "William Optics 0.8x Flattener", type: "focal_reducer", factor: 0.8, notes: "Premium refractor reducer/flattener" },
  { name: "Askar 0.8x Full Frame Reducer", type: "focal_reducer", factor: 0.8, notes: "For Askar refractors" },
  { name: "Explore Scientific 0.7x Reducer", type: "focal_reducer", factor: 0.7, notes: "For ED-APO refractors" },
  { name: "Takahashi TOA-35 Reducer", type: "focal_reducer", factor: 0.7, notes: "Premium Takahashi reducer" },
  
  // Non-Reducing Coma Correctors
  { name: "TeleVue Paracorr Type 2", type: "coma_corrector", factor: 1.15, notes: "Premium visual/imaging corrector" },
  { name: "Baader MPCC Mark III", type: "coma_corrector", factor: 1.0, notes: "Classic coma corrector, no magnification change" },
  { name: "Baader RCC-I Rowe Corrector", type: "coma_corrector", factor: 1.0, notes: "Advanced coma corrector" },
  { name: "Explore Scientific HR Coma Corrector", type: "coma_corrector", factor: 1.06, notes: "Visual and imaging, f/3 capable" },
  { name: "GSO Coma Corrector", type: "coma_corrector", factor: 1.1, notes: "Budget coma corrector" },
  { name: "Sky-Watcher Coma Corrector", type: "coma_corrector", factor: 1.0, notes: "Standard Newtonian corrector" },
  
  // Field Flatteners (commonly used as modifiers)
  { name: "William Optics Flat68 III", type: "coma_corrector", factor: 1.0, notes: "Field flattener for refractors" },
  { name: "ZWO ASI Field Flattener", type: "coma_corrector", factor: 1.0, notes: "For ZWO imaging trains" },
];

export const popularCameras = [
  // Smartphones
  { name: "iPhone 15 Pro", type: "smartphone", sensorSize: "1 inch" },
  { name: "iPhone 14 Pro", type: "smartphone", sensorSize: "1/1.28 inch" },
  { name: "Samsung Galaxy S24 Ultra", type: "smartphone", sensorSize: "200MP" },
  { name: "Samsung Galaxy S23 Ultra", type: "smartphone", sensorSize: "200MP" },
  { name: "Google Pixel 8 Pro", type: "smartphone", sensorSize: "1/1.31 inch" },
  
  // ZWO Cameras - Deep Sky
  { name: "ZWO ASI2600MC Pro", type: "astrocam", sensorSize: "APS-C Color (IMX571)" },
  { name: "ZWO ASI2600MM Pro", type: "astrocam", sensorSize: "APS-C Mono (IMX571)" },
  { name: "ZWO ASI6200MC Pro", type: "astrocam", sensorSize: "Full Frame Color (IMX455)" },
  { name: "ZWO ASI6200MM Pro", type: "astrocam", sensorSize: "Full Frame Mono (IMX455)" },
  { name: "ZWO ASI533MC Pro", type: "astrocam", sensorSize: "1 inch Color (IMX533)" },
  { name: "ZWO ASI533MM Pro", type: "astrocam", sensorSize: "1 inch Mono (IMX533)" },
  { name: "ZWO ASI585MC Pro", type: "astrocam", sensorSize: "1/1.2 inch Color (IMX585)" },
  { name: "ZWO ASI294MC Pro", type: "astrocam", sensorSize: "4/3 inch Color (IMX294)" },
  { name: "ZWO ASI294MM Pro", type: "astrocam", sensorSize: "4/3 inch Mono (IMX294)" },
  // ZWO Cameras - Planetary
  { name: "ZWO ASI174MM", type: "astrocam", sensorSize: "1/1.2 inch Mono (IMX174)" },
  { name: "ZWO ASI678MC", type: "astrocam", sensorSize: "1/1.8 inch Color (IMX678)" },
  { name: "ZWO ASI662MC", type: "astrocam", sensorSize: "1/3 inch Color (IMX662)" },
  { name: "ZWO ASI224MC", type: "astrocam", sensorSize: "1/3 inch Color (IMX224)" },
  { name: "ZWO ASI120MM Mini", type: "astrocam", sensorSize: "1/3 inch Mono" },
  
  // SVBony Cameras - Deep Sky
  { name: "SVBony SV605CC", type: "astrocam", sensorSize: "1 inch Color (IMX533)" },
  { name: "SVBony SV405CC", type: "astrocam", sensorSize: "4/3 inch Color (IMX294)" },
  // SVBony Cameras - Planetary
  { name: "SVBony SC715C", type: "astrocam", sensorSize: "1/2.8 inch Color (IMX715)" },
  { name: "SVBony SV705C", type: "astrocam", sensorSize: "1/1.2 inch Color (IMX585)" },
  { name: "SVBony SV305", type: "astrocam", sensorSize: "1/2.8 inch Color (IMX290)" },
  { name: "SVBony SV305M Pro", type: "astrocam", sensorSize: "1/2.8 inch Mono (IMX290)" },
  { name: "SVBony SC311", type: "astrocam", sensorSize: "1/3 inch WiFi (IMX662)" },
  
  // QHYCCD Cameras - Deep Sky
  { name: "QHY268M", type: "astrocam", sensorSize: "APS-C Mono (IMX571)" },
  { name: "QHY268C", type: "astrocam", sensorSize: "APS-C Color (IMX571)" },
  { name: "QHY600M", type: "astrocam", sensorSize: "Full Frame Mono (IMX455)" },
  { name: "QHY600C", type: "astrocam", sensorSize: "Full Frame Color (IMX455)" },
  { name: "QHY533M", type: "astrocam", sensorSize: "1 inch Mono (IMX533)" },
  { name: "QHY533C", type: "astrocam", sensorSize: "1 inch Color (IMX533)" },
  { name: "QHY294M Pro", type: "astrocam", sensorSize: "4/3 inch Mono" },
  { name: "QHY294C Pro", type: "astrocam", sensorSize: "4/3 inch Color" },
  { name: "QHY183M", type: "astrocam", sensorSize: "1 inch Mono (IMX183)" },
  { name: "QHY183C", type: "astrocam", sensorSize: "1 inch Color (IMX183)" },
  { name: "QHY461", type: "astrocam", sensorSize: "Medium Format 100MP (IMX461)" },
  { name: "QHY411", type: "astrocam", sensorSize: "Medium Format 150MP (IMX411)" },
  // QHYCCD Cameras - Planetary/Guiding
  { name: "QHY5III462C", type: "astrocam", sensorSize: "1/2.8 inch Color (IMX462)" },
  { name: "QHY5III462M", type: "astrocam", sensorSize: "1/2.8 inch Mono (IMX462)" },
  { name: "QHY5III568M", type: "astrocam", sensorSize: "1/2 inch Mono (IMX568)" },
  { name: "QHY5III678C", type: "astrocam", sensorSize: "1/1.8 inch Color (IMX678)" },
  { name: "QHY5III485C", type: "astrocam", sensorSize: "1/1.2 inch Color (IMX485)" },
  { name: "QHY5III178M", type: "astrocam", sensorSize: "1/1.8 inch Mono (IMX178)" },
  { name: "QHY5III178C", type: "astrocam", sensorSize: "1/1.8 inch Color (IMX178)" },
  
  // Atik Cameras
  { name: "Atik Horizon II Mono", type: "astrocam", sensorSize: "4/3 inch Mono (MN34230)" },
  { name: "Atik Horizon II Color", type: "astrocam", sensorSize: "4/3 inch Color (MN34230)" },
  { name: "Atik ACIS 7.1", type: "astrocam", sensorSize: "1 inch (IMX428)" },
  { name: "Atik ACIS 12.3", type: "astrocam", sensorSize: "4/3 inch 12MP" },
  { name: "Atik Infinity Mono", type: "astrocam", sensorSize: "1/2 inch Mono (ICX825)" },
  { name: "Atik Infinity Color", type: "astrocam", sensorSize: "1/2 inch Color (ICX825)" },
  
  // Starlight Xpress Cameras
  { name: "Starlight Xpress Trius Pro 694", type: "astrocam", sensorSize: "1 inch Mono CCD (ICX694)" },
  { name: "Starlight Xpress Trius Pro 674", type: "astrocam", sensorSize: "1/2 inch Mono CCD (ICX674)" },
  { name: "Starlight Xpress Trius Pro 814", type: "astrocam", sensorSize: "2/3 inch Mono CCD (ICX814)" },
  { name: "Starlight Xpress Trius Pro 834", type: "astrocam", sensorSize: "APS-C Mono CCD (ICX834)" },
  { name: "Starlight Xpress Lodestar X2", type: "astrocam", sensorSize: "1/3 inch Mono CCD" },
  { name: "Starlight Xpress Lodestar Pro", type: "astrocam", sensorSize: "1/3 inch Mono CCD (ICX829)" },
  { name: "Starlight Xpress SX-25C", type: "astrocam", sensorSize: "APS-C Color CCD" },
  { name: "Starlight Xpress SX-35", type: "astrocam", sensorSize: "APS-C Mono CCD 11MP" },
  
  // DSLRs/Mirrorless
  { name: "Canon EOS Ra", type: "dslr", sensorSize: "Full Frame" },
  { name: "Canon EOS R5", type: "dslr", sensorSize: "Full Frame" },
  { name: "Canon EOS R6 Mark II", type: "dslr", sensorSize: "Full Frame" },
  { name: "Canon EOS 6D Mark II", type: "dslr", sensorSize: "Full Frame" },
  { name: "Canon T7i / 800D", type: "dslr", sensorSize: "APS-C" },
  { name: "Canon T8i / 850D", type: "dslr", sensorSize: "APS-C" },
  { name: "Nikon Z5", type: "dslr", sensorSize: "Full Frame" },
  { name: "Nikon Z6 III", type: "dslr", sensorSize: "Full Frame" },
  { name: "Nikon D850", type: "dslr", sensorSize: "Full Frame" },
  { name: "Nikon D7500", type: "dslr", sensorSize: "APS-C" },
  { name: "Sony A7 IV", type: "dslr", sensorSize: "Full Frame" },
  { name: "Sony A7C II", type: "dslr", sensorSize: "Full Frame" },
  { name: "Sony A6700", type: "dslr", sensorSize: "APS-C" },
];

interface PopularEquipmentProps {
  category: "telescopes" | "eyepieces" | "barlows" | "filters" | "cameras" | "modifiers";
  onSelect: (equipment: any) => void;
  defaultExpanded?: boolean;
}

export function PopularEquipment({ category, onSelect, defaultExpanded = false }: PopularEquipmentProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  let items: any[] = [];
  let title = "";
  let displayKeys: string[] = [];

  switch (category) {
    case "telescopes":
      items = popularTelescopes;
      title = "Popular Telescopes";
      displayKeys = ["name", "aperture", "type"];
      break;
    case "eyepieces":
      items = popularEyepieces;
      title = "Popular Eyepieces";
      displayKeys = ["name", "focalLength"];
      break;
    case "barlows":
      items = popularBarlows;
      title = "Popular Barlows";
      displayKeys = ["name", "factor"];
      break;
    case "filters":
      items = popularFilters;
      title = "Popular Filters";
      displayKeys = ["name", "type"];
      break;
    case "cameras":
      items = popularCameras;
      title = "Popular Cameras";
      displayKeys = ["name", "type"];
      break;
    case "modifiers":
      items = popularOpticalModifiers;
      title = "Popular Optical Modifiers";
      displayKeys = ["name", "factor", "type"];
      break;
  }

  if (!expanded) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setExpanded(true)}
        className="w-full"
        data-testid="button-show-popular-equipment"
      >
        Show Popular Options ({items.length})
      </Button>
    );
  }

  const renderEquipmentItem = (item: any, idx: number) => (
    <div
      key={idx}
      className="flex items-center justify-between p-2 rounded-md hover-elevate bg-muted/30"
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{item.name}</div>
        <div className="text-xs text-muted-foreground flex gap-1 flex-wrap">
          {displayKeys.map(key => {
            const value = item[key];
            if (key === "aperture") return <Badge key={key} variant="outline" className="text-[10px]">{value}mm</Badge>;
            if (key === "focalLength") return <Badge key={key} variant="outline" className="text-[10px]">{value}mm</Badge>;
            if (key === "factor") return <Badge key={key} variant="outline" className="text-[10px]">{value}x</Badge>;
            if (key === "type") return <Badge key={key} variant="outline" className="text-[10px]">{value}</Badge>;
            return null;
          })}
        </div>
      </div>
      <Button
        size="icon"
        variant="ghost"
        onClick={() => onSelect(item)}
        data-testid={`button-add-popular-${category}-${idx}`}
      >
        <Copy className="w-4 h-4" />
      </Button>
    </div>
  );

  if (category === "cameras") {
    const cameraGroups = {
      smartphones: items.filter((c: any) => c.type === "smartphone"),
      zwo: items.filter((c: any) => c.name.startsWith("ZWO")),
      svbony: items.filter((c: any) => c.name.startsWith("SVBony")),
      qhy: items.filter((c: any) => c.name.startsWith("QHY")),
      atik: items.filter((c: any) => c.name.startsWith("Atik")),
      starlight: items.filter((c: any) => c.name.startsWith("Starlight")),
      dslr: items.filter((c: any) => c.type === "dslr"),
    };

    return (
      <Card className="border-dashed">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">{title}</CardTitle>
          <CardDescription>Select from popular camera brands</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Tabs defaultValue="zwo" className="w-full">
            <TabsList className="w-full flex-wrap h-auto gap-1 p-1">
              <TabsTrigger value="zwo" className="text-xs">ZWO ({cameraGroups.zwo.length})</TabsTrigger>
              <TabsTrigger value="qhy" className="text-xs">QHY ({cameraGroups.qhy.length})</TabsTrigger>
              <TabsTrigger value="svbony" className="text-xs">SVBony ({cameraGroups.svbony.length})</TabsTrigger>
              <TabsTrigger value="atik" className="text-xs">Atik ({cameraGroups.atik.length})</TabsTrigger>
              <TabsTrigger value="starlight" className="text-xs">Starlight ({cameraGroups.starlight.length})</TabsTrigger>
              <TabsTrigger value="dslr" className="text-xs">DSLR ({cameraGroups.dslr.length})</TabsTrigger>
              <TabsTrigger value="smartphones" className="text-xs">Phone ({cameraGroups.smartphones.length})</TabsTrigger>
            </TabsList>
            <ScrollArea className="h-[300px] mt-2">
              <TabsContent value="zwo" className="space-y-2 m-0">
                {cameraGroups.zwo.map((item: any, idx: number) => renderEquipmentItem(item, idx))}
              </TabsContent>
              <TabsContent value="qhy" className="space-y-2 m-0">
                {cameraGroups.qhy.map((item: any, idx: number) => renderEquipmentItem(item, idx))}
              </TabsContent>
              <TabsContent value="svbony" className="space-y-2 m-0">
                {cameraGroups.svbony.map((item: any, idx: number) => renderEquipmentItem(item, idx))}
              </TabsContent>
              <TabsContent value="atik" className="space-y-2 m-0">
                {cameraGroups.atik.map((item: any, idx: number) => renderEquipmentItem(item, idx))}
              </TabsContent>
              <TabsContent value="starlight" className="space-y-2 m-0">
                {cameraGroups.starlight.map((item: any, idx: number) => renderEquipmentItem(item, idx))}
              </TabsContent>
              <TabsContent value="dslr" className="space-y-2 m-0">
                {cameraGroups.dslr.map((item: any, idx: number) => renderEquipmentItem(item, idx))}
              </TabsContent>
              <TabsContent value="smartphones" className="space-y-2 m-0">
                {cameraGroups.smartphones.map((item: any, idx: number) => renderEquipmentItem(item, idx))}
              </TabsContent>
            </ScrollArea>
          </Tabs>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(false)}
            className="w-full text-xs"
          >
            Hide suggestions
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (category === "modifiers") {
    const modifierGroups = {
      reducers: items.filter((m: any) => m.type === "focal_reducer"),
      correctors: items.filter((m: any) => m.type === "coma_corrector"),
    };

    const modifierTypeLabels: Record<string, string> = {
      focal_reducer: "Focal Reducer",
      coma_corrector: "Coma Corrector",
    };

    const renderModifierItem = (item: any, idx: number) => (
      <div
        key={idx}
        className="flex items-center justify-between p-2 rounded-md hover-elevate bg-muted/30"
      >
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{item.name}</div>
          <div className="text-xs text-muted-foreground flex gap-1 flex-wrap items-center">
            <Badge variant="outline" className="text-[10px]">{item.factor}×</Badge>
            <Badge variant="secondary" className="text-[10px]">{modifierTypeLabels[item.type]}</Badge>
            {item.notes && <span className="text-[10px] opacity-70">{item.notes}</span>}
          </div>
        </div>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => onSelect(item)}
          data-testid={`button-add-popular-modifier-${idx}`}
        >
          <Copy className="w-4 h-4" />
        </Button>
      </div>
    );

    return (
      <Card className="border-dashed">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">{title}</CardTitle>
          <CardDescription>Select from popular focal reducers and coma correctors</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Tabs defaultValue="reducers" className="w-full">
            <TabsList className="w-full flex-wrap h-auto gap-1 p-1">
              <TabsTrigger value="reducers" className="text-xs">Focal Reducers ({modifierGroups.reducers.length})</TabsTrigger>
              <TabsTrigger value="correctors" className="text-xs">Coma Correctors ({modifierGroups.correctors.length})</TabsTrigger>
            </TabsList>
            <ScrollArea className="h-[300px] mt-2">
              <TabsContent value="reducers" className="space-y-2 m-0">
                {modifierGroups.reducers.map((item: any, idx: number) => renderModifierItem(item, idx))}
              </TabsContent>
              <TabsContent value="correctors" className="space-y-2 m-0">
                {modifierGroups.correctors.map((item: any, idx: number) => renderModifierItem(item, idx))}
              </TabsContent>
            </ScrollArea>
          </Tabs>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(false)}
            className="w-full text-xs"
          >
            Hide suggestions
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">{title}</CardTitle>
        <CardDescription>Click to add popular equipment</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((item, idx) => renderEquipmentItem(item, idx))}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded(false)}
          className="w-full text-xs"
        >
          Hide suggestions
        </Button>
      </CardContent>
    </Card>
  );
}
