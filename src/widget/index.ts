import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import {
  syncLights,
  applyEnvironment,
  loadEquirectTexture,
  createDefaultLights,
  type LightRecord,
} from '@/three/lighting';
import type { LightEntry } from '@/lib/db';

type Vec3 = [number, number, number];

type ModelConfig = {
  url: string;
  position?: Vec3;
  rotation?: Vec3;
  scale?: Vec3;
};

type EnvironmentWidgetConfig = {
  url: string;
  showBackground: boolean;
  useForReflection: boolean;
  intensity: number;
  blurriness?: number;
};

type WidgetConfig = {
  mode: 'scroll' | 'autoplay' | 'loop';
  transparent?: boolean;
  background?: string;
  keyframes: Array<{ position: Vec3; lookAt: Vec3 }>;
  isLoop: boolean;
  speed: number;
  /** Mehrere Modelle mit Transform. */
  models?: ModelConfig[];
  /** Rückwärtskompatibel: einzelnes Modell. */
  modelUrl?: string;
  /** Platzierte Lichtquellen (Fallback: Standard-Studio-Setup). */
  lights?: LightEntry[];
  /** Optionale equirektanguläre Umgebung für Spiegelung/Hintergrund. */
  environment?: EnvironmentWidgetConfig;
};

function buildSplines(keyframes: WidgetConfig['keyframes'], isLoop: boolean) {
  if (keyframes.length < 2) return { positionSpline: null, lookAtSpline: null };
  const posPoints = keyframes.map((kf) => new THREE.Vector3(...kf.position));
  const lookAtPoints = keyframes.map((kf) => new THREE.Vector3(...kf.lookAt));
  return {
    positionSpline: new THREE.CatmullRomCurve3(posPoints, isLoop, 'catmullrom', 0.5),
    lookAtSpline: new THREE.CatmullRomCurve3(lookAtPoints, isLoop, 'catmullrom', 0.5),
  };
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function init(selector: string, config: WidgetConfig) {
  const container = document.querySelector<HTMLElement>(selector);
  if (!container) {
    console.error('[Web3DWidget] Container nicht gefunden:', selector);
    return;
  }

  if (config.keyframes.length < 2) {
    console.warn(
      '[Web3DWidget] Weniger als 2 Keyframes – es findet keine Kamerafahrt statt. ' +
        'Erstelle im Editor mindestens 2 Keyframes und exportiere erneut.',
    );
  }

  const scene = new THREE.Scene();
  scene.background = config.transparent ? null : new THREE.Color(config.background ?? '#1a1a1a');

  const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
  camera.position.set(3, 2, 5);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: !!config.transparent });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  container.appendChild(renderer.domElement);

  const lightStore = new Map<string, LightRecord>();
  syncLights(scene, config.lights && config.lights.length ? config.lights : createDefaultLights(), lightStore);

  if (config.environment) {
    const env = config.environment;
    loadEquirectTexture(env.url, env.url)
      .then((texture) => {
        applyEnvironment(scene, renderer, texture, {
          showBackground: env.showBackground,
          useForReflection: env.useForReflection,
          intensity: env.intensity,
          blurriness: env.blurriness,
        });
      })
      .catch((err) => console.error('[Web3DWidget] Umgebung konnte nicht geladen werden:', env.url, err));
  }

  const loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
  loader.setDRACOLoader(draco);

  const modelList: ModelConfig[] = config.models ?? (config.modelUrl ? [{ url: config.modelUrl }] : []);

  modelList.forEach((m) => {
    loader.load(
      m.url,
      (gltf) => {
        const wrapper = new THREE.Group();
        wrapper.add(gltf.scene);
        const box = new THREE.Box3().setFromObject(wrapper);
        const center = box.getCenter(new THREE.Vector3());
        gltf.scene.position.sub(center);
        if (m.position) wrapper.position.set(...m.position);
        if (m.rotation) wrapper.rotation.set(...m.rotation);
        if (m.scale) wrapper.scale.set(...m.scale);
        scene.add(wrapper);
      },
      undefined,
      (err) => console.error('[Web3DWidget] Modell konnte nicht geladen werden:', m.url, err),
    );
  });

  const { positionSpline, lookAtSpline } = buildSplines(config.keyframes, config.isLoop);
  let progress = 0;

  // Sucht ab dem Container aufwärts das erste `position: sticky`-Element. So
  // funktioniert der Scroll unabhängig davon, wie die Divs in Webflow
  // verschachtelt sind – der Nutzer muss nur irgendwo Sticky setzen.
  function findStickyAncestor(start: HTMLElement | null): HTMLElement | null {
    let el: HTMLElement | null = start;
    while (el && el !== document.body) {
      if (getComputedStyle(el).position === 'sticky') return el;
      el = el.parentElement;
    }
    return null;
  }

  // Fortschritt aus der Scroll-Position des Sticky-Tracks ableiten. Der Track ist
  // das Elternelement des Sticky-Elements (die hohe Section); die Reisestrecke
  // ergibt sich aus Track-Höhe minus Höhe des gepinnten Elements.
  function computeScrollProgress(): number {
    const sticky = findStickyAncestor(container);
    const track = (sticky ?? container)?.parentElement;
    if (!track) return 0;
    const pinnedHeight = sticky ? sticky.offsetHeight : window.innerHeight;
    const travel = track.offsetHeight - pinnedHeight;
    if (travel <= 0) return 0;
    const scrolled = -track.getBoundingClientRect().top;
    return clamp01(scrolled / travel);
  }

  function applyCamera(t: number) {
    if (!positionSpline || !lookAtSpline) return;
    const pos = positionSpline.getPoint(t);
    const look = lookAtSpline.getPoint(t);
    camera.position.copy(pos);
    camera.lookAt(look);
  }

  let lastTime = performance.now();

  function animate() {
    requestAnimationFrame(animate);
    const now = performance.now();
    const dt = (now - lastTime) / 1000;
    lastTime = now;

    if (positionSpline && lookAtSpline) {
      if (config.mode === 'scroll') {
        const target = computeScrollProgress();
        progress += (target - progress) * 0.12;
        applyCamera(progress);
      } else {
        const duration = Math.max(config.keyframes.length * 2, 1);
        progress += (dt * config.speed) / duration;
        if (progress >= 1) {
          progress = config.mode === 'loop' || config.isLoop ? progress % 1 : 1;
        }
        applyCamera(progress);
      }
    }

    renderer.render(scene, camera);
  }
  animate();

  const ro = new ResizeObserver(() => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  });
  ro.observe(container);
}

(globalThis as Record<string, unknown>).Web3DWidget = { init };

export { init };
