import * as THREE from 'three';

export type Keyframe = {
  position: [number, number, number];
  lookAt: [number, number, number];
};

export type CameraPathConfig = {
  keyframes: Keyframe[];
  loop: boolean;
};

export type CameraPathState = {
  progress: number;
  targetProgress: number;
  heightOffset: number;
};

let positionSpline: THREE.CatmullRomCurve3 | null = null;
let lookAtSpline: THREE.CatmullRomCurve3 | null = null;
let isLoop = true;

const DEFAULT_KEYFRAMES: Keyframe[] = [
  { position: [3.5, 1.0, 4.0], lookAt: [0, 0.2, 0] },
  { position: [1.5, 0.5, 3.0], lookAt: [0, 0.1, 0.5] },
  { position: [0.3, 0.3, 2.5], lookAt: [0, 0.3, -0.5] },
  { position: [0.0, 2.8, 1.5], lookAt: [0, 0, -0.5] },
  { position: [-0.5, 3.0, -0.5], lookAt: [0, 0, 0] },
  { position: [-3.5, 1.0, -2.0], lookAt: [0, 0.2, 0] },
  { position: [-4.5, 0.8, 0.0], lookAt: [0, 0.2, 0] },
  { position: [-3.0, 1.2, 2.5], lookAt: [0, 0.3, 0] },
  { position: [-1.0, 1.5, 4.5], lookAt: [0, 0.2, 0] },
  { position: [2.5, 0.8, 3.5], lookAt: [0, 0.1, 0] },
  { position: [4.5, 1.0, 0.5], lookAt: [0, 0.2, 0] },
  { position: [4.0, 1.5, -2.0], lookAt: [0, 0.2, 0] },
];

export function buildSplines(keyframes: Keyframe[], loop: boolean): void {
  if (keyframes.length < 2) {
    positionSpline = null;
    lookAtSpline = null;
    return;
  }

  isLoop = loop;
  const posPoints = keyframes.map(kf => new THREE.Vector3(...kf.position));
  const lookPoints = keyframes.map(kf => new THREE.Vector3(...kf.lookAt));

  positionSpline = new THREE.CatmullRomCurve3(posPoints, loop, 'centripetal', 0.5);
  lookAtSpline = new THREE.CatmullRomCurve3(lookPoints, loop, 'centripetal', 0.5);
}

export function loadKeyframesFromJSON(config: CameraPathConfig): void {
  buildSplines(config.keyframes, config.loop);
}

export function getSplinePoints(divisions: number = 200): THREE.Vector3[] {
  if (!positionSpline) return [];
  return positionSpline.getPoints(divisions);
}

export function getPositionSpline(): THREE.CatmullRomCurve3 | null {
  return positionSpline;
}

export function createCameraPathState(): CameraPathState {
  return {
    progress: 0,
    targetProgress: 0,
    heightOffset: 0,
  };
}

export function updateCameraFromPath(
  camera: THREE.PerspectiveCamera,
  state: CameraPathState,
  deltaTime: number
): void {
  if (!positionSpline || !lookAtSpline) return;

  const lerpSpeed = 1 - Math.pow(0.005, deltaTime);
  state.progress += (state.targetProgress - state.progress) * lerpSpeed;

  let t: number;
  if (isLoop) {
    t = ((state.progress % 1) + 1) % 1;
  } else {
    t = Math.max(0, Math.min(1, state.progress));
  }

  const pos = positionSpline.getPointAt(t);
  pos.y += state.heightOffset;

  const lookTarget = lookAtSpline.getPointAt(t);

  camera.position.copy(pos);
  camera.lookAt(lookTarget);
}

// Initialize with default keyframes
buildSplines(DEFAULT_KEYFRAMES, true);
