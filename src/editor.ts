import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { SceneContext } from './scene';
import {
  type Keyframe,
  type CameraPathConfig,
  type CameraPathState,
  buildSplines,
  getSplinePoints,
  createCameraPathState,
  updateCameraFromPath,
} from './camera-path';
import { createEditorUI } from './editor-ui';

type EditorMode = 'edit' | 'play' | 'preview';

type EditorState = {
  keyframes: Keyframe[];
  loop: boolean;
  mode: EditorMode;
  speed: number;
  playbackState: CameraPathState;
  orbitControls: OrbitControls;
  splineLine: THREE.Line | null;
  markers: THREE.Group;
  lookAtMarkers: THREE.Group;
};

let state: EditorState;
let ctx: SceneContext;

const SCROLL_SENSITIVITY = 0.0003;

const SPLINE_MATERIAL = new THREE.LineBasicMaterial({ color: 0x00ffaa, linewidth: 2 });
const MARKER_GEOMETRY = new THREE.SphereGeometry(0.08, 12, 12);
const MARKER_MATERIAL = new THREE.MeshBasicMaterial({ color: 0xff4444 });
const LOOKAT_MATERIAL = new THREE.MeshBasicMaterial({ color: 0x4488ff });

export function initEditor(sceneCtx: SceneContext): void {
  ctx = sceneCtx;

  const orbitControls = new OrbitControls(ctx.camera, ctx.renderer.domElement);
  orbitControls.enableDamping = true;
  orbitControls.dampingFactor = 0.08;
  orbitControls.target.set(0, 0.3, 0);

  state = {
    keyframes: [],
    loop: true,
    mode: 'edit',
    speed: 1.0,
    playbackState: createCameraPathState(),
    orbitControls,
    splineLine: null,
    markers: new THREE.Group(),
    lookAtMarkers: new THREE.Group(),
  };

  ctx.scene.add(state.markers);
  ctx.scene.add(state.lookAtMarkers);

  // Scroll-Event fuer Preview-Modus
  ctx.renderer.domElement.addEventListener('wheel', (e: WheelEvent) => {
    if (state.mode === 'preview') {
      e.preventDefault();
      state.playbackState.targetProgress += e.deltaY * SCROLL_SENSITIVITY;
    }
  }, { passive: false });

  // Touch fuer Preview-Modus
  let touchStartY = 0;
  ctx.renderer.domElement.addEventListener('touchstart', (e: TouchEvent) => {
    if (state.mode === 'preview' && e.touches.length === 1) {
      touchStartY = e.touches[0].clientY;
    }
  }, { passive: true });

  ctx.renderer.domElement.addEventListener('touchmove', (e: TouchEvent) => {
    if (state.mode === 'preview' && e.touches.length === 1) {
      const deltaY = touchStartY - e.touches[0].clientY;
      touchStartY = e.touches[0].clientY;
      state.playbackState.targetProgress += deltaY * SCROLL_SENSITIVITY * 2;
    }
  }, { passive: true });

  createEditorUI({
    onAddKeyframe: () => addKeyframe(),
    onDeleteKeyframe: (index) => deleteKeyframe(index),
    onSelectKeyframe: (index) => jumpToKeyframe(index),
    onPlay: () => startPlayback(),
    onPause: () => pausePlayback(),
    onScrub: (t) => scrubTo(t),
    onToggleLoop: (loop) => setLoop(loop),
    onSetSpeed: (speed) => { state.speed = speed; },
    onExport: () => exportJSON(),
    onImport: (config) => importJSON(config),
    onPreviewMode: (enabled) => setPreviewMode(enabled),
    getKeyframes: () => state.keyframes,
    getIsPlaying: () => state.mode === 'play',
    getIsLoop: () => state.loop,
  });
}

export function updateEditor(_ctx: SceneContext, deltaTime: number): void {
  if (state.mode === 'play') {
    const baseSpeed = 0.015 * state.speed;
    state.playbackState.targetProgress += deltaTime * baseSpeed;

    // Loop: zurueck zum Anfang wenn Ende erreicht
    if (state.loop && state.playbackState.targetProgress >= 1) {
      state.playbackState.targetProgress -= 1;
      state.playbackState.progress -= 1;
    }

    updateCameraFromPath(ctx.camera, state.playbackState, deltaTime);
  } else if (state.mode === 'preview') {
    updateCameraFromPath(ctx.camera, state.playbackState, deltaTime);
  } else {
    state.orbitControls.update();
  }
}

function addKeyframe(): void {
  const pos = ctx.camera.position.clone();
  const target = state.orbitControls.target.clone();

  const kf: Keyframe = {
    position: [round(pos.x), round(pos.y), round(pos.z)],
    lookAt: [round(target.x), round(target.y), round(target.z)],
  };

  state.keyframes.push(kf);
  rebuildVisualization();
}

function deleteKeyframe(index: number): void {
  state.keyframes.splice(index, 1);
  rebuildVisualization();
}

function jumpToKeyframe(index: number): void {
  if (state.mode !== 'edit') {
    pausePlayback();
    setEditMode();
  }

  const kf = state.keyframes[index];
  if (!kf) return;

  ctx.camera.position.set(...kf.position);
  state.orbitControls.target.set(...kf.lookAt);
  state.orbitControls.update();
}

function startPlayback(): void {
  if (state.keyframes.length < 2) return;
  state.mode = 'play';
  state.orbitControls.enabled = false;
  buildSplines(state.keyframes, state.loop);
  state.playbackState = createCameraPathState();
}

function pausePlayback(): void {
  state.mode = 'edit';
  state.orbitControls.enabled = true;
}

function setEditMode(): void {
  state.mode = 'edit';
  state.orbitControls.enabled = true;
}

function setPreviewMode(enabled: boolean): void {
  if (enabled && state.keyframes.length >= 2) {
    state.mode = 'preview';
    state.orbitControls.enabled = false;
    buildSplines(state.keyframes, state.loop);
    state.playbackState = createCameraPathState();
  } else {
    setEditMode();
  }
}

function scrubTo(t: number): void {
  if (state.keyframes.length < 2) return;
  buildSplines(state.keyframes, state.loop);
  state.playbackState.progress = t;
  state.playbackState.targetProgress = t;
  if (state.mode === 'play') {
    state.mode = 'edit';
    state.orbitControls.enabled = true;
  }
}

function setLoop(loop: boolean): void {
  state.loop = loop;
  rebuildVisualization();
}

function importJSON(config: CameraPathConfig): void {
  state.keyframes = [...config.keyframes];
  state.loop = config.loop ?? true;
  rebuildVisualization();
}

function exportJSON(): string {
  const data: CameraPathConfig = {
    loop: state.loop,
    keyframes: state.keyframes,
  };
  const json = JSON.stringify(data, null, 2);

  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'camera-keyframes.json';
  a.click();
  URL.revokeObjectURL(url);

  navigator.clipboard.writeText(json).catch(() => {});
  return json;
}

function rebuildVisualization(): void {
  if (state.splineLine) {
    ctx.scene.remove(state.splineLine);
    state.splineLine.geometry.dispose();
    state.splineLine = null;
  }

  state.markers.clear();
  state.lookAtMarkers.clear();

  if (state.keyframes.length < 2) return;

  buildSplines(state.keyframes, state.loop);

  const points = getSplinePoints(300);
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  state.splineLine = new THREE.Line(geometry, SPLINE_MATERIAL);
  ctx.scene.add(state.splineLine);

  state.keyframes.forEach((kf) => {
    const posMesh = new THREE.Mesh(MARKER_GEOMETRY, MARKER_MATERIAL);
    posMesh.position.set(...kf.position);
    state.markers.add(posMesh);

    const lookMesh = new THREE.Mesh(MARKER_GEOMETRY, LOOKAT_MATERIAL);
    lookMesh.position.set(...kf.lookAt);
    lookMesh.scale.setScalar(0.6);
    state.lookAtMarkers.add(lookMesh);
  });
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
