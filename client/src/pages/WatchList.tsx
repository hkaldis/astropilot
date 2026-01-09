import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueries } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Link, useLocation } from "wouter";
import { 
  ListTodo, 
  Star, 
  Calendar, 
  CalendarDays,
  Trash2,
  Clock,
  MapPin,
  Moon,
  ArrowUpCircle,
  ArrowRightCircle,
  ArrowDownCircle,
  CheckCircle2,
  XCircle,
  Eye,
  RefreshCw,
  Sparkles,
  Plus,
  AlertTriangle,
  Mountain,
  Wand2,
  LayoutGrid,
  type LucideIcon
} from "lucide-react";
import { MultiObjectCalendar } from "@/components/ObservationCalendar";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { CelestialObject, Location, WatchlistItem, WatchlistWindow } from "@shared/schema";

type WatchlistItemWithObject = WatchlistItem & { object: CelestialObject };

const priorityConfig: Record<string, { label: string; icon: LucideIcon; color: string }> = {
  high: { label: "High", icon: ArrowUpCircle, color: "text-red-500" },
  medium: { label: "Medium", icon: ArrowRightCircle, color: "text-yellow-500" },
  low: { label: "Low", icon: ArrowDownCircle, color: "text-blue-500" },
};

const statusConfig: Record<string, { label: string; icon: LucideIcon; color: string; badgeVariant: "default" | "secondary" | "outline" }> = {
  planned: { label: "Planned", icon: Clock, color: "text-blue-500", badgeVariant: "default" },
  observed: { label: "Observed", icon: CheckCircle2, color: "text-green-500", badgeVariant: "secondary" },
  dismissed: { label: "Dismissed", icon: XCircle, color: "text-muted-foreground", badgeVariant: "outline" },
};

function WatchlistItemCard({ 
  item, 
  locations,
  onDelete, 
  onUpdateStatus, 
  onUpdatePriority,
  onCalculateWindows,
  onViewWindows,
  onViewInSkyTonight,
  isCalculating
}: { 
  item: WatchlistItemWithObject;
  locations: Location[];
  onDelete: (id: number) => void;
  onUpdateStatus: (id: number, status: 'planned' | 'observed' | 'dismissed') => void;
  onUpdatePriority: (id: number, priority: 'high' | 'medium' | 'low') => void;
  onCalculateWindows: (id: number, locationId: number) => void;
  onViewWindows: (id: number) => void;
  onViewInSkyTonight: (catalogId: string) => void;
  isCalculating: boolean;
}) {
  const priority = priorityConfig[item.priority ?? 'medium'];
  const status = statusConfig[item.status ?? 'planned'];
  const PriorityIcon = priority.icon;
  const StatusIcon = status.icon;

  const isWow = (item.object as any).isHot || (item.object as any).wow;

  return (
    <Card className="hover-elevate">
      <CardContent className="p-4">
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-2">
            <button 
              className="flex items-center gap-2 min-w-0 text-left hover:text-primary transition-colors cursor-pointer"
              onClick={() => onViewInSkyTonight(item.object.catalogId)}
              data-testid={`button-view-sky-tonight-${item.id}`}
            >
              {isWow && (
                <Sparkles className="w-4 h-4 text-amber-500 flex-shrink-0" />
              )}
              <div className="min-w-0">
                <h3 className="font-medium truncate" data-testid={`text-watchlist-name-${item.id}`}>
                  {item.object.name}
                </h3>
                <p className="text-sm text-muted-foreground">{item.object.catalogId}</p>
              </div>
            </button>
            <div className="flex items-center gap-1 flex-shrink-0">
              <Badge variant={status.badgeVariant} className="gap-1">
                <StatusIcon className={cn("w-3 h-3", status.color)} />
                {status.label}
              </Badge>
            </div>
          </div>

          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Star className="w-4 h-4" />
              <span>{item.object.category.replace(/_/g, ' ')}</span>
            </div>
            {item.object.constellation && (
              <div className="flex items-center gap-1">
                <Mountain className="w-4 h-4" />
                <span>{item.object.constellation}</span>
              </div>
            )}
            {item.object.magnitude && (
              <div className="flex items-center gap-1">
                <span>Mag {item.object.magnitude.toFixed(1)}</span>
              </div>
            )}
          </div>

          {item.notes && (
            <p className="text-sm text-muted-foreground bg-muted/50 rounded-md p-2">
              {item.notes}
            </p>
          )}

          <div className="flex items-center justify-between gap-2 pt-2 border-t">
            <div className="flex items-center gap-2">
              <Select
                value={item.priority ?? 'medium'}
                onValueChange={(value) => onUpdatePriority(item.id, value as 'high' | 'medium' | 'low')}
              >
                <SelectTrigger className="w-[110px] h-8" data-testid={`select-priority-${item.id}`}>
                  <SelectValue>
                    <div className="flex items-center gap-1.5">
                      <PriorityIcon className={cn("w-3.5 h-3.5", priority.color)} />
                      <span>{priority.label}</span>
                    </div>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(priorityConfig).map(([key, config]) => {
                    const Icon = config.icon;
                    return (
                      <SelectItem key={key} value={key}>
                        <div className="flex items-center gap-1.5">
                          <Icon className={cn("w-3.5 h-3.5", config.color)} />
                          <span>{config.label}</span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-1">
              {item.status === 'planned' && (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button 
                        size="icon" 
                        variant="ghost"
                        onClick={() => onViewWindows(item.id)}
                        data-testid={`button-view-windows-${item.id}`}
                      >
                        <Calendar className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>View Observation Windows</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button 
                        size="icon" 
                        variant="ghost"
                        onClick={() => onUpdateStatus(item.id, 'observed')}
                        data-testid={`button-mark-observed-${item.id}`}
                      >
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Mark as Observed</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button 
                        size="icon" 
                        variant="ghost"
                        onClick={() => onUpdateStatus(item.id, 'dismissed')}
                        data-testid={`button-dismiss-${item.id}`}
                      >
                        <XCircle className="w-4 h-4 text-muted-foreground" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Dismiss</TooltipContent>
                  </Tooltip>
                </>
              )}
              {item.status !== 'planned' && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      size="icon" 
                      variant="ghost"
                      onClick={() => onUpdateStatus(item.id, 'planned')}
                      data-testid={`button-restore-${item.id}`}
                    >
                      <RefreshCw className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Restore to Planned</TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    size="icon" 
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => onDelete(item.id)}
                    data-testid={`button-delete-${item.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Remove from Watch List</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ObservationWindowsDialog({ 
  itemId, 
  itemName,
  locations,
  open, 
  onClose 
}: { 
  itemId: number | null;
  itemName: string;
  locations: Location[];
  open: boolean;
  onClose: () => void;
}) {
  const [selectedLocation, setSelectedLocation] = useState<number | null>(null);
  const { toast } = useToast();

  const { data: windows, isLoading, refetch } = useQuery<WatchlistWindow[]>({
    queryKey: ['/api/watchlist', itemId, 'windows'],
    enabled: !!itemId && open,
  });

  const calculateMutation = useMutation({
    mutationFn: async ({ locationId }: { locationId: number }) => {
      return apiRequest('POST', `/api/watchlist/${itemId}/calculate-windows`, { locationId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/watchlist', itemId, 'windows'] });
      toast({ title: "Windows calculated", description: "Observation windows have been updated for the next 30 days." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to calculate observation windows", variant: "destructive" });
    },
  });

  const handleCalculate = () => {
    if (!selectedLocation) {
      toast({ title: "Select a location", description: "Please select an observation location first", variant: "destructive" });
      return;
    }
    calculateMutation.mutate({ locationId: selectedLocation });
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Observation Windows - {itemName}
          </DialogTitle>
          <DialogDescription>
            Best viewing opportunities for the next 30 days
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label>Calculate for location</Label>
              <Select
                value={selectedLocation?.toString() ?? ""}
                onValueChange={(v) => setSelectedLocation(parseInt(v))}
              >
                <SelectTrigger data-testid="select-location-windows">
                  <SelectValue placeholder="Select location..." />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id.toString()}>
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4" />
                        {loc.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button 
              onClick={handleCalculate} 
              disabled={!selectedLocation || calculateMutation.isPending}
              data-testid="button-calculate-windows"
            >
              {calculateMutation.isPending ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Calculating...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Calculate
                </>
              )}
            </Button>
          </div>

          <ScrollArea className="h-[400px] pr-4">
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : windows && windows.length > 0 ? (
              <div className="space-y-2">
                {windows.map((window) => (
                  <Card key={window.id} className="bg-muted/30">
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-primary" />
                            <span className="font-medium">
                              {format(new Date(window.windowDate), 'EEE, MMM d')}
                            </span>
                            <Badge 
                              variant={window.qualityScore >= 7 ? "default" : window.qualityScore >= 5 ? "secondary" : "outline"}
                              className="ml-2"
                            >
                              Score: {window.qualityScore}/10
                            </Badge>
                          </div>
                          <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {format(new Date(window.startTime), 'HH:mm')} - {format(new Date(window.endTime), 'HH:mm')}
                            </span>
                            <span className="flex items-center gap-1">
                              <Mountain className="w-3 h-3" />
                              {window.peakAltitude}° alt
                            </span>
                            <span className="flex items-center gap-1">
                              <Moon className="w-3 h-3" />
                              {window.moonPhase}%
                              {window.moonInterference !== 'none' && (
                                <Badge variant="outline" className={cn("ml-1 text-xs",
                                  window.moonInterference === 'high' && "border-red-500/50 text-red-500",
                                  window.moonInterference === 'moderate' && "border-yellow-500/50 text-yellow-500",
                                  window.moonInterference === 'low' && "border-blue-500/50 text-blue-500"
                                )}>
                                  {window.moonInterference}
                                </Badge>
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Calendar className="w-12 h-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No observation windows calculated yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Select a location and click Calculate to find the best viewing times
                </p>
              </div>
            )}
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function WatchList() {
  const searchParams = new URLSearchParams(window.location.search);
  const initialViewMode = (searchParams.get('view') === 'calendar' ? 'calendar' : 'list') as 'list' | 'calendar';
  const [, setLocation] = useLocation();
  
  const [statusFilter, setStatusFilter] = useState<string>("planned");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [windowsItemId, setWindowsItemId] = useState<number | null>(null);
  const [windowsItemName, setWindowsItemName] = useState<string>("");
  const [viewMode, setViewMode] = useState<"list" | "calendar">(initialViewMode);
  const { toast } = useToast();
  const { user } = useAuth();

  const handleViewModeChange = (mode: 'list' | 'calendar') => {
    setViewMode(mode);
    const url = new URL(window.location.href);
    if (mode === 'calendar') {
      url.searchParams.set('view', 'calendar');
    } else {
      url.searchParams.delete('view');
    }
    window.history.replaceState({}, '', url.toString());
  };

  const { data: watchlistItems, isLoading } = useQuery<WatchlistItemWithObject[]>({
    queryKey: ['/api/watchlist'],
    enabled: !!user,
  });

  const { data: locations } = useQuery<Location[]>({
    queryKey: ['/api/locations'],
    enabled: !!user,
  });

  const plannedItems = useMemo(() => 
    watchlistItems?.filter(item => item.status === 'planned') ?? [],
    [watchlistItems]
  );

  const windowQueries = useQueries({
    queries: plannedItems.map(item => ({
      queryKey: ['/api/watchlist', item.id, 'windows'],
      enabled: viewMode === 'calendar' && plannedItems.length > 0,
    })),
  });

  const windowQueriesLoading = windowQueries.some(q => q.isLoading);
  const windowQueriesHasData = windowQueries.some(q => q.data && (q.data as WatchlistWindow[]).length > 0);

  const calendarData = useMemo(() => {
    if (viewMode !== 'calendar') return [];
    return plannedItems.map((item, index) => ({
      object: item.object,
      windows: (windowQueries[index]?.data as WatchlistWindow[] | undefined) ?? [],
    })).filter(item => item.windows.length > 0);
  }, [plannedItems, windowQueries, viewMode]);

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<WatchlistItem> }) => {
      return apiRequest('PATCH', `/api/watchlist/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/watchlist'] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update item", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('DELETE', `/api/watchlist/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/watchlist'] });
      toast({ title: "Removed", description: "Item removed from watch list" });
      setDeleteId(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to remove item", variant: "destructive" });
    },
  });

  const filteredItems = watchlistItems?.filter((item) => {
    if (statusFilter !== 'all' && item.status !== statusFilter) return false;
    if (priorityFilter !== 'all' && item.priority !== priorityFilter) return false;
    return true;
  }) ?? [];

  const handleUpdateStatus = (id: number, status: 'planned' | 'observed' | 'dismissed') => {
    updateMutation.mutate({ id, data: { status } });
  };

  const handleUpdatePriority = (id: number, priority: 'high' | 'medium' | 'low') => {
    updateMutation.mutate({ id, data: { priority } });
  };

  const handleViewWindows = (id: number) => {
    const item = watchlistItems?.find((i) => i.id === id);
    if (item) {
      setWindowsItemId(id);
      setWindowsItemName(item.object.name);
    }
  };

  const handleCalculateWindows = (id: number, locationId: number) => {
    // This is now handled within the dialog
  };

  const handleViewInSkyTonight = (catalogId: string) => {
    setLocation(`/sky-tonight?select=${encodeURIComponent(catalogId)}`);
  };

  const stats = {
    total: watchlistItems?.length ?? 0,
    planned: watchlistItems?.filter((i) => i.status === 'planned').length ?? 0,
    observed: watchlistItems?.filter((i) => i.status === 'observed').length ?? 0,
    high: watchlistItems?.filter((i) => i.priority === 'high' && i.status === 'planned').length ?? 0,
  };

  return (
    <div className="container max-w-6xl mx-auto px-4 py-6 space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-watchlist-title">
            <ListTodo className="w-6 h-6" />
            Watch List
          </h1>
          <p className="text-muted-foreground mt-1">
            Track celestial objects you want to observe with smart scheduling
          </p>
        </div>
        <Link href="/objects">
          <Button data-testid="button-add-objects">
            <Plus className="w-4 h-4 mr-2" />
            Browse Objects
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <ListTodo className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-sm text-muted-foreground">Total Items</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Clock className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.planned}</p>
                <p className="text-sm text-muted-foreground">Planned</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.observed}</p>
                <p className="text-sm text-muted-foreground">Observed</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/10">
                <ArrowUpCircle className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.high}</p>
                <p className="text-sm text-muted-foreground">High Priority</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 mr-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant={viewMode === 'list' ? 'default' : 'ghost'}
                onClick={() => handleViewModeChange('list')}
                data-testid="button-view-list"
              >
                <LayoutGrid className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>List View</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant={viewMode === 'calendar' ? 'default' : 'ghost'}
                onClick={() => handleViewModeChange('calendar')}
                data-testid="button-view-calendar"
              >
                <CalendarDays className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Calendar View</TooltipContent>
          </Tooltip>
        </div>
        
        {viewMode === 'list' && (
          <>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]" data-testid="select-status-filter">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="planned">Planned</SelectItem>
                <SelectItem value="observed">Observed</SelectItem>
                <SelectItem value="dismissed">Dismissed</SelectItem>
              </SelectContent>
            </Select>

            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-[140px]" data-testid="select-priority-filter">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priority</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
          </>
        )}
      </div>

      {viewMode === 'list' ? (
        <>
          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-48 w-full" />
              ))}
            </div>
          ) : filteredItems.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredItems.map((item) => (
                <WatchlistItemCard
                  key={item.id}
                  item={item}
                  locations={locations ?? []}
                  onDelete={setDeleteId}
                  onUpdateStatus={handleUpdateStatus}
                  onUpdatePriority={handleUpdatePriority}
                  onCalculateWindows={handleCalculateWindows}
                  onViewWindows={handleViewWindows}
                  onViewInSkyTonight={handleViewInSkyTonight}
                  isCalculating={false}
                />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <ListTodo className="w-16 h-16 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No items in your watch list</h3>
                <p className="text-muted-foreground text-center mb-6 max-w-md">
                  Browse the objects catalog and add celestial objects you'd like to observe.
                  We'll help you find the best viewing opportunities.
                </p>
                <Link href="/objects">
                  <Button data-testid="button-browse-objects-empty">
                    <Star className="w-4 h-4 mr-2" />
                    Browse Objects Catalog
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <div className="space-y-4">
          {windowQueriesLoading ? (
            <div className="grid gap-4 md:grid-cols-2">
              <Skeleton className="h-[400px] w-full" />
              <Skeleton className="h-[200px] w-full" />
            </div>
          ) : calendarData.length > 0 ? (
            <MultiObjectCalendar items={calendarData} />
          ) : plannedItems.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <ListTodo className="w-16 h-16 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No planned items in your watch list</h3>
                <p className="text-muted-foreground text-center mb-6 max-w-md">
                  Add celestial objects to your watch list and mark them as planned to see them in the calendar.
                </p>
                <Button 
                  variant="outline" 
                  onClick={() => handleViewModeChange('list')}
                  data-testid="button-switch-to-list"
                >
                  <LayoutGrid className="w-4 h-4 mr-2" />
                  Switch to List View
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <CalendarDays className="w-16 h-16 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No observation windows calculated</h3>
                <p className="text-muted-foreground text-center mb-6 max-w-md">
                  Calculate observation windows for your planned items to see them in the calendar.
                  Switch to List View and click the calendar icon on each item to calculate windows.
                </p>
                <Button 
                  variant="outline" 
                  onClick={() => handleViewModeChange('list')}
                  data-testid="button-switch-to-list"
                >
                  <LayoutGrid className="w-4 h-4 mr-2" />
                  Switch to List View
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from Watch List?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the object from your watch list. You can always add it back later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ObservationWindowsDialog
        itemId={windowsItemId}
        itemName={windowsItemName}
        locations={locations ?? []}
        open={windowsItemId !== null}
        onClose={() => setWindowsItemId(null)}
      />
    </div>
  );
}
