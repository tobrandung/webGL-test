import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { ColladaLoader } from 'three/addons/loaders/ColladaLoader.js';
import {
  syncLights,
  applyEnvironment,
  EMPTY_ENVIRONMENT,
  type LightRecord,
  type EnvironmentState,
  type EnvironmentOptions,
} from './lighting';
import type { LightEntry } from '@/lib/db';

export type SelectionKind = 'model' | 'light';

export type ViewportContext = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  orbitControls: OrbitControls;
  transformControls: TransformControls;
  models: Map<string, THREE.Group>;
  lights: Map<string, LightRecord>;
  environmentState: EnvironmentState;
  selectedModelId: string | null;
  selectedId: string | null;
  selectedKind: SelectionKind | null;
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
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;

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
  const lights = new Map<string, LightRecord>();
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
    lights,
    environmentState: EMPTY_ENVIRONMENT,
    selectedModelId: null,
    selectedId: null,
    selectedKind: null,
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

/** Reconciles the editor scene lights with the given entries (with helpers). */
export function applyViewportLights(ctx: ViewportContext, entries: LightEntry[]) {
  syncLights(ctx.scene, entries, ctx.lights, { helpers: true });
}

/** Applies (or clears) the equirect environment for the editor viewport. */
export function setViewportEnvironment(
  ctx: ViewportContext,
  texture: THREE.Texture | null,
  options: EnvironmentOptions,
) {
  ctx.environmentState = applyEnvironment(ctx.scene, ctx.renderer, texture, options, ctx.environmentState);
}

/**
 * Renders one fresh frame and returns a downscaled JPEG data URL for use as a
 * project card thumbnail. The read must happen synchronously right after
 * `render()` because the WebGL drawing buffer is not preserved between frames.
 */
export function captureThumbnail(ctx: ViewportContext, width = 320, height = 180): string {
  ctx.renderer.render(ctx.scene, ctx.camera);
  const source = ctx.renderer.domElement;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const c2d = canvas.getContext('2d');
  if (!c2d) return '';
  // Flatten onto a solid backdrop so transparent scenes don't become pure black.
  c2d.fillStyle = '#0f0f11';
  c2d.fillRect(0, 0, width, height);
  c2d.drawImage(source, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', 0.72);
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

/** Unified selection for models and lights; attaches the transform gizmo. */
export function selectObject(ctx: ViewportContext, id: string | null, kind: SelectionKind | null) {
  ctx.selectedId = id;
  ctx.selectedKind = id ? kind : null;
  ctx.selectedModelId = kind === 'model' ? id : null;

  if (!id || !kind) {
    ctx.transformControls.detach();
    return;
  }

  if (kind === 'model') {
    const model = ctx.models.get(id);
    if (model) ctx.transformControls.attach(model);
    return;
  }

  const record = ctx.lights.get(id);
  if (record && !(record.light instanceof THREE.AmbientLight)) {
    // Lights only support translation; direction derives from position -> target.
    ctx.transformControls.setMode('translate');
    ctx.transformControls.attach(record.light);
  } else {
    ctx.transformControls.detach();
  }
}

export function selectModel(ctx: ViewportContext, id: string | null) {
  selectObject(ctx, id, id ? 'model' : null);
}

export function setTransformMode(ctx: ViewportContext, mode: TransformMode) {
  // Lights are translate-only; ignore rotate/scale while a light is selected.
  if (ctx.selectedKind === 'light' && mode !== 'translate') return;
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
