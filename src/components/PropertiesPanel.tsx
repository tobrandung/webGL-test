import { useEffect, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ImageUp } from 'lucide-react';
import { cn } from '@/lib/utils';
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

/** Normalisiert Hex-Eingaben (#rgb / #rrggbb, optional ohne #). */
function normalizeHex(raw: string): string | null {
  let value = raw.trim();
  if (!value) return null;
  if (!value.startsWith('#')) value = `#${value}`;

  if (/^#[0-9a-fA-F]{3}$/.test(value)) {
    const r = value[1];
    const g = value[2];
    const b = value[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value.toLowerCase();
  return null;
}

function isPureGray(hex: string): boolean {
  const normalized = normalizeHex(hex);
  if (!normalized) return false;
  const r = Number.parseInt(normalized.slice(1, 3), 16);
  const g = Number.parseInt(normalized.slice(3, 5), 16);
  const b = Number.parseInt(normalized.slice(5, 7), 16);
  return r === g && g === b;
}

function hexToGrayChannel(hex: string): number {
  const normalized = normalizeHex(hex);
  if (!normalized) return 26;
  return Number.parseInt(normalized.slice(1, 3), 16);
}

function grayToHex(value: number): string {
  const channel = Math.max(0, Math.min(255, Math.round(value)))
    .toString(16)
    .padStart(2, '0');
  return `#${channel}${channel}${channel}`;
}

type BackgroundMode = 'gray' | 'custom';

function WorldProperties({
  background,
  onUpdate,
}: {
  background: string;
  onUpdate: (color: string) => void;
}) {
  const [mode, setMode] = useState<BackgroundMode>(() =>
    isPureGray(background) ? 'gray' : 'custom',
  );
  // Slider-Wert entkoppelt von der aktuellen Farbe im Custom-Modus.
  const [graySliderValue, setGraySliderValue] = useState(() =>
    isPureGray(background) ? hexToGrayChannel(background) : 26,
  );
  const [hexDraft, setHexDraft] = useState(background);
  const colorInputValue = normalizeHex(background) ?? '#1a1a1a';

  useEffect(() => {
    setHexDraft(background);
  }, [background]);

  const applyGray = (value: number) => {
    const next = grayToHex(value);
    setMode('gray');
    setGraySliderValue(value);
    setHexDraft(next);
    onUpdate(next);
  };

  const applyCustom = (raw: string) => {
    const normalized = normalizeHex(raw);
    if (!normalized) {
      setHexDraft(background);
      return;
    }
    setMode('custom');
    setHexDraft(normalized);
    onUpdate(normalized);
  };

  return (
    <>
      <p className="text-xs text-muted-foreground">Welt</p>

      <div
        role="button"
        tabIndex={0}
        onClick={() => applyGray(graySliderValue)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            applyGray(graySliderValue);
          }
        }}
        className={cn(
          'cursor-pointer rounded-lg border p-3 transition-colors',
          mode === 'gray'
            ? 'border-ring bg-accent/40 ring-1 ring-ring'
            : 'border-border/60 opacity-60 hover:opacity-80',
        )}
      >
        <Label className="mb-2 block text-xs">Graustufen</Label>
        <Slider
          min={0}
          max={255}
          step={1}
          value={[graySliderValue]}
          onValueChange={([v]) => applyGray(v)}
          onPointerDown={() => applyGray(graySliderValue)}
          aria-label="Graustufen von Schwarz bis Weiß"
        />
        <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
          <span>Schwarz</span>
          <span>{graySliderValue}</span>
          <span>Weiß</span>
        </div>
      </div>

      <div
        role="button"
        tabIndex={0}
        onClick={() => {
          setMode('custom');
          setHexDraft(background);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setMode('custom');
            setHexDraft(background);
          }
        }}
        className={cn(
          'cursor-pointer rounded-lg border p-3 transition-colors',
          mode === 'custom'
            ? 'border-ring bg-accent/40 ring-1 ring-ring'
            : 'border-border/60 opacity-60 hover:opacity-80',
        )}
      >
        <Label htmlFor="bg-color" className="mb-2 block text-xs">
          Eigene Hintergrundfarbe
        </Label>
        <div className="flex min-w-0 items-center gap-2">
          <input
            id="bg-color"
            type="color"
            value={colorInputValue}
            onChange={(e) => applyCustom(e.target.value)}
            onFocus={() => setMode('custom')}
            className="h-9 w-10 shrink-0 cursor-pointer rounded border border-border bg-transparent"
            aria-label="Eigene Hintergrundfarbe wählen"
          />
          <Input
            value={hexDraft}
            onChange={(e) => {
              setMode('custom');
              setHexDraft(e.target.value);
            }}
            onFocus={() => setMode('custom')}
            onBlur={() => applyCustom(hexDraft)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
            spellCheck={false}
            className="font-mono text-xs uppercase"
            aria-label="Hex-Farbwert"
            placeholder="#1a1a1a"
          />
        </div>
      </div>
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
