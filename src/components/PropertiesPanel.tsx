import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ImageUp } from 'lucide-react';
import type { LightEntry, EnvironmentConfig } from '@/lib/db';

type PropertiesPanelProps = {
  light: LightEntry | null;
  environment: EnvironmentConfig | null;
  /** Non-null when the world/background entry is selected. */
  background: string | null;
  onUpdateLight: (id: string, patch: Partial<LightEntry>) => void;
  onUpdateEnvironment: (patch: Partial<EnvironmentConfig>) => void;
  onReplaceEnvironment: () => void;
  onUpdateBackground: (color: string) => void;
};

const RAD_TO_DEG = 180 / Math.PI;
const DEG_TO_RAD = Math.PI / 180;

function Row({ children }: { children: React.ReactNode }) {
  return <div className="space-y-1.5">{children}</div>;
}

function ValueLabel({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <Label className="text-xs">{label}</Label>
      <span className="text-xs text-muted-foreground">{value}</span>
    </div>
  );
}

export function PropertiesPanel({
  light,
  environment,
  background,
  onUpdateLight,
  onUpdateEnvironment,
  onReplaceEnvironment,
  onUpdateBackground,
}: PropertiesPanelProps) {
  return (
    <div className="absolute right-0 top-[49px] z-10 flex h-[calc(100%-49px)] w-[260px] flex-col border-l bg-background/95 backdrop-blur-sm">
      <div className="px-3 py-2">
        <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Eigenschaften
        </span>
      </div>
      <Separator />
      <div className="flex-1 space-y-4 overflow-y-auto p-3">
        {background !== null && (
          <WorldProperties background={background} onUpdate={onUpdateBackground} />
        )}
        {light && <LightProperties light={light} onUpdate={onUpdateLight} />}
        {environment && (
          <EnvironmentProperties
            environment={environment}
            onUpdate={onUpdateEnvironment}
            onReplace={onReplaceEnvironment}
          />
        )}
      </div>
    </div>
  );
}

const BACKGROUND_PRESETS = ['#0f0f11', '#1a1a1a', '#ffffff', '#e5e7eb', '#1e293b', '#0b2545'];

function WorldProperties({
  background,
  onUpdate,
}: {
  background: string;
  onUpdate: (color: string) => void;
}) {
  return (
    <>
      <p className="text-xs text-muted-foreground">Welt</p>

      <Row>
        <Label htmlFor="bg-color" className="text-xs">
          Hintergrundfarbe
        </Label>
        <div className="flex items-center gap-2">
          <input
            id="bg-color"
            type="color"
            value={background}
            onChange={(e) => onUpdate(e.target.value)}
            className="h-8 w-10 cursor-pointer rounded border border-border bg-transparent"
            aria-label="Hintergrundfarbe"
          />
          <span className="text-xs text-muted-foreground">{background}</span>
        </div>
      </Row>

      <Row>
        <Label className="text-xs">Voreinstellungen</Label>
        <div className="flex flex-wrap gap-1.5">
          {BACKGROUND_PRESETS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => onUpdate(color)}
              className={`h-6 w-6 rounded border ${
                background.toLowerCase() === color ? 'border-ring ring-1 ring-ring' : 'border-border'
              }`}
              style={{ backgroundColor: color }}
              aria-label={`Hintergrund ${color}`}
            />
          ))}
        </div>
      </Row>
    </>
  );
}

function LightProperties({
  light,
  onUpdate,
}: {
  light: LightEntry;
  onUpdate: (id: string, patch: Partial<LightEntry>) => void;
}) {
  const typeLabel: Record<LightEntry['type'], string> = {
    ambient: 'Umgebungslicht',
    directional: 'Richtungslicht',
    point: 'Punktlicht',
    spot: 'Spotlicht',
  };

  return (
    <>
      <p className="text-xs text-muted-foreground">{typeLabel[light.type]}</p>

      <Row>
        <Label htmlFor="light-color" className="text-xs">
          Farbe
        </Label>
        <div className="flex items-center gap-2">
          <input
            id="light-color"
            type="color"
            value={light.color}
            onChange={(e) => onUpdate(light.id, { color: e.target.value })}
            className="h-8 w-10 cursor-pointer rounded border border-border bg-transparent"
            aria-label="Lichtfarbe"
          />
          <span className="text-xs text-muted-foreground">{light.color}</span>
        </div>
      </Row>

      <Row>
        <ValueLabel label="Intensität" value={light.intensity.toFixed(2)} />
        <Slider
          min={0}
          max={light.type === 'ambient' || light.type === 'directional' ? 3 : 30}
          step={0.05}
          value={[light.intensity]}
          onValueChange={([v]) => onUpdate(light.id, { intensity: v })}
        />
      </Row>

      {(light.type === 'point' || light.type === 'spot') && (
        <>
          <Row>
            <ValueLabel label="Reichweite" value={light.distance ? light.distance.toFixed(1) : '∞'} />
            <Slider
              min={0}
              max={50}
              step={0.5}
              value={[light.distance ?? 0]}
              onValueChange={([v]) => onUpdate(light.id, { distance: v })}
            />
          </Row>
          <Row>
            <ValueLabel label="Abnahme (Decay)" value={(light.decay ?? 2).toFixed(1)} />
            <Slider
              min={0}
              max={4}
              step={0.1}
              value={[light.decay ?? 2]}
              onValueChange={([v]) => onUpdate(light.id, { decay: v })}
            />
          </Row>
        </>
      )}

      {light.type === 'spot' && (
        <>
          <Row>
            <ValueLabel label="Kegelwinkel" value={`${Math.round((light.angle ?? Math.PI / 6) * RAD_TO_DEG)}°`} />
            <Slider
              min={5}
              max={90}
              step={1}
              value={[(light.angle ?? Math.PI / 6) * RAD_TO_DEG]}
              onValueChange={([v]) => onUpdate(light.id, { angle: v * DEG_TO_RAD })}
            />
          </Row>
          <Row>
            <ValueLabel label="Weichzeichnung" value={(light.penumbra ?? 0).toFixed(2)} />
            <Slider
              min={0}
              max={1}
              step={0.05}
              value={[light.penumbra ?? 0]}
              onValueChange={([v]) => onUpdate(light.id, { penumbra: v })}
            />
          </Row>
        </>
      )}

      {light.type !== 'ambient' && (
        <p className="text-[11px] text-muted-foreground">
          Position im Viewport per Verschieben-Gizmo anpassen.
        </p>
      )}
    </>
  );
}

function EnvironmentProperties({
  environment,
  onUpdate,
  onReplace,
}: {
  environment: EnvironmentConfig;
  onUpdate: (patch: Partial<EnvironmentConfig>) => void;
  onReplace: () => void;
}) {
  return (
    <>
      <Row>
        <Label className="text-xs">Bild</Label>
        <div className="flex items-center gap-2 rounded-md bg-secondary px-2 py-1.5">
          <span className="min-w-0 flex-1 truncate text-xs">{environment.fileName}</span>
        </div>
        <Button variant="outline" size="sm" className="w-full" onClick={onReplace}>
          <ImageUp className="mr-2 h-3.5 w-3.5" />
          Bild ersetzen
        </Button>
      </Row>

      <div className="flex items-center justify-between">
        <Label htmlFor="env-reflect" className="text-xs">
          Für Spiegelung nutzen
        </Label>
        <Switch
          id="env-reflect"
          checked={environment.useForReflection}
          onCheckedChange={(v) => onUpdate({ useForReflection: v })}
        />
      </div>

      <div className="flex items-center justify-between">
        <Label htmlFor="env-bg" className="text-xs">
          Als Hintergrund zeigen
        </Label>
        <Switch
          id="env-bg"
          checked={environment.showBackground}
          onCheckedChange={(v) => onUpdate({ showBackground: v })}
        />
      </div>

      <Row>
        <ValueLabel label="Intensität" value={environment.intensity.toFixed(2)} />
        <Slider
          min={0}
          max={3}
          step={0.05}
          value={[environment.intensity]}
          onValueChange={([v]) => onUpdate({ intensity: v })}
        />
      </Row>

      {environment.showBackground && (
        <Row>
          <ValueLabel label="Hintergrund-Unschärfe" value={(environment.blurriness ?? 0).toFixed(2)} />
          <Slider
            min={0}
            max={1}
            step={0.05}
            value={[environment.blurriness ?? 0]}
            onValueChange={([v]) => onUpdate({ blurriness: v })}
          />
        </Row>
      )}
    </>
  );
}
