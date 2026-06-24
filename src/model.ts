import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

export type ModelColor = 'default' | 'gold' | 'red';

type BodyMeshEntry = {
  mesh: THREE.Mesh;
  originalMaterial: THREE.Material;
};

let bodyMeshes: BodyMeshEntry[] = [];
let modelGroup: THREE.Group | null = null;

const BODY_KEYWORDS = ['paint', 'body', 'car', 'karosserie', 'exterior', 'shell', 'hood', 'fender', 'door'];
const EXCLUDE_KEYWORDS = ['glass', 'window', 'tire', 'tyre', 'wheel', 'rim', 'rubber', 'chrome', 'interior', 'seat', 'light', 'lens'];
const GROUND_KEYWORDS = ['floor', 'ground', 'plane', 'shadow_plane', 'shadow', 'backdrop', 'bg'];

function isBodyMaterial(name: string): boolean {
  const lower = name.toLowerCase();
  if (EXCLUDE_KEYWORDS.some(kw => lower.includes(kw))) return false;
  if (BODY_KEYWORDS.some(kw => lower.includes(kw))) return true;
  return false;
}

function isGroundPlane(mesh: THREE.Mesh): boolean {
  const geo = mesh.geometry;
  if (!geo) return false;
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  if (!bb) return false;
  const sizeY = bb.max.y - bb.min.y;
  const sizeX = bb.max.x - bb.min.x;
  const sizeZ = bb.max.z - bb.min.z;
  return sizeY < 0.01 && sizeX > 2 && sizeZ > 2;
}

export function loadModel(
  scene: THREE.Scene,
  onProgress?: (progress: number) => void
): Promise<THREE.Group> {
  return new Promise((resolve, reject) => {
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');

    const gltfLoader = new GLTFLoader();
    gltfLoader.setDRACOLoader(dracoLoader);

    gltfLoader.load(
      '/assets/porsche-911.glb',
      (gltf) => {
        const model = gltf.scene;

        // Bounding box berechnen im Original-Zustand
        const box = new THREE.Box3().setFromObject(model);
        const center = new THREE.Vector3();
        const size = new THREE.Vector3();
        box.getCenter(center);
        box.getSize(size);

        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 3 / maxDim;

        // Wrapper-Group fuer saubere Zentrierung
        const wrapper = new THREE.Group();
        wrapper.add(model);

        // Modell innerhalb der Group verschieben, sodass es zentriert ist
        model.position.set(-center.x, -center.y, -center.z);
        wrapper.scale.setScalar(scale);

        bodyMeshes = [];
        let largestMesh: THREE.Mesh | null = null;
        let largestArea = 0;

        model.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            const meshName = (child.name || '').toLowerCase();
            const matName = ((child.material as THREE.Material)?.name || '').toLowerCase();
            const combinedName = `${meshName} ${matName}`;

            // Ground-Plane-Meshes ausblenden
            if (GROUND_KEYWORDS.some(kw => combinedName.includes(kw)) || isGroundPlane(child)) {
              child.visible = false;
              return;
            }

            child.castShadow = true;
            child.receiveShadow = true;

            const mat = child.material;
            if (mat && 'map' in mat && mat.map) {
              mat.map.colorSpace = THREE.SRGBColorSpace;
            }

            const material = mat as THREE.Material;
            const name = material.name || child.name || '';

            if (isBodyMaterial(name)) {
              bodyMeshes.push({ mesh: child, originalMaterial: material.clone() });
            } else {
              const geo = child.geometry;
              if (geo) {
                geo.computeBoundingSphere();
                const radius = geo.boundingSphere?.radius ?? 0;
                if (radius > largestArea) {
                  largestArea = radius;
                  largestMesh = child;
                }
              }
            }
          }
        });

        if (bodyMeshes.length === 0 && largestMesh) {
          const mat = (largestMesh as THREE.Mesh).material as THREE.Material;
          bodyMeshes.push({ mesh: largestMesh, originalMaterial: mat.clone() });
        }

        scene.add(wrapper);
        modelGroup = wrapper;
        resolve(wrapper);
      },
      (event) => {
        if (event.lengthComputable && onProgress) {
          onProgress(event.loaded / event.total);
        }
      },
      (error) => {
        reject(error);
      }
    );
  });
}

export function setModelColor(color: ModelColor): void {
  bodyMeshes.forEach(({ mesh, originalMaterial }) => {
    if (color === 'default') {
      mesh.material = originalMaterial;
      return;
    }

    const params = color === 'gold'
      ? { color: 0xffd700, metalness: 0.9, roughness: 0.15, clearcoat: 1.0, clearcoatRoughness: 0.1 }
      : { color: 0xcc0000, metalness: 0.8, roughness: 0.2, clearcoat: 0.8, clearcoatRoughness: 0.15 };

    mesh.material = new THREE.MeshPhysicalMaterial(params);
  });
}

export function getModelGroup(): THREE.Group | null {
  return modelGroup;
}
