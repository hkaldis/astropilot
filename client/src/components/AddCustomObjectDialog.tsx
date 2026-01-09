import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Loader2, Plus, ChevronDown, ChevronRight, Rocket, Sparkles, Star } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface AddCustomObjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

const categories = [
  { value: "comet", label: "Comet", icon: Rocket },
  { value: "meteor_shower", label: "Meteor Shower", icon: Sparkles },
  { value: "galaxy", label: "Galaxy", icon: Star },
  { value: "nebula", label: "Nebula", icon: Star },
  { value: "open_cluster", label: "Open Cluster", icon: Star },
  { value: "globular_cluster", label: "Globular Cluster", icon: Star },
  { value: "double_star", label: "Double Star", icon: Star },
  { value: "planetary_nebula", label: "Planetary Nebula", icon: Star },
  { value: "emission_nebula", label: "Emission Nebula", icon: Star },
  { value: "dark_nebula", label: "Dark Nebula", icon: Star },
  { value: "supernova_remnant", label: "Supernova Remnant", icon: Star },
];

const difficulties = [
  { value: "easy", label: "Easy" },
  { value: "moderate", label: "Moderate" },
  { value: "challenging", label: "Challenging" },
  { value: "difficult", label: "Difficult" },
  { value: "expert", label: "Expert" },
];

const months = [
  { value: "jan", label: "Jan" },
  { value: "feb", label: "Feb" },
  { value: "mar", label: "Mar" },
  { value: "apr", label: "Apr" },
  { value: "may", label: "May" },
  { value: "jun", label: "Jun" },
  { value: "jul", label: "Jul" },
  { value: "aug", label: "Aug" },
  { value: "sep", label: "Sep" },
  { value: "oct", label: "Oct" },
  { value: "nov", label: "Nov" },
  { value: "dec", label: "Dec" },
];

export function AddCustomObjectDialog({
  open,
  onOpenChange,
  onCreated,
}: AddCustomObjectDialogProps) {
  const { toast } = useToast();
  const [showOptional, setShowOptional] = useState(false);
  
  const [name, setName] = useState("");
  const [catalogId, setCatalogId] = useState("");
  const [category, setCategory] = useState<string>("");
  const [constellation, setConstellation] = useState("");
  const [magnitude, setMagnitude] = useState("");
  const [rightAscension, setRightAscension] = useState("");
  const [declination, setDeclination] = useState("");
  const [difficulty, setDifficulty] = useState<string>("");
  const [bestMonths, setBestMonths] = useState<string[]>([]);
  const [description, setDescription] = useState("");

  const resetForm = () => {
    setName("");
    setCatalogId("");
    setCategory("");
    setConstellation("");
    setMagnitude("");
    setRightAscension("");
    setDeclination("");
    setDifficulty("");
    setBestMonths([]);
    setDescription("");
    setShowOptional(false);
  };

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      return apiRequest("POST", "/api/custom-objects", data);
    },
    onSuccess: () => {
      toast({
        title: "Custom object created",
        description: `${name} has been added to your catalog.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/objects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/objects/for-user"] });
      resetForm();
      onOpenChange(false);
      onCreated?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create custom object.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    if (!name.trim() || !catalogId.trim() || !category) {
      toast({
        title: "Missing required fields",
        description: "Please fill in name, catalog ID, and category.",
        variant: "destructive",
      });
      return;
    }

    const data: Record<string, unknown> = {
      name: name.trim(),
      catalogId: catalogId.trim(),
      category,
    };

    if (constellation.trim()) data.constellation = constellation.trim();
    if (magnitude) data.magnitude = parseFloat(magnitude);
    if (rightAscension.trim()) data.rightAscension = rightAscension.trim();
    if (declination.trim()) data.declination = declination.trim();
    if (difficulty) data.difficulty = difficulty;
    if (bestMonths.length > 0) data.bestMonths = bestMonths;
    if (description.trim()) data.description = description.trim();

    createMutation.mutate(data);
  };

  const toggleMonth = (month: string) => {
    setBestMonths(prev => 
      prev.includes(month) 
        ? prev.filter(m => m !== month)
        : [...prev, month]
    );
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) resetForm();
      onOpenChange(isOpen);
    }}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Add Custom Object
          </DialogTitle>
          <DialogDescription>
            Add a comet, meteor shower, or other celestial object to your personal catalog.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              data-testid="input-custom-object-name"
              placeholder="e.g., Comet Leonard"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="catalogId">Catalog ID *</Label>
            <Input
              id="catalogId"
              data-testid="input-custom-object-catalog-id"
              placeholder="e.g., C/2021 A1"
              value={catalogId}
              onChange={(e) => setCatalogId(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              A unique identifier for this object (e.g., C/2025 X1, METEOR-ABC)
            </p>
          </div>

          <div className="space-y-2">
            <Label>Category *</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger data-testid="select-custom-object-category">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    <span className="flex items-center gap-2">
                      <cat.icon className="w-4 h-4" />
                      {cat.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Collapsible open={showOptional} onOpenChange={setShowOptional}>
            <CollapsibleTrigger asChild>
              <Button 
                variant="ghost" 
                className="w-full justify-between"
                data-testid="button-toggle-optional-fields"
              >
                <span>Optional Details</span>
                {showOptional ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="constellation">Constellation</Label>
                <Input
                  id="constellation"
                  data-testid="input-custom-object-constellation"
                  placeholder="e.g., Leo"
                  value={constellation}
                  onChange={(e) => setConstellation(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="magnitude">Magnitude</Label>
                <Input
                  id="magnitude"
                  data-testid="input-custom-object-magnitude"
                  type="number"
                  step="0.1"
                  placeholder="e.g., 5.5"
                  value={magnitude}
                  onChange={(e) => setMagnitude(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="ra">Right Ascension</Label>
                  <Input
                    id="ra"
                    data-testid="input-custom-object-ra"
                    placeholder="e.g., 12h 30m"
                    value={rightAscension}
                    onChange={(e) => setRightAscension(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dec">Declination</Label>
                  <Input
                    id="dec"
                    data-testid="input-custom-object-dec"
                    placeholder="e.g., +45° 30'"
                    value={declination}
                    onChange={(e) => setDeclination(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Difficulty</Label>
                <Select value={difficulty} onValueChange={setDifficulty}>
                  <SelectTrigger data-testid="select-custom-object-difficulty">
                    <SelectValue placeholder="Select difficulty" />
                  </SelectTrigger>
                  <SelectContent>
                    {difficulties.map((diff) => (
                      <SelectItem key={diff.value} value={diff.value}>
                        {diff.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Best Months</Label>
                <div className="flex flex-wrap gap-1">
                  {months.map((month) => (
                    <Button
                      key={month.value}
                      type="button"
                      variant={bestMonths.includes(month.value) ? "default" : "outline"}
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => toggleMonth(month.value)}
                      data-testid={`button-month-${month.value}`}
                    >
                      {month.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  data-testid="input-custom-object-description"
                  placeholder="Add notes about this object..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-cancel-custom-object"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={createMutation.isPending || !name.trim() || !catalogId.trim() || !category}
            data-testid="button-create-custom-object"
          >
            {createMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4 mr-2" />
                Add Object
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
