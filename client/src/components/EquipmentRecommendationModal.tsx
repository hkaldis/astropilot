import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  AlertTriangle,
  CheckCircle,
  XCircle,
  AlertCircle,
  Telescope,
  Eye,
  Target,
  Cloud,
  Moon,
  Sun,
  Zap,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  EnhancedSuitabilityScore,
  getSuitabilityBadgeStyles,
  getSuitabilityBadgeLabel,
} from "@/lib/equipmentRecommendation";

interface EquipmentRecommendationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  objectName: string;
  objectCategory: string;
  telescopeName: string;
  telescopeType?: string;
  eyepieceName: string;
  barlowName?: string;
  suitability: EnhancedSuitabilityScore;
}

function StatusIcon({ type }: { type: 'good' | 'warning' | 'bad' }) {
  if (type === 'good') {
    return <CheckCircle className="w-4 h-4 text-chart-2" />;
  } else if (type === 'warning') {
    return <AlertTriangle className="w-4 h-4 text-chart-5" />;
  } else {
    return <XCircle className="w-4 h-4 text-destructive" />;
  }
}

function CalculationRow({
  label,
  value,
  unit,
  status,
  detail,
}: {
  label: string;
  value: string | number;
  unit?: string;
  status?: 'good' | 'warning' | 'bad';
  detail?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-2 py-1.5">
      <div className="flex items-center gap-2">
        {status && <StatusIcon type={status} />}
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <div className="text-right">
        <span className="font-mono text-sm">
          {typeof value === 'number' ? value.toFixed(1) : value}
          {unit && <span className="text-muted-foreground ml-0.5">{unit}</span>}
        </span>
        {detail && (
          <p className="text-xs text-muted-foreground">{detail}</p>
        )}
      </div>
    </div>
  );
}

function SectionTitle({ icon: Icon, title }: { icon: any; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <Icon className="w-4 h-4 text-muted-foreground" />
      <h4 className="font-medium text-sm">{title}</h4>
    </div>
  );
}

export function EquipmentRecommendationModal({
  open,
  onOpenChange,
  objectName,
  objectCategory,
  telescopeName,
  telescopeType,
  eyepieceName,
  barlowName,
  suitability,
}: EquipmentRecommendationModalProps) {
  const d = suitability.details;
  
  const getMagnificationStatus = (): 'good' | 'warning' | 'bad' => {
    if (d.magnification > d.maxTheoreticMag) return 'bad';
    if (d.magnification > d.seeingLimitedMag) return 'warning';
    if (d.magnification < d.minUsefulMag) return 'warning';
    return 'good';
  };
  
  const getExitPupilStatus = (): 'good' | 'warning' | 'bad' => {
    if (d.exitPupilMatch === 'optimal' || d.exitPupilMatch === 'acceptable') return 'good';
    if (d.exitPupilMatch === 'suboptimal') return 'warning';
    return 'bad';
  };
  
  const getFovStatus = (): 'good' | 'warning' | 'bad' => {
    if (!d.objectAngularSize) return 'good';
    if (!d.objectFitsInFov) return 'bad';
    if (d.fovCoverage >= 15 && d.fovCoverage <= 70) return 'good';
    if (d.fovCoverage < 5) return 'warning';
    return 'good';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" data-testid="modal-title-equipment">
            <Info className="w-5 h-5" />
            Equipment Recommendation Details
          </DialogTitle>
          <DialogDescription>
            Detailed calculation breakdown for {objectName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <div>
              <p className="font-medium text-sm">{objectName}</p>
              <p className="text-xs text-muted-foreground capitalize">{objectCategory.replace(/_/g, ' ')}</p>
            </div>
            <Badge 
              variant="outline"
              className={cn("border", getSuitabilityBadgeStyles(suitability.level))}
              data-testid="badge-overall-suitability"
            >
              {getSuitabilityBadgeLabel(suitability.level)} ({suitability.score}%)
            </Badge>
          </div>

          <div className="p-3 bg-card border rounded-lg">
            <SectionTitle icon={Telescope} title="Equipment Used" />
            <div className="space-y-1.5 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Telescope:</span>
                <span>{telescopeName}</span>
                {telescopeType && (
                  <Badge variant="outline" className="text-xs">
                    {telescopeType}
                  </Badge>
                )}
              </div>
              <p><span className="text-muted-foreground">Eyepiece:</span> {eyepieceName}</p>
              {barlowName && (
                <p><span className="text-muted-foreground">Barlow:</span> {barlowName}</p>
              )}
            </div>
          </div>

          <div className="p-3 bg-card border rounded-lg">
            <SectionTitle icon={Eye} title="Optical Calculations" />
            <div className="space-y-0.5">
              <CalculationRow 
                label="Magnification" 
                value={d.magnification} 
                unit="×"
                status={getMagnificationStatus()}
                detail={
                  d.magnification > d.maxTheoreticMag 
                    ? `Exceeds max (${Math.round(d.maxTheoreticMag)}×)` 
                    : d.magnification > d.seeingLimitedMag 
                      ? `Above seeing limit (${Math.round(d.seeingLimitedMag)}×)`
                      : `Within useful range`
                }
              />
              <CalculationRow 
                label="Exit Pupil" 
                value={d.exitPupil} 
                unit="mm"
                status={getExitPupilStatus()}
                detail={`Optimal: ${d.categoryOptimalExitPupil.min.toFixed(1)}-${d.categoryOptimalExitPupil.max.toFixed(1)}mm`}
              />
              <CalculationRow 
                label="True Field of View" 
                value={d.trueFov} 
                unit="'"
                status={getFovStatus()}
                detail={d.objectAngularSize 
                  ? `Object: ${d.objectAngularSize.toFixed(1)}' (${d.fovCoverage.toFixed(0)}% coverage)`
                  : 'Object size unknown'}
              />
            </div>
          </div>

          <div className="p-3 bg-card border rounded-lg">
            <SectionTitle icon={Target} title="Telescope Limits" />
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Maximum Useful Mag</span>
                <span className="font-mono">{Math.round(d.maxTheoreticMag)}× <span className="text-xs text-muted-foreground">(2× aperture)</span></span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Minimum Useful Mag</span>
                <span className="font-mono">{Math.round(d.minUsefulMag)}× <span className="text-xs text-muted-foreground">(aperture/7)</span></span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Seeing-Limited Mag</span>
                <span className="font-mono">{Math.round(d.seeingLimitedMag)}× <span className="text-xs text-muted-foreground">(conditions)</span></span>
              </div>
              {d.effectiveAperture < 999 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Effective Aperture</span>
                  <span className="font-mono">{d.effectiveAperture.toFixed(0)}mm</span>
                </div>
              )}
            </div>
          </div>

          <div className="p-3 bg-card border rounded-lg">
            <SectionTitle icon={Zap} title="Exit Pupil Analysis" />
            {(() => {
              const maxScale = Math.max(8, Math.ceil(d.exitPupil + 1));
              const exceedsNormal = d.exitPupil > 8;
              return (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span>Your Exit Pupil</span>
                    <span className={cn(
                      "font-mono font-medium",
                      exceedsNormal && "text-chart-5"
                    )}>
                      {d.exitPupil.toFixed(1)}mm
                      {exceedsNormal && " (exceeds eye pupil)"}
                    </span>
                  </div>
                  <div className="relative h-6 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="absolute h-full bg-chart-2/30 rounded-full"
                      style={{
                        left: `${(d.categoryOptimalExitPupil.min / maxScale) * 100}%`,
                        width: `${((d.categoryOptimalExitPupil.max - d.categoryOptimalExitPupil.min) / maxScale) * 100}%`,
                      }}
                    />
                    {exceedsNormal && (
                      <div 
                        className="absolute h-full bg-chart-5/20 rounded-r-full border-l border-chart-5/50"
                        style={{
                          left: `${(8 / maxScale) * 100}%`,
                          width: `${((maxScale - 8) / maxScale) * 100}%`,
                        }}
                      />
                    )}
                    <div 
                      className={cn(
                        "absolute top-1/2 -translate-y-1/2 w-2 h-4 rounded-sm",
                        exceedsNormal ? "bg-chart-5" : "bg-primary"
                      )}
                      style={{
                        left: `calc(${(d.exitPupil / maxScale) * 100}% - 4px)`,
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>0mm</span>
                    <span className="text-chart-2">Optimal: {d.categoryOptimalExitPupil.min.toFixed(1)}-{d.categoryOptimalExitPupil.max.toFixed(1)}mm</span>
                    <span>{maxScale}mm</span>
                  </div>
                  {exceedsNormal && (
                    <div className="flex items-center gap-2 text-xs text-chart-5 bg-chart-5/10 p-2 rounded-md">
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>Exit pupil exceeds 7-8mm (typical dark-adapted eye pupil). Light is being wasted.</span>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {d.exitPupilMatch === 'optimal' && "Your exit pupil is in the ideal range for this object type. This provides the best balance of brightness and detail."}
                    {d.exitPupilMatch === 'acceptable' && "Your exit pupil is within the usable range for this object type. Minor adjustments could improve the view."}
                    {d.exitPupilMatch === 'suboptimal' && `Your exit pupil is outside the optimal range. Consider ${d.exitPupil < d.categoryOptimalExitPupil.min ? 'a longer focal length eyepiece' : 'a shorter focal length eyepiece or adding a Barlow'} for better results.`}
                    {d.exitPupilMatch === 'poor' && `Your exit pupil is significantly outside the optimal range for ${objectCategory.replace(/_/g, ' ')}s. A different eyepiece would provide a much better view.`}
                  </p>
                </div>
              );
            })()}
          </div>

          {d.violations.length > 0 && (
            <div className="p-3 bg-destructive/5 border border-destructive/20 rounded-lg">
              <SectionTitle icon={AlertTriangle} title="Issues Detected" />
              <ul className="space-y-2">
                {d.violations.map((v, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    {v.severity === 'critical' ? (
                      <XCircle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-chart-5 mt-0.5 flex-shrink-0" />
                    )}
                    <span>{v.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {d.bonuses.length > 0 && (
            <div className="p-3 bg-chart-2/5 border border-chart-2/20 rounded-lg">
              <SectionTitle icon={CheckCircle} title="Advantages" />
              <ul className="space-y-1.5">
                {d.bonuses.map((b, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-chart-2 mt-0.5 flex-shrink-0" />
                    <span>{b.message}</span>
                    <Badge variant="outline" className="ml-auto text-xs">+{b.points}pts</Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {d.penalties.length > 0 && (
            <div className="p-3 bg-chart-5/5 border border-chart-5/20 rounded-lg">
              <SectionTitle icon={AlertCircle} title="Considerations" />
              <ul className="space-y-1.5">
                {d.penalties.map((p, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <AlertCircle className="w-4 h-4 text-chart-5 mt-0.5 flex-shrink-0" />
                    <span>{p.message}</span>
                    <Badge variant="outline" className="ml-auto text-xs text-destructive">-{p.points}pts</Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Separator />

          <div className="p-3 bg-muted/30 rounded-lg">
            <h4 className="font-medium text-sm mb-2">How This Score Is Calculated</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              The suitability score starts at 60 points and adjusts based on optical physics and observing conditions. 
              <strong> Exit pupil</strong> (eyepiece focal length ÷ telescope f-ratio) is matched against the optimal range for {objectCategory.replace(/_/g, ' ')}s. 
              <strong> Magnification</strong> is checked against telescope limits (2× aperture maximum, aperture÷7 minimum) and seeing conditions. 
              <strong> Field of view</strong> is calculated to ensure the object fits in view. 
              Environmental factors like light pollution and moon phase apply additional adjustments for deep-sky objects.
            </p>
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-sm font-medium">Final Score</span>
            <div className="flex items-center gap-2">
              <Progress value={suitability.score} className="w-24 h-2" />
              <span className="font-mono text-lg font-bold">{suitability.score}%</span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
