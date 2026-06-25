import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export type ProjectSettings = {
  background: string;
  transparent: boolean;
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
