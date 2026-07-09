import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export type Vec3 = [number, number, number];

export type ProjectSettings = {
  background: string;
  transparent: boolean;
};

export type LightType = 'ambient' | 'directional' | 'point' | 'spot';

export type LightEntry = {
  id: string;
  name: string;
  type: LightType;
  /** Hex color string, e.g. "#ffffff". */
  color: string;
  intensity: number;
  /** World position. Ignored for ambient lights. */
  position: Vec3;
  /** Aim point for directional/spot lights. */
  target?: Vec3;
  /** Range for point/spot lights (0 = infinite). */
  distance?: number;
  /** Physical falloff for point/spot lights. */
  decay?: number;
  /** Cone angle in radians for spot lights. */
  angle?: number;
  /** Soft cone edge (0-1) for spot lights. */
  penumbra?: number;
  visible?: boolean;
  order?: number;
};

export type EnvironmentConfig = {
  /** Key into the `blobs` store holding the equirectangular image. */
  blobId: string;
  fileName: string;
  /** Render the image as the visible scene background (dome). */
  showBackground: boolean;
  /** Use the image as IBL reflection source (scene.environment). */
  useForReflection: boolean;
  /** Global environment/background intensity. */
  intensity: number;
  /** Optional background blur (0-1) when shown as background. */
  blurriness?: number;
};

export type ModelEntry = {
  id: string;
  projectId: string;
  name: string;
  fileName: string;
  fileSize: number;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  createdAt: number;
  /** Display order in the scene outliner (ascending). Older records may lack it. */
  order?: number;
  /** Id of the containing outliner group, or null/undefined when ungrouped. */
  groupId?: string | null;
};

export type SceneGroup = {
  id: string;
  name: string;
  collapsed: boolean;
  order: number;
};

export type KeyframeData = {
  position: [number, number, number];
  lookAt: [number, number, number];
};

export type CameraPath = {
  keyframes: KeyframeData[];
  isLoop: boolean;
  speed: number;
};

export type Project = {
  id: string;
  name: string;
  thumbnail: string;
  settings: ProjectSettings;
  cameraPath: CameraPath;
  createdAt: number;
  updatedAt: number;
  /** Scene outliner groups (flat, single level). Older projects may lack it. */
  groups?: SceneGroup[];
  /** Placed light sources. Older projects lack it and get seeded defaults. */
  lights?: LightEntry[];
  /** Optional single equirectangular environment for reflections/background. */
  environment?: EnvironmentConfig | null;
};

interface Web3DStudioDB extends DBSchema {
  projects: {
    key: string;
    value: Project;
    indexes: { 'by-updated': number };
  };
  models: {
    key: string;
    value: ModelEntry;
    indexes: { 'by-project': string };
  };
  blobs: {
    key: string;
    value: { id: string; data: ArrayBuffer };
  };
}

let dbInstance: IDBPDatabase<Web3DStudioDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<Web3DStudioDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<Web3DStudioDB>('web3d-studio', 1, {
    upgrade(db) {
      const projectStore = db.createObjectStore('projects', { keyPath: 'id' });
      projectStore.createIndex('by-updated', 'updatedAt');

      const modelStore = db.createObjectStore('models', { keyPath: 'id' });
      modelStore.createIndex('by-project', 'projectId');

      db.createObjectStore('blobs', { keyPath: 'id' });
    },
  });

  return dbInstance;
}

export function generateId(): string {
  return crypto.randomUUID();
}
