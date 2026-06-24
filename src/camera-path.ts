import * as THREE from 'three';

type Keyframe = {
  position: [number, number, number];
  lookAt: [number, number, number];
};

// Cinematic Keyframes mit variablem Abstand, Hoehe und Blickrichtung
const KEYFRAMES: Keyframe[] = [
  // 0% — Hero Shot: Front 3/4, mittlere Distanz
  { position: [3.5, 1.0, 4.0], lookAt: [0, 0.2, 0] },

  // ~8% — Zoom-In auf Front/Kuehler
  { position: [1.5, 0.5, 3.0], lookAt: [0, 0.1, 0.5] },

  // ~16% — Ganz nah, Low-Angle von vorne
  { position: [0.3, 0.3, 2.5], lookAt: [0, 0.3, -0.5] },

  // ~24% — Flyover: Hoch ueber die Motorhaube
  { position: [0.0, 2.8, 1.5], lookAt: [0, 0, -0.5] },

  // ~32% — Flyover Mitte: Draufsicht leicht versetzt
  { position: [-0.5, 3.0, -0.5], lookAt: [0, 0, 0] },

  // ~40% — Runterkommen zur Seite rechts
  { position: [-3.5, 1.0, -2.0], lookAt: [0, 0.2, 0] },

  // ~50% — Seite rechts, Profilansicht
  { position: [-4.5, 0.8, 0.0], lookAt: [0, 0.2, 0] },

  // ~58% — Heck 3/4 nah
  { position: [-3.0, 1.2, 2.5], lookAt: [0, 0.3, 0] },

  // ~66% — Heck, etwas erhoeht
  { position: [-1.0, 1.5, 4.5], lookAt: [0, 0.2, 0] },

  // ~74% — Schwenk zur linken Seite
  { position: [2.5, 0.8, 3.5], lookAt: [0, 0.1, 0] },

  // ~82% — Seite links, mittlere Distanz
  { position: [4.5, 1.0, 0.5], lookAt: [0, 0.2, 0] },

  // ~90% — Zurueck zum Start, weiter weg, erhoeht
  { position: [4.0, 1.5, -2.0], lookAt: [0, 0.2, 0] },
];

const positionPoints = KEYFRAMES.map(kf => new THREE.Vector3(...kf.position));
const lookAtPoints = KEYFRAMES.map(kf => new THREE.Vector3(...kf.lookAt));

const positionSpline = new THREE.CatmullRomCurve3(positionPoints, true, 'centripetal', 0.5);
const lookAtSpline = new THREE.CatmullRomCurve3(lookAtPoints, true, 'centripetal', 0.5);

export type CameraPathState = {
  progress: number;
  targetProgress: number;
  heightOffset: number;
};

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
  const lerpSpeed = 1 - Math.pow(0.005, deltaTime);
  state.progress += (state.targetProgress - state.progress) * lerpSpeed;

  const t = ((state.progress % 1) + 1) % 1;

  const pos = positionSpline.getPointAt(t);
  pos.y += state.heightOffset;

  const lookTarget = lookAtSpline.getPointAt(t);

  camera.position.copy(pos);
  camera.lookAt(lookTarget);
}
