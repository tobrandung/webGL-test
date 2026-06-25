import * as THREE from 'three';
import { Timer } from 'three';

export type SceneContext = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  timer: Timer;
  keyLight: THREE.DirectionalLight;
  fillLight: THREE.DirectionalLight;
  rimLight: THREE.DirectionalLight;
  topLight: THREE.DirectionalLight;
  ambientLight: THREE.AmbientLight;
  hemiLight: THREE.HemisphereLight;
};

export function createScene(container: HTMLElement): SceneContext {
  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    35,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.set(0, 0.8, 5);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.8;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  container.appendChild(renderer.domElement);

  // Studio Key Light — von vorne-rechts-oben (Hauptlicht)
  const keyLight = new THREE.DirectionalLight(0xfff5e6, 4);
  keyLight.position.set(4, 8, 6);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.width = 2048;
  keyLight.shadow.mapSize.height = 2048;
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 50;
  keyLight.shadow.camera.left = -10;
  keyLight.shadow.camera.right = 10;
  keyLight.shadow.camera.top = 10;
  keyLight.shadow.camera.bottom = -10;
  keyLight.shadow.radius = 4;
  scene.add(keyLight);

  // Fill Light — von links-vorne (Schatten aufhellen)
  const fillLight = new THREE.DirectionalLight(0xe6f0ff, 2.5);
  fillLight.position.set(-6, 4, 4);
  scene.add(fillLight);

  // Rim/Back Light — von hinten (Kanten-Definition)
  const rimLight = new THREE.DirectionalLight(0xffffff, 2);
  rimLight.position.set(0, 3, -8);
  scene.add(rimLight);

  // Top Light — Overhead-Panel (gleichmaessige Aufhellung von oben)
  const topLight = new THREE.DirectionalLight(0xffffff, 2);
  topLight.position.set(0, 12, 0);
  scene.add(topLight);

  // Hemisphere Light — simuliert Umgebungslicht (Himmel/Boden)
  const hemiLight = new THREE.HemisphereLight(
    0xddeeff, // Himmel (kuehl-blau)
    0x1a1a1a, // Boden (gleich wie Background)
    1.5
  );
  scene.add(hemiLight);

  // Ambient — minimale Basis, damit nichts komplett schwarz ist
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
  scene.add(ambientLight);

  const timer = new Timer();

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { scene, camera, renderer, timer, keyLight, fillLight, rimLight, topLight, ambientLight, hemiLight };
}
