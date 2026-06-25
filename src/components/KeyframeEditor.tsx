import { useState, useCallback, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Play, Pause, Repeat, Repeat1, Plus, Trash2, Download, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { buildSplines, getSplinePoints, getCameraAtProgress, type Keyframe } from '@/three/camera-path';
import type { ViewportContext } from '@/three/viewport';

type KeyframeEditorProps = {
  viewportCtx: ViewportContext | null;
  keyframes: Keyframe[];
  isLoop: boolean;
  speed: number;
  onKeyframesChange: (keyframes: Keyframe[]) => void;
  onLoopChange: (isLoop: boolean) => void;
  onSpeedChange: (speed: number) => void;
};

export function KeyframeEditor({
  viewportCtx,
  keyframes,
  isLoop,
  speed,
  onKeyframesChange,
  onLoopChange,
  onSpeedChange,
}: KeyframeEditorProps) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState([0]);
  const [showSpline, setShowSpline] = useState(true);
  const [showMarkers, setShowMarkers] = useState(true);
  const splineLineRef = useRef<THREE.Line | null>(null);
  const markersGroupRef = useRef<THREE.Group | null>(null);
  const animFrameRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const splines = buildSplines(keyframes, isLoop);

  useEffect(() => {
    if (!viewportCtx) return;
    updateVisualization();
    return () => cleanupVisualization();
  }, [viewportCtx, keyframes, isLoop, showSpline, showMarkers]);

  function updateVisualization() {
    if (!viewportCtx) return;
    cleanupVisualization();

    if (showSpline && splines.positionSpline) {
      const points = getSplinePoints(splines.positionSpline);
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineBasicMaterial({ color: 0x00aaff, opacity: 0.7, transparent: true });
      const line = new THREE.Line(geometry, material);
      viewportCtx.scene.add(line);
      splineLineRef.current = line;
    }

    if (showMarkers) {
      const group = new THREE.Group();
      keyframes.forEach((kf) => {
        const sphereGeo = new THREE.SphereGeometry(0.08);
        const sphereMat = new THREE.MeshBasicMaterial({ color: 0xff4444 });
        const sphere = new THREE.Mesh(sphereGeo, sphereMat);
        sphere.position.set(...kf.position);
        group.add(sphere);

        const lookAtGeo = new THREE.SphereGeometry(0.04);
        const lookAtMat = new THREE.MeshBasicMaterial({ color: 0x44ff44 });
        const lookAtSphere = new THREE.Mesh(lookAtGeo, lookAtMat);
        lookAtSphere.position.set(...kf.lookAt);
        group.add(lookAtSphere);

        const lineGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(...kf.position),
          new THREE.Vector3(...kf.lookAt),
        ]);
        const lineMat = new THREE.LineBasicMaterial({ color: 0xffff44, opacity: 0.4, transparent: true });
        const connector = new THREE.Line(lineGeo, lineMat);
        group.add(connector);
      });
      viewportCtx.scene.add(group);
      markersGroupRef.current = group;
    }
  }

  function cleanupVisualization() {
    if (!viewportCtx) return;
    if (splineLineRef.current) {
      viewportCtx.scene.remove(splineLineRef.current);
      splineLineRef.current.geometry.dispose();
      splineLineRef.current = null;
    }
    if (markersGroupRef.current) {
      viewportCtx.scene.remove(markersGroupRef.current);
      markersGroupRef.current = null;
    }
  }

  useEffect(() => {
    if (!playing || !splines.positionSpline || !splines.lookAtSpline || !viewportCtx) return;

    let lastTime = performance.now();
    let currentProgress = progress[0] / 100;

    function tick() {
      const now = performance.now();
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      const duration = keyframes.length * 2;
      currentProgress += (dt * speed) / duration;

      if (currentProgress >= 1) {
        if (isLoop) {
          currentProgress = currentProgress % 1;
        } else {
          currentProgress = 1;
          setPlaying(false);
        }
      }

      if (splines.positionSpline && splines.lookAtSpline && viewportCtx) {
        const { position, lookAt } = getCameraAtProgress(splines.positionSpline, splines.lookAtSpline, currentProgress);
        viewportCtx.camera.position.copy(position);
        viewportCtx.camera.lookAt(lookAt);
      }

      setProgress([currentProgress * 100]);
      animFrameRef.current = requestAnimationFrame(tick);
    }

    animFrameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [playing, speed, isLoop, keyframes, viewportCtx]);

  const addKeyframe = useCallback(() => {
    if (!viewportCtx) return;
    const pos = viewportCtx.camera.position;
    const target = viewportCtx.orbitControls.target;
    const newKf: Keyframe = {
      position: [pos.x, pos.y, pos.z],
      lookAt: [target.x, target.y, target.z],
    };
    onKeyframesChange([...keyframes, newKf]);
  }, [viewportCtx, keyframes, onKeyframesChange]);

  const deleteKeyframe = useCallback(
    (index: number) => {
      onKeyframesChange(keyframes.filter((_, i) => i !== index));
    },
    [keyframes, onKeyframesChange],
  );

  const jumpToKeyframe = useCallback(
    (index: number) => {
      if (!viewportCtx) return;
      const kf = keyframes[index];
      viewportCtx.camera.position.set(...kf.position);
      viewportCtx.orbitControls.target.set(...kf.lookAt);
      viewportCtx.orbitControls.update();
    },
    [viewportCtx, keyframes],
  );

  const handleTimelineChange = useCallback(
    (value: number[]) => {
      setProgress(value);
      if (!splines.positionSpline || !splines.lookAtSpline || !viewportCtx) return;
      const t = value[0] / 100;
      const { position, lookAt } = getCameraAtProgress(splines.positionSpline, splines.lookAtSpline, t);
      viewportCtx.camera.position.copy(position);
      viewportCtx.camera.lookAt(lookAt);
    },
    [splines, viewportCtx],
  );

  const exportJSON = useCallback(() => {
    const data = JSON.stringify({ keyframes, isLoop, speed }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'camera-path.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [keyframes, isLoop, speed]);

  const importJSON = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result as string);
          if (data.keyframes) onKeyframesChange(data.keyframes);
          if (typeof data.isLoop === 'boolean') onLoopChange(data.isLoop);
          if (typeof data.speed === 'number') onSpeedChange(data.speed);
        } catch {
          /* invalid JSON */
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    },
    [onKeyframesChange, onLoopChange, onSpeedChange],
  );

  return (
    <div className="absolute bottom-0 left-0 right-0 z-20 border-t bg-background/95 backdrop-blur-sm">
      <div className="flex items-center gap-2 px-3 py-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause' : 'Abspielen'}>
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{playing ? 'Pause' : 'Abspielen'}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onLoopChange(!isLoop)} aria-label={isLoop ? 'Loop deaktivieren' : 'Loop aktivieren'}>
              {isLoop ? <Repeat className="h-4 w-4" /> : <Repeat1 className="h-4 w-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{isLoop ? 'Loop deaktivieren' : 'Loop aktivieren'}</TooltipContent>
        </Tooltip>

        <div className="flex-1">
          <Slider min={0} max={100} step={0.1} value={progress} onValueChange={handleTimelineChange} />
        </div>

        <div className="flex items-center gap-1.5">
          <Label className="text-xs text-muted-foreground">Speed</Label>
          <Slider
            className="w-20"
            min={0.1}
            max={5}
            step={0.1}
            value={[speed]}
            onValueChange={([v]) => onSpeedChange(v)}
          />
          <span className="w-8 text-right text-xs text-muted-foreground">{speed.toFixed(1)}x</span>
        </div>

        <Separator orientation="vertical" className="h-6" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={addKeyframe} aria-label="Keyframe hinzufügen">
              <Plus className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Keyframe hinzufügen</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={exportJSON} aria-label="JSON exportieren">
              <Download className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Keyframes als JSON exportieren</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => fileInputRef.current?.click()} aria-label="JSON importieren">
              <Upload className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Keyframes aus JSON importieren</TooltipContent>
        </Tooltip>
        <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={importJSON} />
      </div>

      <Separator />

      <div className="flex items-center gap-3 px-3 py-1.5">
        <div className="flex items-center gap-1.5">
          <Switch id="show-spline" checked={showSpline} onCheckedChange={setShowSpline} />
          <Label htmlFor="show-spline" className="text-xs">Spline</Label>
        </div>
        <div className="flex items-center gap-1.5">
          <Switch id="show-markers" checked={showMarkers} onCheckedChange={setShowMarkers} />
          <Label htmlFor="show-markers" className="text-xs">Marker</Label>
        </div>

        <Separator orientation="vertical" className="h-5" />

        <ScrollArea className="flex-1">
          <div className="flex gap-1.5">
            {keyframes.map((kf, i) => (
              <div
                key={i}
                className="flex shrink-0 items-center gap-1 rounded-md bg-secondary px-2 py-1"
              >
                <button
                  className="text-xs font-medium hover:text-primary"
                  onClick={() => jumpToKeyframe(i)}
                  type="button"
                >
                  KF {i + 1}
                </button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className="text-muted-foreground hover:text-red-400"
                      onClick={() => deleteKeyframe(i)}
                      type="button"
                      aria-label={`Keyframe ${i + 1} löschen`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Keyframe löschen</TooltipContent>
                </Tooltip>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
