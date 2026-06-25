import * as THREE from 'three';

export type Keyframe = {
  position: [number, number, number];
  lookAt: [number, number, number];
};

export type CameraPathState = {
  keyframes: Keyframe[];
  positionSpline: THREE.CatmullRomCurve3 | null;
  lookAtSpline: THREE.CatmullRomCurve3 | null;
  isLoop: boolean;
};

export function buildSplines(keyframes: Keyframe[], isLoop: boolean): {
  positionSpline: THREE.CatmullRomCurve3 | null;
  lookAtSpline: THREE.CatmullRomCurve3 | null;
} {
  if (keyframes.length < 2) return { positionSpline: null, lookAtSpline: null };

  const posPoints = keyframes.map((kf) => new THREE.Vector3(...kf.position));
  const lookAtPoints = keyframes.map((kf) => new THREE.Vector3(...kf.lookAt));

  const positionSpline = new THREE.CatmullRomCurve3(posPoints, isLoop, 'catmullrom', 0.5);
  const lookAtSpline = new THREE.CatmullRomCurve3(lookAtPoints, isLoop, 'catmullrom', 0.5);

  return { positionSpline, lookAtSpline };
}

export function getSplinePoints(spline: THREE.CatmullRomCurve3, segments = 200): THREE.Vector3[] {
  return spline.getPoints(segments);
}

export function getCameraAtProgress(
  positionSpline: THREE.CatmullRomCurve3,
  lookAtSpline: THREE.CatmullRomCurve3,
  t: number,
): { position: THREE.Vector3; lookAt: THREE.Vector3 } {
  const clampedT = Math.max(0, Math.min(1, t));
  return {
    position: positionSpline.getPoint(clampedT),
    lookAt: lookAtSpline.getPoint(clampedT),
  };
}
