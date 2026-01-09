import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { EquipmentCard } from "@/components/EquipmentCard";
import { EquipmentSearch } from "@/components/EquipmentSearch";
import { PopularEquipment } from "@/components/PopularEquipment";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Plus, Telescope, Eye, Maximize2, Filter as FilterIcon, Camera, Wrench, AlertTriangle, Crosshair, Focus } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import type { Telescope as TelescopeType, Eyepiece, Barlow, Filter, Camera as CameraType, Accessory, Finder, OpticalModifier } from "@shared/schema";

interface EquipmentData {
  telescopes: TelescopeType[];
  eyepieces: Eyepiece[];
  barlows: Barlow[];
  filters: Filter[];
  cameras: CameraType[];
  accessories: Accessory[];
  finders: Finder[];
  opticalModifiers: OpticalModifier[];
}

const telescopeSchema = z.object({
  name: z.string().min(1, "Name is required"),
  aperture: z.coerce.number().positive("Aperture must be positive"),
  focalLength: z.coerce.number().positive("Focal length must be positive"),
  type: z.string().optional(),
  obstructionRatio: z.coerce.number().min(0).max(100).optional(),
});

const eyepieceSchema = z.object({
  name: z.string().min(1, "Name is required"),
  focalLength: z.coerce.number().positive("Focal length must be positive"),
  apparentFov: z.coerce.number().min(0).max(120).optional(),
});

const barlowSchema = z.object({
  name: z.string().min(1, "Name is required"),
  factor: z.coerce.number().min(1, "Factor must be at least 1"),
});

const filterSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum([
    "none", "uhc", "oiii", "h_beta", "h_alpha", "neodymium", "contrast_booster",
    "cls", "lps", "nd", "variable_polarizer", "fringe_killer", "semi_apo",
    "color_yellow", "color_red", "color_blue", "color_green", "color_orange", "color_violet",
    "light_pollution", "moon", "color"
  ]),
});

const cameraSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(["smartphone", "astrocam", "dslr"]),
  sensorSize: z.string().optional(),
});

const accessorySchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(["adapter", "power", "dew_control", "collimation", "mount_accessory", "case", "other"]),
  description: z.string().optional(),
});

const finderSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(["optical", "raci", "red_dot", "telrad", "laser"]),
  magnification: z.coerce.number().optional(),
  aperture: z.coerce.number().optional(),
  fieldOfView: z.coerce.number().optional(),
});

const opticalModifierSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(["focal_reducer", "coma_corrector"]),
  factor: z.coerce.number().min(0.1).max(2),
  compatibleTelescopeTypes: z.array(z.string()).optional(),
});

function AddTelescopeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const form = useForm<z.infer<typeof telescopeSchema>>({
    resolver: zodResolver(telescopeSchema),
    defaultValues: { name: "", aperture: 0, focalLength: 0, type: "", obstructionRatio: undefined },
  });

  const watchType = form.watch("type");
  const showObstruction = watchType === "reflector" || watchType === "catadioptric";

  const mutation = useMutation({
    mutationFn: async (data: z.infer<typeof telescopeSchema>) => {
      await apiRequest("POST", "/api/telescopes", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      toast({ title: "Telescope added successfully" });
      onOpenChange(false);
      form.reset();
    },
    onError: () => {
      toast({ title: "Failed to add telescope", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-screen overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Telescope</DialogTitle>
          <DialogDescription>Search for a popular telescope or add a custom one.</DialogDescription>
        </DialogHeader>
        <EquipmentSearch
          category="telescopes"
          onSelect={(item) => {
            form.setValue("name", item.name);
            form.setValue("aperture", item.aperture);
            form.setValue("focalLength", item.focalLength);
            form.setValue("type", item.type);
          }}
        />
        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder='e.g., 8" Dobsonian' {...field} data-testid="input-telescope-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="aperture"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Aperture (mm)</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="200" {...field} data-testid="input-telescope-aperture" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="focalLength"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Focal Length (mm)</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="1200" {...field} data-testid="input-telescope-focal-length" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type (optional)</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-telescope-type">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="reflector">Reflector</SelectItem>
                      <SelectItem value="refractor">Refractor</SelectItem>
                      <SelectItem value="catadioptric">Catadioptric</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {showObstruction && (
              <FormField
                control={form.control}
                name="obstructionRatio"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Central Obstruction % (optional)</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        placeholder={watchType === "catadioptric" ? "33" : "20"} 
                        {...field} 
                        value={field.value ?? ""}
                        data-testid="input-telescope-obstruction" 
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      Typical: {watchType === "catadioptric" ? "30-35%" : "20-25%"} for {watchType}s
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-save-telescope">
                {mutation.isPending ? "Adding..." : "Add Telescope"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function AddEyepieceDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const form = useForm<z.infer<typeof eyepieceSchema>>({
    resolver: zodResolver(eyepieceSchema),
    defaultValues: { name: "", focalLength: 0, apparentFov: 0 },
  });

  const mutation = useMutation({
    mutationFn: async (data: z.infer<typeof eyepieceSchema>) => {
      await apiRequest("POST", "/api/eyepieces", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      toast({ title: "Eyepiece added successfully" });
      onOpenChange(false);
      form.reset();
    },
    onError: () => {
      toast({ title: "Failed to add eyepiece", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-screen overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Eyepiece</DialogTitle>
          <DialogDescription>Search for a popular eyepiece or add a custom one.</DialogDescription>
        </DialogHeader>
        <EquipmentSearch
          category="eyepieces"
          onSelect={(item) => {
            form.setValue("name", item.name);
            form.setValue("focalLength", item.focalLength);
            form.setValue("apparentFov", item.apparentFov || 0);
          }}
        />
        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., 25mm Plössl" {...field} data-testid="input-eyepiece-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="focalLength"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Focal Length (mm)</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="25" {...field} data-testid="input-eyepiece-focal-length" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="apparentFov"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Apparent FOV (°)</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="52" {...field} data-testid="input-eyepiece-fov" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-save-eyepiece">
                {mutation.isPending ? "Adding..." : "Add Eyepiece"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function AddBarlowDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const form = useForm<z.infer<typeof barlowSchema>>({
    resolver: zodResolver(barlowSchema),
    defaultValues: { name: "", factor: 2 },
  });

  const mutation = useMutation({
    mutationFn: async (data: z.infer<typeof barlowSchema>) => {
      await apiRequest("POST", "/api/barlows", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      toast({ title: "Barlow added successfully" });
      onOpenChange(false);
      form.reset();
    },
    onError: () => {
      toast({ title: "Failed to add barlow", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-screen overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Barlow Lens</DialogTitle>
          <DialogDescription>Search for a popular barlow or add a custom one.</DialogDescription>
        </DialogHeader>
        <EquipmentSearch
          category="barlows"
          onSelect={(item) => {
            form.setValue("name", item.name);
            form.setValue("factor", item.factor);
          }}
        />
        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., 2x Barlow" {...field} data-testid="input-barlow-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="factor"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Magnification Factor</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.1" placeholder="2" {...field} data-testid="input-barlow-factor" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-save-barlow">
                {mutation.isPending ? "Adding..." : "Add Barlow"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function AddFilterDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const form = useForm<z.infer<typeof filterSchema>>({
    resolver: zodResolver(filterSchema),
    defaultValues: { name: "", type: "none" },
  });

  const mutation = useMutation({
    mutationFn: async (data: z.infer<typeof filterSchema>) => {
      await apiRequest("POST", "/api/filters", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      toast({ title: "Filter added successfully" });
      onOpenChange(false);
      form.reset();
    },
    onError: () => {
      toast({ title: "Failed to add filter", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-screen overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Filter</DialogTitle>
          <DialogDescription>Search for a popular filter or add a custom one.</DialogDescription>
        </DialogHeader>
        <EquipmentSearch
          category="filters"
          onSelect={(item) => {
            form.setValue("name", item.name);
            form.setValue("type", item.type as any);
          }}
        />
        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., UHC Filter" {...field} data-testid="input-filter-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-filter-type">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="max-h-60 overflow-y-auto">
                      <SelectItem value="uhc">UHC (Ultra High Contrast)</SelectItem>
                      <SelectItem value="oiii">O-III</SelectItem>
                      <SelectItem value="h_beta">H-Beta</SelectItem>
                      <SelectItem value="h_alpha">H-Alpha</SelectItem>
                      <SelectItem value="neodymium">Neodymium</SelectItem>
                      <SelectItem value="contrast_booster">Contrast Booster</SelectItem>
                      <SelectItem value="cls">CLS (City Light Suppression)</SelectItem>
                      <SelectItem value="lps">LPS (Light Pollution Suppression)</SelectItem>
                      <SelectItem value="nd">Neutral Density</SelectItem>
                      <SelectItem value="variable_polarizer">Variable Polarizer</SelectItem>
                      <SelectItem value="fringe_killer">Fringe Killer</SelectItem>
                      <SelectItem value="semi_apo">Semi-APO</SelectItem>
                      <SelectItem value="color_yellow">Color: Yellow</SelectItem>
                      <SelectItem value="color_red">Color: Red</SelectItem>
                      <SelectItem value="color_blue">Color: Blue</SelectItem>
                      <SelectItem value="color_green">Color: Green</SelectItem>
                      <SelectItem value="color_orange">Color: Orange</SelectItem>
                      <SelectItem value="color_violet">Color: Violet</SelectItem>
                      <SelectItem value="light_pollution">Light Pollution (Generic)</SelectItem>
                      <SelectItem value="moon">Moon</SelectItem>
                      <SelectItem value="color">Color (Generic)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-save-filter">
                {mutation.isPending ? "Adding..." : "Add Filter"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function AddCameraDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const form = useForm<z.infer<typeof cameraSchema>>({
    resolver: zodResolver(cameraSchema),
    defaultValues: { name: "", type: "smartphone", sensorSize: "" },
  });

  const mutation = useMutation({
    mutationFn: async (data: z.infer<typeof cameraSchema>) => {
      await apiRequest("POST", "/api/cameras", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      toast({ title: "Camera added successfully" });
      onOpenChange(false);
      form.reset();
    },
    onError: () => {
      toast({ title: "Failed to add camera", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-screen overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Camera</DialogTitle>
          <DialogDescription>Search for a popular camera or add a custom one.</DialogDescription>
        </DialogHeader>
        <EquipmentSearch
          category="cameras"
          onSelect={(item) => {
            form.setValue("name", item.name);
            form.setValue("type", item.type as any);
            form.setValue("sensorSize", item.sensorSize || "");
          }}
        />
        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., iPhone 15 Pro" {...field} data-testid="input-camera-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-camera-type">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="smartphone">Smartphone</SelectItem>
                      <SelectItem value="astrocam">AstroCam</SelectItem>
                      <SelectItem value="dslr">DSLR</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="sensorSize"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sensor Size (optional)</FormLabel>
                  <FormControl>
                    <Input placeholder='e.g., 1/1.28"' {...field} data-testid="input-camera-sensor" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-save-camera">
                {mutation.isPending ? "Adding..." : "Add Camera"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

const accessoryTypeLabels: Record<string, string> = {
  adapter: "Adapter",
  power: "Power",
  dew_control: "Dew Control",
  collimation: "Collimation",
  mount_accessory: "Mount Accessory",
  case: "Case/Storage",
  other: "Other",
};

function AddAccessoryDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const form = useForm<z.infer<typeof accessorySchema>>({
    resolver: zodResolver(accessorySchema),
    defaultValues: { name: "", type: "adapter", description: "" },
  });

  const mutation = useMutation({
    mutationFn: async (data: z.infer<typeof accessorySchema>) => {
      await apiRequest("POST", "/api/accessories", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      toast({ title: "Accessory added successfully" });
      onOpenChange(false);
      form.reset();
    },
    onError: () => {
      toast({ title: "Failed to add accessory", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-screen overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Accessory</DialogTitle>
          <DialogDescription>Add adapters, power equipment, dew control, and other accessories.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Celestron NexYZ Adapter" {...field} data-testid="input-accessory-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-accessory-type">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="adapter">Adapter</SelectItem>
                      <SelectItem value="power">Power</SelectItem>
                      <SelectItem value="dew_control">Dew Control</SelectItem>
                      <SelectItem value="collimation">Collimation</SelectItem>
                      <SelectItem value="mount_accessory">Mount Accessory</SelectItem>
                      <SelectItem value="case">Case/Storage</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (optional)</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Add any notes about this accessory..." {...field} data-testid="input-accessory-description" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-save-accessory">
                {mutation.isPending ? "Adding..." : "Add Accessory"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

const finderTypeLabels: Record<string, string> = {
  optical: "Optical Finder",
  raci: "RACI Finder",
  red_dot: "Red Dot Finder",
  telrad: "Telrad Finder",
  laser: "Laser Pointer",
};

const modifierTypeLabels: Record<string, string> = {
  focal_reducer: "Focal Reducer",
  coma_corrector: "Coma Corrector",
};

function AddFinderDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const form = useForm<z.infer<typeof finderSchema>>({
    resolver: zodResolver(finderSchema),
    defaultValues: { name: "", type: "optical", magnification: undefined, aperture: undefined, fieldOfView: undefined },
  });

  const watchType = form.watch("type");
  const showOpticalFields = watchType === "optical" || watchType === "raci";

  const mutation = useMutation({
    mutationFn: async (data: z.infer<typeof finderSchema>) => {
      await apiRequest("POST", "/api/finders", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/finders"] });
      toast({ title: "Finder added successfully" });
      onOpenChange(false);
      form.reset();
    },
    onError: () => {
      toast({ title: "Failed to add finder", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-screen overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Finder</DialogTitle>
          <DialogDescription>Add an optical finder, red dot, or Telrad to your equipment.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., 9x50 Right-Angle Finder" {...field} data-testid="input-finder-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-finder-type">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="optical">Optical Finder</SelectItem>
                      <SelectItem value="raci">RACI Finder (Right-Angle)</SelectItem>
                      <SelectItem value="red_dot">Red Dot Finder</SelectItem>
                      <SelectItem value="telrad">Telrad Finder</SelectItem>
                      <SelectItem value="laser">Laser Pointer</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {showOpticalFields && (
              <>
                <FormField
                  control={form.control}
                  name="magnification"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Magnification</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.1" placeholder="e.g., 9" {...field} data-testid="input-finder-mag" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="aperture"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Aperture (mm)</FormLabel>
                      <FormControl>
                        <Input type="number" step="1" placeholder="e.g., 50" {...field} data-testid="input-finder-aperture" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="fieldOfView"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Field of View (degrees, optional)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.1" placeholder="e.g., 5" {...field} data-testid="input-finder-fov" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-save-finder">
                {mutation.isPending ? "Adding..." : "Add Finder"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function AddOpticalModifierDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const [showPopular, setShowPopular] = useState(true);
  const form = useForm<z.infer<typeof opticalModifierSchema>>({
    resolver: zodResolver(opticalModifierSchema),
    defaultValues: { name: "", type: "focal_reducer", factor: 0.63 },
  });

  const watchType = form.watch("type");

  const mutation = useMutation({
    mutationFn: async (data: z.infer<typeof opticalModifierSchema>) => {
      await apiRequest("POST", "/api/optical-modifiers", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/optical-modifiers"] });
      toast({ title: "Optical modifier added successfully" });
      onOpenChange(false);
      form.reset();
      setShowPopular(true);
    },
    onError: () => {
      toast({ title: "Failed to add optical modifier", variant: "destructive" });
    },
  });

  const handlePresetSelect = (preset: any) => {
    form.setValue("name", preset.name);
    form.setValue("type", preset.type);
    form.setValue("factor", Number(preset.factor));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-screen overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Optical Modifier</DialogTitle>
          <DialogDescription>Add a focal reducer or coma corrector to modify your telescope's optical properties.</DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            <Button
              type="button"
              variant={showPopular ? "default" : "outline"}
              size="sm"
              onClick={() => setShowPopular(!showPopular)}
              data-testid="button-show-popular-modifiers"
            >
              Popular Modifiers
            </Button>
            <EquipmentSearch 
              category="modifiers" 
              onSelect={handlePresetSelect}
            />
          </div>
          
          {showPopular && (
            <PopularEquipment
              category="modifiers"
              onSelect={handlePresetSelect}
              defaultExpanded={true}
            />
          )}
        </div>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Celestron f/6.3 Focal Reducer" {...field} data-testid="input-modifier-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-modifier-type">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="focal_reducer">Focal Reducer</SelectItem>
                      <SelectItem value="coma_corrector">Coma Corrector</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="factor"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {watchType === "focal_reducer" ? "Reduction Factor" : "Factor"}
                  </FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      step="0.01" 
                      placeholder={watchType === "focal_reducer" ? "e.g., 0.63" : "e.g., 1.0"} 
                      {...field} 
                      data-testid="input-modifier-factor" 
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    {watchType === "focal_reducer" 
                      ? "Values less than 1 reduce focal length (e.g., 0.63 = 63% of original FL)"
                      : "Most coma correctors use 1.0 (no change to focal length)"}
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-save-modifier">
                {mutation.isPending ? "Adding..." : "Add Modifier"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function EditTelescopeDialog({ telescope, open, onOpenChange }: { telescope: TelescopeType | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const form = useForm<z.infer<typeof telescopeSchema>>({
    resolver: zodResolver(telescopeSchema),
    defaultValues: { name: "", aperture: 0, focalLength: 0, type: "", obstructionRatio: undefined },
  });

  const watchType = form.watch("type");
  const showObstruction = watchType === "reflector" || watchType === "catadioptric";

  useEffect(() => {
    if (telescope) {
      form.reset({
        name: telescope.name,
        aperture: telescope.aperture,
        focalLength: telescope.focalLength,
        type: telescope.type || "",
        obstructionRatio: telescope.obstructionRatio ?? undefined,
      });
    }
  }, [telescope, form]);

  const mutation = useMutation({
    mutationFn: async (data: z.infer<typeof telescopeSchema>) => {
      await apiRequest("PATCH", `/api/telescopes/${telescope?.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      toast({ title: "Telescope updated successfully" });
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Failed to update telescope", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-screen overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Telescope</DialogTitle>
          <DialogDescription>Update your telescope details.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder='e.g., 8" Dobsonian' {...field} data-testid="input-edit-telescope-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="aperture"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Aperture (mm)</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="200" {...field} data-testid="input-edit-telescope-aperture" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="focalLength"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Focal Length (mm)</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="1200" {...field} data-testid="input-edit-telescope-focal-length" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type (optional)</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-edit-telescope-type">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="reflector">Reflector</SelectItem>
                      <SelectItem value="refractor">Refractor</SelectItem>
                      <SelectItem value="catadioptric">Catadioptric</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {showObstruction && (
              <FormField
                control={form.control}
                name="obstructionRatio"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Central Obstruction % (optional)</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        placeholder={watchType === "catadioptric" ? "33" : "20"} 
                        {...field} 
                        value={field.value ?? ""}
                        data-testid="input-edit-telescope-obstruction" 
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      Typical: {watchType === "catadioptric" ? "30-35%" : "20-25%"} for {watchType}s
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-update-telescope">
                {mutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function EditEyepieceDialog({ eyepiece, open, onOpenChange }: { eyepiece: Eyepiece | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const form = useForm<z.infer<typeof eyepieceSchema>>({
    resolver: zodResolver(eyepieceSchema),
    defaultValues: { name: "", focalLength: 0, apparentFov: 0 },
  });

  useEffect(() => {
    if (eyepiece) {
      form.reset({
        name: eyepiece.name,
        focalLength: eyepiece.focalLength,
        apparentFov: eyepiece.apparentFov || 0,
      });
    }
  }, [eyepiece, form]);

  const mutation = useMutation({
    mutationFn: async (data: z.infer<typeof eyepieceSchema>) => {
      await apiRequest("PATCH", `/api/eyepieces/${eyepiece?.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      toast({ title: "Eyepiece updated successfully" });
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Failed to update eyepiece", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-screen overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Eyepiece</DialogTitle>
          <DialogDescription>Update your eyepiece details.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., 25mm Plössl" {...field} data-testid="input-edit-eyepiece-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="focalLength"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Focal Length (mm)</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="25" {...field} data-testid="input-edit-eyepiece-focal-length" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="apparentFov"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Apparent FOV (°)</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="52" {...field} data-testid="input-edit-eyepiece-fov" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-update-eyepiece">
                {mutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function EditBarlowDialog({ barlow, open, onOpenChange }: { barlow: Barlow | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const form = useForm<z.infer<typeof barlowSchema>>({
    resolver: zodResolver(barlowSchema),
    defaultValues: { name: "", factor: 2 },
  });

  useEffect(() => {
    if (barlow) {
      form.reset({
        name: barlow.name,
        factor: barlow.factor,
      });
    }
  }, [barlow, form]);

  const mutation = useMutation({
    mutationFn: async (data: z.infer<typeof barlowSchema>) => {
      await apiRequest("PATCH", `/api/barlows/${barlow?.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      toast({ title: "Barlow updated successfully" });
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Failed to update barlow", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-screen overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Barlow Lens</DialogTitle>
          <DialogDescription>Update your barlow lens details.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., 2x Barlow" {...field} data-testid="input-edit-barlow-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="factor"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Magnification Factor</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.1" placeholder="2" {...field} data-testid="input-edit-barlow-factor" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-update-barlow">
                {mutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function EditFilterDialog({ filter, open, onOpenChange }: { filter: Filter | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const form = useForm<z.infer<typeof filterSchema>>({
    resolver: zodResolver(filterSchema),
    defaultValues: { name: "", type: "none" },
  });

  useEffect(() => {
    if (filter) {
      form.reset({
        name: filter.name,
        type: filter.type as any,
      });
    }
  }, [filter, form]);

  const mutation = useMutation({
    mutationFn: async (data: z.infer<typeof filterSchema>) => {
      await apiRequest("PATCH", `/api/filters/${filter?.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      toast({ title: "Filter updated successfully" });
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Failed to update filter", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-screen overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Filter</DialogTitle>
          <DialogDescription>Update your filter details.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., UHC Filter" {...field} data-testid="input-edit-filter-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-edit-filter-type">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="max-h-60 overflow-y-auto">
                      <SelectItem value="uhc">UHC (Ultra High Contrast)</SelectItem>
                      <SelectItem value="oiii">O-III</SelectItem>
                      <SelectItem value="h_beta">H-Beta</SelectItem>
                      <SelectItem value="h_alpha">H-Alpha</SelectItem>
                      <SelectItem value="neodymium">Neodymium</SelectItem>
                      <SelectItem value="contrast_booster">Contrast Booster</SelectItem>
                      <SelectItem value="cls">CLS (City Light Suppression)</SelectItem>
                      <SelectItem value="lps">LPS (Light Pollution Suppression)</SelectItem>
                      <SelectItem value="nd">Neutral Density</SelectItem>
                      <SelectItem value="variable_polarizer">Variable Polarizer</SelectItem>
                      <SelectItem value="fringe_killer">Fringe Killer</SelectItem>
                      <SelectItem value="semi_apo">Semi-APO</SelectItem>
                      <SelectItem value="color_yellow">Color: Yellow</SelectItem>
                      <SelectItem value="color_red">Color: Red</SelectItem>
                      <SelectItem value="color_blue">Color: Blue</SelectItem>
                      <SelectItem value="color_green">Color: Green</SelectItem>
                      <SelectItem value="color_orange">Color: Orange</SelectItem>
                      <SelectItem value="color_violet">Color: Violet</SelectItem>
                      <SelectItem value="light_pollution">Light Pollution (Generic)</SelectItem>
                      <SelectItem value="moon">Moon</SelectItem>
                      <SelectItem value="color">Color (Generic)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-update-filter">
                {mutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function EditCameraDialog({ camera, open, onOpenChange }: { camera: CameraType | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const form = useForm<z.infer<typeof cameraSchema>>({
    resolver: zodResolver(cameraSchema),
    defaultValues: { name: "", type: "smartphone", sensorSize: "" },
  });

  useEffect(() => {
    if (camera) {
      form.reset({
        name: camera.name,
        type: camera.type as any,
        sensorSize: camera.sensorSize || "",
      });
    }
  }, [camera, form]);

  const mutation = useMutation({
    mutationFn: async (data: z.infer<typeof cameraSchema>) => {
      await apiRequest("PATCH", `/api/cameras/${camera?.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      toast({ title: "Camera updated successfully" });
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Failed to update camera", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-screen overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Camera</DialogTitle>
          <DialogDescription>Update your camera details.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., iPhone 15 Pro" {...field} data-testid="input-edit-camera-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-edit-camera-type">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="smartphone">Smartphone</SelectItem>
                      <SelectItem value="astrocam">AstroCam</SelectItem>
                      <SelectItem value="dslr">DSLR</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="sensorSize"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sensor Size (optional)</FormLabel>
                  <FormControl>
                    <Input placeholder='e.g., 1/1.28"' {...field} data-testid="input-edit-camera-sensor" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-update-camera">
                {mutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function EditAccessoryDialog({ accessory, open, onOpenChange }: { accessory: Accessory | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const form = useForm<z.infer<typeof accessorySchema>>({
    resolver: zodResolver(accessorySchema),
    defaultValues: { name: "", type: "adapter", description: "" },
  });

  useEffect(() => {
    if (accessory) {
      form.reset({
        name: accessory.name,
        type: accessory.type as any,
        description: accessory.description || "",
      });
    }
  }, [accessory, form]);

  const mutation = useMutation({
    mutationFn: async (data: z.infer<typeof accessorySchema>) => {
      await apiRequest("PATCH", `/api/accessories/${accessory?.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      toast({ title: "Accessory updated successfully" });
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Failed to update accessory", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-screen overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Accessory</DialogTitle>
          <DialogDescription>Update your accessory details.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Celestron NexYZ Adapter" {...field} data-testid="input-edit-accessory-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-edit-accessory-type">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="adapter">Adapter</SelectItem>
                      <SelectItem value="power">Power</SelectItem>
                      <SelectItem value="dew_control">Dew Control</SelectItem>
                      <SelectItem value="collimation">Collimation</SelectItem>
                      <SelectItem value="mount_accessory">Mount Accessory</SelectItem>
                      <SelectItem value="case">Case/Storage</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (optional)</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Add any notes about this accessory..." {...field} data-testid="input-edit-accessory-description" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-update-accessory">
                {mutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function Equipment() {
  const [activeTab, setActiveTab] = useState("telescopes");
  const [telescopeDialogOpen, setTelescopeDialogOpen] = useState(false);
  const [eyepieceDialogOpen, setEyepieceDialogOpen] = useState(false);
  const [barlowDialogOpen, setBarlowDialogOpen] = useState(false);
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  const [cameraDialogOpen, setCameraDialogOpen] = useState(false);
  const [accessoryDialogOpen, setAccessoryDialogOpen] = useState(false);
  const [finderDialogOpen, setFinderDialogOpen] = useState(false);
  const [modifierDialogOpen, setModifierDialogOpen] = useState(false);
  
  const [editingTelescope, setEditingTelescope] = useState<TelescopeType | null>(null);
  const [editingEyepiece, setEditingEyepiece] = useState<Eyepiece | null>(null);
  const [editingBarlow, setEditingBarlow] = useState<Barlow | null>(null);
  const [editingFilter, setEditingFilter] = useState<Filter | null>(null);
  const [editingCamera, setEditingCamera] = useState<CameraType | null>(null);
  const [editingAccessory, setEditingAccessory] = useState<Accessory | null>(null);
  
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    type: string;
    id: number;
    name: string;
    usageCount: number;
  } | null>(null);
  
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: equipment, isLoading } = useQuery<EquipmentData>({
    queryKey: ["/api/equipment"],
    enabled: !!user,
  });

  const { data: finders, isLoading: findersLoading } = useQuery<Finder[]>({
    queryKey: ["/api/finders"],
    enabled: !!user,
  });

  const { data: opticalModifiers, isLoading: modifiersLoading } = useQuery<OpticalModifier[]>({
    queryKey: ["/api/optical-modifiers"],
    enabled: !!user,
  });

  const { data: userPreferences } = useQuery<{ favoriteTelescopeId: number | null; favoriteLocationId: number | null }>({
    queryKey: ["/api/user/preferences"],
    enabled: !!user,
  });

  const setFavoriteMutation = useMutation({
    mutationFn: async (telescopeId: number | null) => {
      await apiRequest("PATCH", "/api/user/preferences", { favoriteTelescopeId: telescopeId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/preferences"] });
      toast({ title: "Favorite telescope updated" });
    },
    onError: () => {
      toast({ title: "Failed to update favorite", variant: "destructive" });
    },
  });

  const handleToggleFavorite = (telescopeId: number) => {
    const newFavorite = userPreferences?.favoriteTelescopeId === telescopeId ? null : telescopeId;
    setFavoriteMutation.mutate(newFavorite);
  };

  const handleDelete = async (type: string, id: number, name: string) => {
    try {
      const response = await fetch(`/api/${type}/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      
      if (response.status === 409) {
        const data = await response.json();
        setDeleteConfirmation({
          type,
          id,
          name,
          usageCount: data.usageCount,
        });
        return;
      }
      
      if (!response.ok) {
        throw new Error('Failed to delete');
      }
      
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      toast({ title: "Item deleted successfully" });
    } catch (error) {
      toast({ title: "Failed to delete item", variant: "destructive" });
    }
  };

  const handleForceDelete = async () => {
    if (!deleteConfirmation) return;
    
    try {
      const response = await fetch(`/api/${deleteConfirmation.type}/${deleteConfirmation.id}?force=true`, {
        method: 'DELETE',
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete');
      }
      
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      toast({ title: "Item deleted successfully" });
      setDeleteConfirmation(null);
    } catch (error) {
      toast({ title: "Failed to delete item", variant: "destructive" });
    }
  };

  const deleteMutation = useMutation({
    mutationFn: async ({ type, id }: { type: string; id: number }) => {
      await apiRequest("DELETE", `/api/${type}/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      toast({ title: "Item deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete item", variant: "destructive" });
    },
  });

  const getAddButton = () => {
    const buttons: Record<string, { onClick: () => void; label: string; testId: string }> = {
      telescopes: { onClick: () => setTelescopeDialogOpen(true), label: "Telescope", testId: "button-add-telescope" },
      eyepieces: { onClick: () => setEyepieceDialogOpen(true), label: "Eyepiece", testId: "button-add-eyepiece" },
      barlows: { onClick: () => setBarlowDialogOpen(true), label: "Barlow", testId: "button-add-barlow" },
      filters: { onClick: () => setFilterDialogOpen(true), label: "Filter", testId: "button-add-filter" },
      cameras: { onClick: () => setCameraDialogOpen(true), label: "Camera", testId: "button-add-camera" },
      accessories: { onClick: () => setAccessoryDialogOpen(true), label: "Accessory", testId: "button-add-accessory" },
      finders: { onClick: () => setFinderDialogOpen(true), label: "Finder", testId: "button-add-finder" },
      modifiers: { onClick: () => setModifierDialogOpen(true), label: "Modifier", testId: "button-add-modifier" },
    };
    
    const config = buttons[activeTab];
    if (!config) return null;
    
    return (
      <Button onClick={config.onClick} data-testid={config.testId}>
        <Plus className="w-4 h-4 sm:mr-2" />
        <span className="hidden sm:inline">Add {config.label}</span>
      </Button>
    );
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold">Equipment</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Manage your astronomy gear</p>
        </div>
        {getAddButton()}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-1">
          <TabsList className="w-max sm:w-auto inline-flex h-auto gap-1 p-1" data-testid="tabs-equipment">
            <TabsTrigger value="telescopes" className="gap-1.5 sm:gap-2 px-2.5 sm:px-3 min-w-0">
              <Telescope className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Telescopes</span>
            </TabsTrigger>
            <TabsTrigger value="eyepieces" className="gap-1.5 sm:gap-2 px-2.5 sm:px-3 min-w-0">
              <Eye className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Eyepieces</span>
            </TabsTrigger>
            <TabsTrigger value="barlows" className="gap-1.5 sm:gap-2 px-2.5 sm:px-3 min-w-0">
              <Maximize2 className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Barlows</span>
            </TabsTrigger>
            <TabsTrigger value="modifiers" className="gap-1.5 sm:gap-2 px-2.5 sm:px-3 min-w-0">
              <Focus className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Modifiers</span>
            </TabsTrigger>
            <TabsTrigger value="filters" className="gap-1.5 sm:gap-2 px-2.5 sm:px-3 min-w-0">
              <FilterIcon className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Filters</span>
            </TabsTrigger>
            <TabsTrigger value="cameras" className="gap-1.5 sm:gap-2 px-2.5 sm:px-3 min-w-0">
              <Camera className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Cameras</span>
            </TabsTrigger>
            <TabsTrigger value="finders" className="gap-1.5 sm:gap-2 px-2.5 sm:px-3 min-w-0">
              <Crosshair className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Finders</span>
            </TabsTrigger>
            <TabsTrigger value="accessories" className="gap-1.5 sm:gap-2 px-2.5 sm:px-3 min-w-0">
              <Wrench className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Accessories</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="telescopes" className="mt-4 sm:mt-6">
          {isLoading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-48" />)}
            </div>
          ) : equipment?.telescopes?.length ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
              {equipment.telescopes.map((t) => (
                <EquipmentCard
                  key={t.id}
                  title={t.name}
                  icon={<Telescope className="w-4 h-4" />}
                  badge={t.type || undefined}
                  specs={[
                    { label: "Aperture", value: t.aperture, unit: "mm" },
                    { label: "Focal Length", value: t.focalLength, unit: "mm" },
                    { label: "f/ratio", value: (t.focalLength / t.aperture).toFixed(1) },
                  ]}
                  onEdit={() => setEditingTelescope(t)}
                  onDelete={() => handleDelete("telescopes", t.id, t.name)}
                  isFavorite={userPreferences?.favoriteTelescopeId === t.id}
                  onToggleFavorite={() => handleToggleFavorite(t.id)}
                />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Telescope className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground mb-4">No telescopes added yet</p>
                <Button onClick={() => setTelescopeDialogOpen(true)} data-testid="button-add-first-telescope">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Your First Telescope
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="eyepieces" className="mt-4 sm:mt-6">
          {isLoading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-40" />)}
            </div>
          ) : equipment?.eyepieces?.length ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
              {equipment.eyepieces.map((e) => (
                <EquipmentCard
                  key={e.id}
                  title={e.name}
                  icon={<Eye className="w-4 h-4" />}
                  specs={[
                    { label: "Focal Length", value: e.focalLength, unit: "mm" },
                    ...(e.apparentFov ? [{ label: "Apparent FOV", value: e.apparentFov, unit: "°" }] : []),
                  ]}
                  onEdit={() => setEditingEyepiece(e)}
                  onDelete={() => handleDelete("eyepieces", e.id, e.name)}
                />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Eye className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground mb-4">No eyepieces added yet</p>
                <Button onClick={() => setEyepieceDialogOpen(true)} data-testid="button-add-first-eyepiece">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Your First Eyepiece
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="barlows" className="mt-4 sm:mt-6">
          {isLoading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
              {[1, 2].map((i) => <Skeleton key={i} className="h-32" />)}
            </div>
          ) : equipment?.barlows?.length ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
              {equipment.barlows.map((b) => (
                <EquipmentCard
                  key={b.id}
                  title={b.name}
                  icon={<Maximize2 className="w-4 h-4" />}
                  specs={[
                    { label: "Factor", value: `${b.factor}x` },
                  ]}
                  onEdit={() => setEditingBarlow(b)}
                  onDelete={() => handleDelete("barlows", b.id, b.name)}
                />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Maximize2 className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground mb-4">No barlow lenses added yet</p>
                <Button onClick={() => setBarlowDialogOpen(true)} data-testid="button-add-first-barlow">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Your First Barlow
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="filters" className="mt-4 sm:mt-6">
          {isLoading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
              {[1, 2].map((i) => <Skeleton key={i} className="h-32" />)}
            </div>
          ) : equipment?.filters?.length ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
              {equipment.filters.map((f) => (
                <EquipmentCard
                  key={f.id}
                  title={f.name}
                  icon={<FilterIcon className="w-4 h-4" />}
                  badge={f.type.toUpperCase().replace("_", "-")}
                  specs={[]}
                  onEdit={() => setEditingFilter(f)}
                  onDelete={() => handleDelete("filters", f.id, f.name)}
                />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <FilterIcon className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground mb-4">No filters added yet</p>
                <Button onClick={() => setFilterDialogOpen(true)} data-testid="button-add-first-filter">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Your First Filter
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="cameras" className="mt-4 sm:mt-6">
          {isLoading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
              {[1, 2].map((i) => <Skeleton key={i} className="h-32" />)}
            </div>
          ) : equipment?.cameras?.length ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
              {equipment.cameras.map((c) => (
                <EquipmentCard
                  key={c.id}
                  title={c.name}
                  icon={<Camera className="w-4 h-4" />}
                  badge={c.type.replace("_", " ").toUpperCase()}
                  specs={[
                    ...(c.sensorSize ? [{ label: "Sensor", value: c.sensorSize }] : []),
                  ]}
                  onEdit={() => setEditingCamera(c)}
                  onDelete={() => handleDelete("cameras", c.id, c.name)}
                />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Camera className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground mb-4">No cameras added yet</p>
                <Button onClick={() => setCameraDialogOpen(true)} data-testid="button-add-first-camera">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Your First Camera
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="accessories" className="mt-4 sm:mt-6">
          {isLoading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
              {[1, 2].map((i) => <Skeleton key={i} className="h-32" />)}
            </div>
          ) : equipment?.accessories?.length ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
              {equipment.accessories.map((a) => (
                <EquipmentCard
                  key={a.id}
                  title={a.name}
                  icon={<Wrench className="w-4 h-4" />}
                  badge={accessoryTypeLabels[a.type] || a.type}
                  specs={[
                    ...(a.description ? [{ label: "Notes", value: a.description }] : []),
                  ]}
                  onEdit={() => setEditingAccessory(a)}
                  onDelete={() => deleteMutation.mutate({ type: "accessories", id: a.id })}
                />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Wrench className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground mb-4">No accessories added yet</p>
                <Button onClick={() => setAccessoryDialogOpen(true)} data-testid="button-add-first-accessory">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Your First Accessory
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="finders" className="mt-4 sm:mt-6">
          {findersLoading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
              {[1, 2].map((i) => <Skeleton key={i} className="h-32" />)}
            </div>
          ) : finders?.length ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
              {finders.map((f) => (
                <EquipmentCard
                  key={f.id}
                  title={f.name}
                  icon={<Crosshair className="w-4 h-4" />}
                  badge={finderTypeLabels[f.type] || f.type}
                  specs={[
                    ...(f.magnification ? [{ label: "Magnification", value: `${f.magnification}×` }] : []),
                    ...(f.aperture ? [{ label: "Aperture", value: f.aperture, unit: "mm" }] : []),
                    ...(f.fieldOfView ? [{ label: "FOV", value: `${f.fieldOfView}°` }] : []),
                  ]}
                  onDelete={() => handleDelete("finders", f.id, f.name)}
                />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Crosshair className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground mb-4">No finders added yet</p>
                <Button onClick={() => setFinderDialogOpen(true)} data-testid="button-add-first-finder">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Your First Finder
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="modifiers" className="mt-4 sm:mt-6">
          {modifiersLoading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
              {[1, 2].map((i) => <Skeleton key={i} className="h-32" />)}
            </div>
          ) : opticalModifiers?.length ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
              {opticalModifiers.map((m) => (
                <EquipmentCard
                  key={m.id}
                  title={m.name}
                  icon={<Focus className="w-4 h-4" />}
                  badge={modifierTypeLabels[m.type] || m.type}
                  specs={[
                    { label: "Factor", value: `${m.factor}×` },
                    { 
                      label: "Effect", 
                      value: m.type === "focal_reducer" 
                        ? `Reduces FL to ${Math.round(m.factor * 100)}%` 
                        : "Corrects coma aberration"
                    },
                  ]}
                  onDelete={() => handleDelete("optical-modifiers", m.id, m.name)}
                />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Focus className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground mb-4">No optical modifiers added yet</p>
                <p className="text-sm text-muted-foreground mb-4">
                  Focal reducers shorten focal length for wider fields. Coma correctors improve edge sharpness.
                </p>
                <Button onClick={() => setModifierDialogOpen(true)} data-testid="button-add-first-modifier">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Your First Modifier
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <AddTelescopeDialog open={telescopeDialogOpen} onOpenChange={setTelescopeDialogOpen} />
      <AddEyepieceDialog open={eyepieceDialogOpen} onOpenChange={setEyepieceDialogOpen} />
      <AddBarlowDialog open={barlowDialogOpen} onOpenChange={setBarlowDialogOpen} />
      <AddFilterDialog open={filterDialogOpen} onOpenChange={setFilterDialogOpen} />
      <AddCameraDialog open={cameraDialogOpen} onOpenChange={setCameraDialogOpen} />
      <AddAccessoryDialog open={accessoryDialogOpen} onOpenChange={setAccessoryDialogOpen} />
      <AddFinderDialog open={finderDialogOpen} onOpenChange={setFinderDialogOpen} />
      <AddOpticalModifierDialog open={modifierDialogOpen} onOpenChange={setModifierDialogOpen} />
      
      <EditTelescopeDialog
        telescope={editingTelescope}
        open={!!editingTelescope}
        onOpenChange={(open) => !open && setEditingTelescope(null)}
      />
      <EditEyepieceDialog
        eyepiece={editingEyepiece}
        open={!!editingEyepiece}
        onOpenChange={(open) => !open && setEditingEyepiece(null)}
      />
      <EditBarlowDialog
        barlow={editingBarlow}
        open={!!editingBarlow}
        onOpenChange={(open) => !open && setEditingBarlow(null)}
      />
      <EditFilterDialog
        filter={editingFilter}
        open={!!editingFilter}
        onOpenChange={(open) => !open && setEditingFilter(null)}
      />
      <EditCameraDialog
        camera={editingCamera}
        open={!!editingCamera}
        onOpenChange={(open) => !open && setEditingCamera(null)}
      />
      <EditAccessoryDialog
        accessory={editingAccessory}
        open={!!editingAccessory}
        onOpenChange={(open) => !open && setEditingAccessory(null)}
      />
      
      <AlertDialog open={!!deleteConfirmation} onOpenChange={(open) => !open && setDeleteConfirmation(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Equipment In Use
            </AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-semibold">{deleteConfirmation?.name}</span> is used in{" "}
              <span className="font-semibold">{deleteConfirmation?.usageCount}</span> observation{deleteConfirmation?.usageCount === 1 ? "" : "s"}.
              <br /><br />
              If you delete this equipment, the observations will be preserved but will no longer reference this equipment.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Keep Equipment</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleForceDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
