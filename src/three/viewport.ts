import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { ColladaLoader } from 'three/addons/loaders/ColladaLoader.js';

export type ViewportContext = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  orbitControls: OrbitControls;
  transformControls: TransformControls;
  models: Map<string, THREE.Group>;
  selectedModelId: string | null;
  dispose: () => void;
};

export type TransformMode = 'translate' | 'rotate' | 'scale';

const SUPPORTED_EXTENSIONS = ['.glb', '.gltf', '.fbx', '.obj', '.stl', '.dae', '.3ds'];

export function isSupportedModelFile(filename: string): boolean {
  const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
  return SUPPORTED_EXTENSIONS.includes(ext);
}

export function createViewport(
  canvas: HTMLCanvasElement,
  background: string,
  transparent: boolean,
): ViewportContext {
  const scene = new THREE.Scene();

  if (transparent) {
    scene.background = null;
  } else {
    scene.background = new THREE.Color(background);
  }

  const camera = new THREE.PerspectiveCamera(45, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
  camera.position.set(3, 2, 5);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: transparent });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;

  setupLighting(scene);

  const gridHelper = new THREE.GridHelper(20, 20, 0x444444, 0x222222);
  scene.add(gridHelper);

  const orbitControls = new OrbitControls(camera, canvas);
  orbitControls.enableDamping = true;
  orbitControls.dampingFactor = 0.08;

  const transformControls = new TransformControls(camera, canvas);
  transformControls.addEventListener('dragging-changed', (event) => {
    orbitControls.enabled = !event.value;
  });
  scene.add(transformControls.getHelper());

  const models = new Map<string, THREE.Group>();
  let animationId = 0;
  let disposed = false;

  function animate() {
    if (disposed) return;
    animationId = requestAnimationFrame(animate);
    orbitControls.update();
    renderer.render(scene, camera);
  }
  animate();

  function handleResize() {
    if (disposed) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }
  const resizeObserver = new ResizeObserver(handleResize);
  resizeObserver.observe(canvas);

  return {
    scene,
    camera,
    renderer,
    orbitControls,
    transformControls,
    models,
    selectedModelId: null,
    dispose() {
      disposed = true;
      cancelAnimationFrame(animationId);
      resizeObserver.disconnect();
      transformControls.dispose();
      orbitControls.dispose();
      renderer.dispose();
    },
  };
}

function setupLighting(scene: THREE.Scene) {
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
  scene.add(ambientLight);

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
  keyLight.position.set(5, 8, 5);
  keyLight.castShadow = true;
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xb4c6e0, 0.6);
  fillLight.position.set(-3, 4, -2);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0xffd4a0, 0.5);
  rimLight.position.set(0, 3, -6);
  scene.add(rimLight);

  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x1a1a1a, 0.3);
  scene.add(hemiLight);
}

export async function loadModelFromBuffer(
  ctx: ViewportContext,
  id: string,
  buffer: ArrayBuffer,
  fileName: string,
  position: [number, number, number] = [0, 0, 0],
  rotation: [number, number, number] = [0, 0, 0],
  scale: [number, number, number] = [1, 1, 1],
): Promise<THREE.Group> {
  const ext = fileName.toLowerCase().slice(fileName.lastIndexOf('.'));
  let object: THREE.Object3D;

  switch (ext) {
    case '.glb':
    case '.gltf': {
      const loader = new GLTFLoader();
      const dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
      loader.setDRACOLoader(dracoLoader);
      const gltf = await loader.parseAsync(buffer, '');
      object = gltf.scene;
      dracoLoader.dispose();
      break;
    }
    case '.fbx': {
      const loader = new FBXLoader();
      object = loader.parse(buffer, '');
      break;
    }
    case '.obj': {
      const loader = new OBJLoader();
      const text = new TextDecoder().decode(buffer);
      object = loader.parse(text);
      break;
    }
    case '.stl': {
      const loader = new STLLoader();
      const geometry = loader.parse(buffer);
      const material = new THREE.MeshStandardMaterial({ color: 0x808080 });
      object = new THREE.Mesh(geometry, material);
      break;
    }
    case '.dae': {
      const loader = new ColladaLoader();
      const text = new TextDecoder().decode(buffer);
      const collada = loader.parse(text, '');
      if (!collada) throw new Error('Failed to parse Collada file');
      object = collada.scene;
      break;
    }
    default:
      throw new Error(`Unsupported format: ${ext}`);
  }

  const wrapper = new THREE.Group();
  wrapper.add(object);
  wrapper.name = id;

  const box = new THREE.Box3().setFromObject(wrapper);
  const center = box.getCenter(new THREE.Vector3());
  object.position.sub(center);

  wrapper.position.set(...position);
  wrapper.rotation.set(...rotation);
  wrapper.scale.set(...scale);

  ctx.scene.add(wrapper);
  ctx.models.set(id, wrapper);

  return wrapper;
}

export function selectModel(ctx: ViewportContext, id: string | null) {
  ctx.selectedModelId = id;
  if (!id) {
    ctx.transformControls.detach();
    return;
  }
  const model = ctx.models.get(id);
  if (model) {
    ctx.transformControls.attach(model);
  }
}

export function setTransformMode(ctx: ViewportContext, mode: TransformMode) {
  ctx.transformControls.setMode(mode);
}

export function removeModel(ctx: ViewportContext, id: string) {
  const model = ctx.models.get(id);
  if (model) {
    ctx.transformControls.detach();
    ctx.scene.remove(model);
    ctx.models.delete(id);
  }
}

export function updateBackground(ctx: ViewportContext, color: string, transparent: boolean) {
  if (transparent) {
    ctx.scene.background = null;
    ctx.renderer.setClearColor(0x000000, 0);
  } else {
    ctx.scene.background = new THREE.Color(color);
  }
}
