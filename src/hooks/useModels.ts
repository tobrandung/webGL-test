import { useCallback, useEffect, useState } from 'react';
import { getDB, generateId, type ModelEntry } from '@/lib/db';

export function useModels(projectId: string) {
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const db = await getDB();
    const all = await db.getAllFromIndex('models', 'by-project', projectId);
    setModels(all);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const addModel = useCallback(
    async (file: File, name?: string): Promise<ModelEntry> => {
      const db = await getDB();
      const id = generateId();
      const buffer = await file.arrayBuffer();

      const entry: ModelEntry = {
        id,
        projectId,
        name: name ?? file.name.replace(/\.[^.]+$/, ''),
        fileName: file.name,
        fileSize: file.size,
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        createdAt: Date.now(),
      };

      const tx = db.transaction(['models', 'blobs'], 'readwrite');
      await tx.objectStore('models').put(entry);
      await tx.objectStore('blobs').put({ id, data: buffer });
      await tx.done;

      await load();
      return entry;
    },
    [projectId, load],
  );

  const updateModel = useCallback(
    async (id: string, updates: Partial<Omit<ModelEntry, 'id' | 'projectId' | 'createdAt'>>) => {
      const db = await getDB();
      const existing = await db.get('models', id);
      if (!existing) return;
      await db.put('models', { ...existing, ...updates });
      await load();
    },
    [load],
  );

  const deleteModel = useCallback(
    async (id: string) => {
      const db = await getDB();
      const tx = db.transaction(['models', 'blobs'], 'readwrite');
      await tx.objectStore('models').delete(id);
      await tx.objectStore('blobs').delete(id);
      await tx.done;
      await load();
    },
    [load],
  );

  const getModelBlob = useCallback(async (id: string): Promise<ArrayBuffer | null> => {
    const db = await getDB();
    const blob = await db.get('blobs', id);
    return blob?.data ?? null;
  }, []);

  return { models, loading, addModel, updateModel, deleteModel, getModelBlob };
}
