import type { SceneContext } from './scene';
import { type CameraPathState, createCameraPathState, updateCameraFromPath } from './camera-path';

const SCROLL_SENSITIVITY = 0.0003;
const AUTO_ORBIT_SPEED = 0.015;
const IDLE_TIMEOUT = 3000;
const FADE_IN_DURATION = 2.0;

type ControlsConfig = {
  orbitSpeed: number;
  heightOffset: number;
};

const config: ControlsConfig = {
  orbitSpeed: 1.0,
  heightOffset: 0,
};

let cameraState: CameraPathState;
let lastInteractionTime = 0;
let isAutoOrbitActive = false;
let autoOrbitFadeIn = 0;
let touchStartY = 0;

export function initControls(ctx: SceneContext): void {
  cameraState = createCameraPathState();
  lastInteractionTime = performance.now();

  const canvas = ctx.renderer.domElement;

  canvas.addEventListener('wheel', (e: WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY * SCROLL_SENSITIVITY;
    cameraState.targetProgress += delta;
    onUserInteraction();
  }, { passive: false });

  canvas.addEventListener('touchstart', (e: TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartY = e.touches[0].clientY;
      onUserInteraction();
    }
  }, { passive: true });

  canvas.addEventListener('touchmove', (e: TouchEvent) => {
    if (e.touches.length === 1) {
      const deltaY = touchStartY - e.touches[0].clientY;
      touchStartY = e.touches[0].clientY;
      cameraState.targetProgress += deltaY * SCROLL_SENSITIVITY * 2;
      onUserInteraction();
    }
  }, { passive: true });

  initSliders(ctx);
}

function onUserInteraction(): void {
  lastInteractionTime = performance.now();
  isAutoOrbitActive = false;
  autoOrbitFadeIn = 0;
}

export function updateControls(ctx: SceneContext, deltaTime: number): void {
  const now = performance.now();
  const timeSinceInteraction = now - lastInteractionTime;

  if (timeSinceInteraction > IDLE_TIMEOUT) {
    isAutoOrbitActive = true;
    autoOrbitFadeIn = Math.min(autoOrbitFadeIn + deltaTime / FADE_IN_DURATION, 1.0);
    const speed = AUTO_ORBIT_SPEED * config.orbitSpeed * autoOrbitFadeIn;
    cameraState.targetProgress += deltaTime * speed;
  }

  cameraState.heightOffset = config.heightOffset;
  updateCameraFromPath(ctx.camera, cameraState, deltaTime);
}

function initSliders(ctx: SceneContext): void {
  const zoomSlider = document.getElementById('zoom-slider') as HTMLInputElement | null;
  const orbitSpeedSlider = document.getElementById('orbit-speed') as HTMLInputElement | null;
  const heightSlider = document.getElementById('camera-height') as HTMLInputElement | null;
  const lightSlider = document.getElementById('light-intensity') as HTMLInputElement | null;

  if (zoomSlider) {
    zoomSlider.addEventListener('input', () => {
      ctx.camera.fov = Number(zoomSlider.value);
      ctx.camera.updateProjectionMatrix();
    });
  }

  if (orbitSpeedSlider) {
    orbitSpeedSlider.addEventListener('input', () => {
      config.orbitSpeed = Number(orbitSpeedSlider.value) / 50;
    });
  }

  if (heightSlider) {
    heightSlider.addEventListener('input', () => {
      config.heightOffset = (Number(heightSlider.value) - 50) / 50 * 1.5;
    });
  }

  if (lightSlider) {
    lightSlider.addEventListener('input', () => {
      const val = Number(lightSlider.value) / 100;
      ctx.keyLight.intensity = 4 * val;
      ctx.fillLight.intensity = 2.5 * val;
      ctx.rimLight.intensity = 2 * val;
      ctx.topLight.intensity = 2 * val;
      ctx.ambientLight.intensity = 0.8 * val;
      ctx.hemiLight.intensity = 1.5 * val;
    });
  }
}
