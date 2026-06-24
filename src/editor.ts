import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { SceneContext } from './scene';
import {
  type Keyframe,
  type CameraPathState,
  buildSplines,
  getSplinePoints,
  createCameraPathState,
  updateCameraFromPath,
} from './camera-path';
import { createEditorUI } from './editor-ui';

type EditorState = {
  keyframes: Keyframe[];
  loop: boolean;
  isPlaying: boolean;
  playbackState: CameraPathState;
  orbitControls: OrbitControls;
  splineLine: THREE.Line | null;
  markers: THREE.Group;
  lookAtMarkers: THREE.Group;
};

let state: EditorState;

const SPLINE_MATERIAL = new THREE.LineBasicMaterial({ color: 0x00ffaa, linewidth: 2 });
const MARKER_GEOMETRY = new THREE.SphereGeometry(0.08, 12, 12);
const MARKER_MATERIAL = new THREE.MeshBasicMaterial({ color: 0xff4444 });
const LOOKAT_MATERIAL = new THREE.MeshBasicMaterial({ color: 0x4488ff });

export function initEditor(ctx: SceneContext): void {
  const orbitControls = new OrbitControls(ctx.camera, ctx.renderer.domElement);
  orbitControls.enableDamping = true;
  orbitControls.dampingFactor = 0.08;
  orbitControls.target.set(0, 0.3, 0);

  state = {
    keyframes: [],
    loop: true,
    isPlaying: false,
    playbackState: createCameraPathState(),
    orbitControls,
    splineLine: null,
    markers: new THREE.Group(),
    lookAtMarkers: new THREE.Group(),
  };

  ctx.scene.add(state.markers);
  ctx.scene.add(state.lookAtMarkers);

  createEditorUI({
    onAddKeyframe: () => addKeyframe(ctx),
    onDeleteKeyframe: (index) => deleteKeyframe(ctx, index),
    onSelectKeyframe: (index) => jumpToKeyframe(ctx, index),
    onPlay: () => startPlayback(),
    onPause: () => pausePlayback(),
    onScrub: (t) => scrubTo(t),
    onToggleLoop: (loop) => setLoop(ctx, loop),
    onExport: () => exportJSON(),
    getKeyframes: () => state.keyframes,
    getIsPlaying: () => state.isPlaying,
    getIsLoop: () => state.loop,
  });
}

export function updateEditor(ctx: SceneContext, deltaTime: number): void {
  if (state.isPlaying) {
    state.playbackState.targetProgress += deltaTime * 0.015;
    updateCameraFromPath(ctx.camera, state.playbackState, deltaTime);
  } else {
    state.orbitControls.update();
  }
}

function addKeyframe(ctx: SceneContext): void {
  const pos = ctx.camera.position.clone();
  const target = state.orbitControls.target.clone();

  const kf: Keyframe = {
    position: [round(pos.x), round(pos.y), round(pos.z)],
    lookAt: [round(target.x), round(target.y), round(target.z)],
  };

  state.keyframes.push(kf);
  rebuildVisualization(ctx);
}

function deleteKeyframe(ctx: SceneContext, index: number): void {
  state.keyframes.splice(index, 1);
  rebuildVisualization(ctx);
}

function jumpToKeyframe(ctx: SceneContext, index: number): void {
  if (state.isPlaying) pausePlayback();

  const kf = state.keyframes[index];
  if (!kf) return;

  ctx.camera.position.set(...kf.position);
  state.orbitControls.target.set(...kf.lookAt);
  state.orbitControls.update();
}

function startPlayback(): void {
  if (state.keyframes.length < 2) return;
  state.isPlaying = true;
  buildSplines(state.keyframes, state.loop);
  state.playbackState = createCameraPathState();
}

function pausePlayback(): void {
  state.isPlaying = false;
}

function scrubTo(t: number): void {
  if (state.keyframes.length < 2) return;
  buildSplines(state.keyframes, state.loop);
  state.playbackState.progress = t;
  state.playbackState.targetProgress = t;
  state.isPlaying = false;
}

function setLoop(ctx: SceneContext, loop: boolean): void {
  state.loop = loop;
  rebuildVisualization(ctx);
}

function exportJSON(): string {
  const data = {
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

function rebuildVisualization(ctx: SceneContext): void {
  // Spline-Linie entfernen
  if (state.splineLine) {
    ctx.scene.remove(state.splineLine);
    state.splineLine.geometry.dispose();
    state.splineLine = null;
  }

  // Marker entfernen
  state.markers.clear();
  state.lookAtMarkers.clear();

  if (state.keyframes.length < 2) return;

  // Splines neu bauen
  buildSplines(state.keyframes, state.loop);

  // Spline-Linie zeichnen
  const points = getSplinePoints(300);
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  state.splineLine = new THREE.Line(geometry, SPLINE_MATERIAL);
  ctx.scene.add(state.splineLine);

  // Keyframe-Marker setzen
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
