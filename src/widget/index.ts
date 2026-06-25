import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

type WidgetConfig = {
  mode: 'scroll' | 'autoplay' | 'loop';
  transparent?: boolean;
  background?: string;
  keyframes: Array<{ position: [number, number, number]; lookAt: [number, number, number] }>;
  isLoop: boolean;
  speed: number;
  modelUrl?: string;
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

function init(selector: string, config: WidgetConfig) {
  const container = document.querySelector(selector);
  if (!container) {
    console.error('[Web3DWidget] Container not found:', selector);
    return;
  }

  const scene = new THREE.Scene();
  if (config.transparent) {
    scene.background = null;
  } else {
    scene.background = new THREE.Color(config.background ?? '#1a1a1a');
  }

  const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
  camera.position.set(3, 2, 5);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: !!config.transparent });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  container.appendChild(renderer.domElement);

  const ambient = new THREE.AmbientLight(0xffffff, 0.4);
  scene.add(ambient);
  const key = new THREE.DirectionalLight(0xffffff, 1.2);
  key.position.set(5, 8, 5);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xb4c6e0, 0.6);
  fill.position.set(-3, 4, -2);
  scene.add(fill);

  if (config.modelUrl) {
    const loader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
    loader.setDRACOLoader(draco);
    loader.load(config.modelUrl, (gltf) => {
      const wrapper = new THREE.Group();
      wrapper.add(gltf.scene);
      const box = new THREE.Box3().setFromObject(wrapper);
      const center = box.getCenter(new THREE.Vector3());
      gltf.scene.position.sub(center);
      scene.add(wrapper);
      draco.dispose();
    });
  }

  const { positionSpline, lookAtSpline } = buildSplines(config.keyframes, config.isLoop);
  let progress = 0;

  if (config.mode === 'scroll') {
    window.addEventListener('wheel', (e) => {
      if (!positionSpline || !lookAtSpline) return;
      progress += e.deltaY * 0.0005;
      if (config.isLoop) {
        progress = ((progress % 1) + 1) % 1;
      } else {
        progress = Math.max(0, Math.min(1, progress));
      }
      const pos = positionSpline.getPoint(progress);
      const look = lookAtSpline.getPoint(progress);
      camera.position.copy(pos);
      camera.lookAt(look);
    }, { passive: true });
  }

  let lastTime = performance.now();

  function animate() {
    requestAnimationFrame(animate);

    if ((config.mode === 'autoplay' || config.mode === 'loop') && positionSpline && lookAtSpline) {
      const now = performance.now();
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      const duration = Math.max(config.keyframes.length * 2, 1);
      progress += (dt * config.speed) / duration;

      if (progress >= 1) {
        progress = config.mode === 'loop' || config.isLoop ? progress % 1 : 1;
      }

      const pos = positionSpline.getPoint(progress);
      const look = lookAtSpline.getPoint(progress);
      camera.position.copy(pos);
      camera.lookAt(look);
    }

    renderer.render(scene, camera);
  }
  animate();

  const ro = new ResizeObserver(() => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  });
  ro.observe(container as Element);
}

(globalThis as Record<string, unknown>).Web3DWidget = { init };

export { init };
