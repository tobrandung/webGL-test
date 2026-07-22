import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as THREE from 'three';
import {
  getDB,
  generateId,
  type Project,
  type ModelEntry,
  type SceneGroup,
  type LightEntry,
  type LightType,
  type EnvironmentConfig,
} from '@/lib/db';
import { useModels } from '@/hooks/useModels';
import { useHistory, type Command } from '@/hooks/useHistory';
import {
  createViewport,
  loadModelFromBuffer,
  selectObject,
  setTransformMode,
  removeModel,
  applyViewportLights,
  setViewportEnvironment,
  updateBackground,
  captureThumbnail,
  type ViewportContext,
  type TransformMode,
} from '@/three/viewport';
import { createDefaultLights, createLightEntry, loadEquirectTexture } from '@/three/lighting';
import { EditorToolbar } from '@/components/EditorToolbar';
import { ModelUploadDialog } from '@/components/ModelUploadDialog';
import { EnvironmentUploadDialog } from '@/components/EnvironmentUploadDialog';
import { PropertiesPanel } from '@/components/PropertiesPanel';
import { KeyframeEditor } from '@/components/KeyframeEditor';
import { ExportDialog } from '@/components/ExportDialog';
import { SceneOutliner, type OutlinerSelectionKind } from '@/components/SceneOutliner';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import type { Keyframe } from '@/three/camera-path';

export function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<ViewportContext | null>(null);

  const [project, setProject] = useState<Project | null>(null);
  const [transformModeState, setTransformModeState] = useState<TransformMode>('translate');
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showEnvDialog, setShowEnvDialog] = useState(false);
  const [showKeyframeEditor, setShowKeyframeEditor] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedKind, setSelectedKind] = useState<OutlinerSelectionKind | null>(null);
  const [keyframes, setKeyframes] = useState<Keyframe[]>([]);
  const [isLoop, setIsLoop] = useState(true);
  const [cameraSpeed, setCameraSpeed] = useState(1);
  const [isDirty, setIsDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'dirty'>('saved');
  const [outlinerCollapsed, setOutlinerCollapsed] = useState(false);
  const [visibilityMap, setVisibilityMap] = useState<Record<string, boolean>>({});
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [groups, setGroups] = useState<SceneGroup[]>([]);
  const [lights, setLights] = useState<LightEntry[]>([]);
  const [environment, setEnvironment] = useState<EnvironmentConfig | null>(null);
  const [background, setBackground] = useState('#1a1a1a');
  // The live viewport instance kept in state (not just the ref) so that effects
  // which populate it (models, lights, environment) re-run and target the exact
  // instance — critical under React StrictMode's mount/cleanup/mount cycle where
  // two viewports are briefly created on the same canvas.
  const [viewport, setViewport] = useState<ViewportContext | null>(null);

  const clipboardRef = useRef<{ model: ModelEntry; blobId: string } | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Always points at the latest performSave so the debounced auto-save doesn't
  // fire a stale closure (captured while `project` was still null → early return).
  const performSaveRef = useRef<(() => void) | null>(null);
  const selectionRef = useRef<{ id: string | null; kind: OutlinerSelectionKind | null }>({ id: null, kind: null });

  const history = useHistory();
  const { models, addModel, updateModel, deleteModel, getModelBlob, reorderModels } = useModels(id ?? '');

  // Load project
  useEffect(() => {
    if (!id) { navigate('/'); return; }
    (async () => {
      const db = await getDB();
      const p = await db.get('projects', id);
      if (!p) { navigate('/'); return; }
      setProject(p);
      setKeyframes(p.cameraPath.keyframes);
      setIsLoop(p.cameraPath.isLoop);
      setCameraSpeed(p.cameraPath.speed);
      setGroups(p.groups ?? []);
      // Seed default lights into state only (persisted lazily on first edit)
      // so untouched legacy projects are not marked dirty.
      setLights(p.lights && p.lights.length ? p.lights : createDefaultLights());
      setEnvironment(p.environment ?? null);
      setBackground(p.settings.background);
    })();
  }, [id, navigate]);

  // Init viewport
  useEffect(() => {
    if (!canvasRef.current || !project) return;
    const ctx = createViewport(canvasRef.current, project.settings.background, project.settings.transparent);
    viewportRef.current = ctx;
    setViewport(ctx);

    ctx.transformControls.addEventListener('objectChange', () => {
      // Read back a dragged light's position from the THREE object into state
      // so the properties panel and persistence stay in sync.
      const sel = selectionRef.current;
      if (sel.kind === 'light' && sel.id) {
        const record = ctx.lights.get(sel.id);
        if (record) {
          const p = record.light.position;
          setLights((prev) =>
            prev.map((l) => (l.id === sel.id ? { ...l, position: [p.x, p.y, p.z] } : l)),
          );
        }
      }
      markDirty();
    });

    return () => {
      ctx.dispose();
      if (viewportRef.current === ctx) viewportRef.current = null;
      setViewport((current) => (current === ctx ? null : current));
    };
  }, [project]);

  // Sync lights into the viewport whenever the light config or instance changes.
  useEffect(() => {
    if (!viewport) return;
    applyViewportLights(viewport, lights);
  }, [lights, viewport]);

  // Apply the solid background colour. A visible environment dome owns
  // `scene.background`, so skip while one is shown (the environment effect below
  // restores the solid colour when the dome is turned off).
  useEffect(() => {
    if (!viewport || environment?.showBackground) return;
    updateBackground(viewport, background, project?.settings.transparent ?? false);
  }, [background, viewport, project, environment]);

  // Mirror the latest background colour into a ref so the async environment
  // effect can restore it without re-running when only the colour changes.
  const backgroundRef = useRef(background);
  useEffect(() => {
    backgroundRef.current = background;
  }, [background]);

  // Load + apply the environment texture whenever the config or instance changes.
  useEffect(() => {
    const ctx = viewport;
    if (!ctx) return;
    let cancelled = false;

    const transparent = project?.settings.transparent ?? false;

    (async () => {
      if (!environment) {
        setViewportEnvironment(ctx, null, { showBackground: false, useForReflection: false, intensity: 1 });
        updateBackground(ctx, backgroundRef.current, transparent);
        return;
      }
      const db = await getDB();
      const blob = await db.get('blobs', environment.blobId);
      if (!blob || cancelled) return;
      const texture = await loadEquirectTexture(new Blob([blob.data]), environment.fileName);
      if (cancelled) {
        texture.dispose();
        return;
      }
      setViewportEnvironment(ctx, texture, {
        showBackground: environment.showBackground,
        useForReflection: environment.useForReflection,
        intensity: environment.intensity,
        blurriness: environment.blurriness,
      });
      // The dome owns scene.background only while shown; otherwise restore the
      // solid colour the environment application may have cleared.
      if (!environment.showBackground) {
        updateBackground(ctx, backgroundRef.current, transparent);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [environment, viewport, project]);

  // Load models into the viewport. Keyed on the `viewport` instance so models
  // fetched from IndexedDB before the viewport exists (or after it is recreated)
  // are loaded into the *live* instance — otherwise reopening a project, or the
  // StrictMode remount, leaves the async load targeting a discarded viewport and
  // the scene appears empty. The cleanup cancels an in-flight load on swap.
  useEffect(() => {
    if (!viewport || !models.length) return;
    let cancelled = false;
    (async () => {
      for (const model of models) {
        if (cancelled) return;
        if (viewport.models.has(model.id)) continue;
        const buffer = await getModelBlob(model.id);
        if (cancelled) return;
        if (!buffer) continue;
        await loadModelFromBuffer(
          viewport,
          model.id,
          buffer,
          model.fileName,
          model.position,
          model.rotation,
          model.scale,
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [viewport, models, getModelBlob]);

  // Auto-save
  const markDirty = useCallback(() => {
    setIsDirty(true);
    setSaveStatus('dirty');
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      performSaveRef.current?.();
    }, 3000);
  }, []);

  const performSave = useCallback(async () => {
    if (!id || !project) return;
    setSaveStatus('saving');
    const db = await getDB();
    const ctx = viewportRef.current;

    // Save model transforms
    if (ctx) {
      for (const [modelId, group] of ctx.models.entries()) {
        await updateModel(modelId, {
          position: [group.position.x, group.position.y, group.position.z],
          rotation: [group.rotation.x, group.rotation.y, group.rotation.z],
          scale: [group.scale.x, group.scale.y, group.scale.z],
        });
      }
    }

    // Read back live light positions from the viewport before persisting.
    let lightsToSave = lights;
    if (ctx) {
      lightsToSave = lights.map((l) => {
        const record = ctx.lights.get(l.id);
        if (!record || record.light instanceof THREE.AmbientLight) return l;
        const p = record.light.position;
        return { ...l, position: [p.x, p.y, p.z] as [number, number, number] };
      });
    }

    // Capture a fresh viewport thumbnail (falls back to the existing one).
    // Not written back into `project` state to avoid re-triggering the
    // viewport-init effect (which keys on the `project` reference) on every save.
    const thumbnail = ctx ? captureThumbnail(ctx) : project.thumbnail;

    // Save camera path + outliner groups + lights + environment
    await db.put('projects', {
      ...project,
      thumbnail,
      settings: { ...project.settings, background },
      cameraPath: { keyframes, isLoop, speed: cameraSpeed },
      groups,
      lights: lightsToSave,
      environment,
      updatedAt: Date.now(),
    });

    setSaveStatus('saved');
    setIsDirty(false);
  }, [id, project, keyframes, isLoop, cameraSpeed, groups, lights, environment, background, updateModel]);

  useEffect(() => {
    performSaveRef.current = performSave;
  }, [performSave]);

  // Handle back navigation
  const handleBack = useCallback(() => {
    if (isDirty) {
      setShowLeaveDialog(true);
    } else {
      navigate('/');
    }
  }, [isDirty, navigate]);

  const handleSaveAndLeave = useCallback(async () => {
    await performSave();
    setShowLeaveDialog(false);
    navigate('/');
  }, [performSave, navigate]);

  const handleDiscardAndLeave = useCallback(() => {
    setShowLeaveDialog(false);
    navigate('/');
  }, [navigate]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const ctx = viewportRef.current;
      if (!ctx) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const isMeta = e.metaKey || e.ctrlKey;

      // Undo/Redo
      if (isMeta && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        history.undo();
        return;
      }
      if (isMeta && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        history.redo();
        return;
      }

      // Copy
      if (isMeta && e.key === 'c') {
        if (selectedId) {
          const model = models.find((m) => m.id === selectedId);
          if (model) {
            clipboardRef.current = { model, blobId: model.id };
          }
        }
        return;
      }

      // Paste
      if (isMeta && e.key === 'v') {
        e.preventDefault();
        pasteModel();
        return;
      }

      // Duplicate
      if (isMeta && e.key === 'd') {
        e.preventDefault();
        duplicateSelected();
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'g':
          setTransformModeState('translate');
          setTransformMode(ctx, 'translate');
          break;
        case 'r':
          setTransformModeState('rotate');
          setTransformMode(ctx, 'rotate');
          break;
        case 's':
          if (!isMeta) {
            setTransformModeState('scale');
            setTransformMode(ctx, 'scale');
          }
          break;
        case 'delete':
        case 'backspace':
          if (selectionRef.current.kind === 'light' && selectionRef.current.id) {
            handleDeleteLight(selectionRef.current.id);
          } else if (selectedId) {
            deleteSelectedWithHistory();
          }
          break;
        case 'escape':
          applySelection(null, null);
          break;
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, models, history]);

  const deleteSelectedWithHistory = useCallback(() => {
    const ctx = viewportRef.current;
    if (!ctx || !selectedId) return;
    const model = models.find((m) => m.id === selectedId);
    if (!model) return;

    const command: Command = {
      type: 'model:delete',
      label: `"${model.name}" löschen`,
      execute: () => {
        removeModel(ctx, model.id);
        deleteModel(model.id);
        setSelectedId(null);
      },
      undo: () => {
        (async () => {
          const buffer = await getModelBlob(model.id);
          if (buffer) {
            await addModel(new File([buffer], model.fileName), model.name);
          }
        })();
      },
    };
    history.execute(command);
    markDirty();
  }, [selectedId, models, history, deleteModel, getModelBlob, addModel, markDirty]);

  const pasteModel = useCallback(async () => {
    if (!clipboardRef.current) return;
    const { model, blobId } = clipboardRef.current;
    const buffer = await getModelBlob(blobId);
    if (!buffer) return;

    const file = new File([buffer], model.fileName);
    const newModel = await addModel(file, `${model.name} (Kopie)`);

    const ctx = viewportRef.current;
    if (ctx) {
      const group = ctx.models.get(newModel.id);
      if (group) {
        group.position.set(model.position[0] + 0.5, model.position[1], model.position[2] + 0.5);
      }
    }
    markDirty();
  }, [getModelBlob, addModel, markDirty]);

  const duplicateSelected = useCallback(async () => {
    if (!selectedId) return;
    const model = models.find((m) => m.id === selectedId);
    if (!model) return;

    const buffer = await getModelBlob(model.id);
    if (!buffer) return;

    const file = new File([buffer], model.fileName);
    const newModel = await addModel(file, `${model.name} (Kopie)`);

    const ctx = viewportRef.current;
    if (ctx) {
      const srcGroup = ctx.models.get(model.id);
      const dstGroup = ctx.models.get(newModel.id);
      if (srcGroup && dstGroup) {
        dstGroup.position.copy(srcGroup.position).add(new THREE.Vector3(0.5, 0, 0.5));
        dstGroup.rotation.copy(srcGroup.rotation);
        dstGroup.scale.copy(srcGroup.scale);
      }
    }
    markDirty();
  }, [selectedId, models, getModelBlob, addModel, markDirty]);

  const handleToggleVisibility = useCallback((modelId: string) => {
    const ctx = viewportRef.current;
    if (!ctx) return;
    const group = ctx.models.get(modelId);
    if (!group) return;
    const newVisible = !group.visible;
    group.visible = newVisible;
    setVisibilityMap((prev) => ({ ...prev, [modelId]: newVisible }));
  }, []);

  const applySelection = useCallback((id: string | null, kind: OutlinerSelectionKind | null) => {
    const ctx = viewportRef.current;
    selectionRef.current = { id, kind };
    setSelectedId(id);
    setSelectedKind(kind);
    if (!ctx) return;
    if (kind === 'model') {
      selectObject(ctx, id, 'model');
    } else if (kind === 'light') {
      selectObject(ctx, id, 'light');
    } else {
      // environment or cleared selection: no gizmo
      selectObject(ctx, null, null);
    }
  }, []);

  const handleOutlinerSelect = useCallback(
    (id: string | null, kind: OutlinerSelectionKind = 'model') => {
      applySelection(id, id ? kind : null);
    },
    [applySelection],
  );

  const handleOutlinerRename = useCallback(
    (modelId: string, name: string) => {
      updateModel(modelId, { name });
      markDirty();
    },
    [updateModel, markDirty],
  );

  const handleOutlinerDuplicate = useCallback(
    async (modelId: string) => {
      const model = models.find((m) => m.id === modelId);
      if (!model) return;
      const buffer = await getModelBlob(model.id);
      if (!buffer) return;
      const file = new File([buffer], model.fileName);
      await addModel(file, `${model.name} (Kopie)`);
      markDirty();
    },
    [models, getModelBlob, addModel, markDirty],
  );

  const handleOutlinerDelete = useCallback(
    (modelId: string) => {
      const ctx = viewportRef.current;
      if (!ctx) return;
      removeModel(ctx, modelId);
      deleteModel(modelId);
      if (selectedId === modelId) {
        setSelectedId(null);
        setSelectedKind(null);
        selectionRef.current = { id: null, kind: null };
      }
      markDirty();
    },
    [deleteModel, selectedId, markDirty],
  );

  const handleCreateGroup = useCallback(() => {
    setGroups((prev) => [
      ...prev,
      { id: generateId(), name: 'Neue Gruppe', collapsed: false, order: prev.length },
    ]);
    markDirty();
  }, [markDirty]);

  const handleRenameGroup = useCallback(
    (groupId: string, name: string) => {
      setGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, name } : g)));
      markDirty();
    },
    [markDirty],
  );

  const handleToggleGroupCollapsed = useCallback(
    (groupId: string) => {
      setGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, collapsed: !g.collapsed } : g)));
      markDirty();
    },
    [markDirty],
  );

  const handleDeleteGroup = useCallback(
    (groupId: string) => {
      const remaining = groups.filter((g) => g.id !== groupId).sort((a, b) => a.order - b.order);
      const flat: { id: string; order: number; groupId: string | null }[] = [];
      for (const g of remaining) {
        for (const m of models.filter((m) => m.groupId === g.id)) {
          flat.push({ id: m.id, order: flat.length, groupId: g.id });
        }
      }
      for (const m of models.filter((m) => !m.groupId || m.groupId === groupId)) {
        flat.push({ id: m.id, order: flat.length, groupId: null });
      }
      reorderModels(flat);
      setGroups(remaining.map((g, i) => ({ ...g, order: i })));
      markDirty();
    },
    [groups, models, reorderModels, markDirty],
  );

  const handleReorder = useCallback(
    (items: { id: string; groupId: string | null }[]) => {
      reorderModels(items.map((it, i) => ({ id: it.id, order: i, groupId: it.groupId })));
      markDirty();
    },
    [reorderModels, markDirty],
  );

  const handleAddLight = useCallback(
    (type: LightType) => {
      const entry = createLightEntry(type, lights.length);
      setLights((prev) => [...prev, entry]);
      applySelection(entry.id, 'light');
      markDirty();
    },
    [lights.length, applySelection, markDirty],
  );

  const handleUpdateLight = useCallback(
    (lightId: string, patch: Partial<LightEntry>) => {
      setLights((prev) => prev.map((l) => (l.id === lightId ? { ...l, ...patch } : l)));
      markDirty();
    },
    [markDirty],
  );

  const handleDeleteLight = useCallback(
    (lightId: string) => {
      setLights((prev) => prev.filter((l) => l.id !== lightId));
      if (selectedId === lightId) applySelection(null, null);
      markDirty();
    },
    [selectedId, applySelection, markDirty],
  );

  const handleToggleLightVisibility = useCallback(
    (lightId: string) => {
      setLights((prev) =>
        prev.map((l) => (l.id === lightId ? { ...l, visible: l.visible === false } : l)),
      );
      markDirty();
    },
    [markDirty],
  );

  const handleRenameLight = useCallback(
    (lightId: string, name: string) => {
      setLights((prev) => prev.map((l) => (l.id === lightId ? { ...l, name } : l)));
      markDirty();
    },
    [markDirty],
  );

  const handleEnvironmentUpload = useCallback(
    async (file: File) => {
      if (!id) return;
      const db = await getDB();
      const blobId = generateId();
      const buffer = await file.arrayBuffer();
      await db.put('blobs', { id: blobId, data: buffer });
      // Drop a previously stored environment blob to avoid orphans.
      if (environment?.blobId) await db.delete('blobs', environment.blobId).catch(() => {});
      setEnvironment({
        blobId,
        fileName: file.name,
        showBackground: false,
        useForReflection: true,
        intensity: 1,
        blurriness: 0,
      });
      applySelection('__environment__', 'environment');
      markDirty();
    },
    [id, environment, applySelection, markDirty],
  );

  const handleUpdateEnvironment = useCallback(
    (patch: Partial<EnvironmentConfig>) => {
      setEnvironment((prev) => (prev ? { ...prev, ...patch } : prev));
      markDirty();
    },
    [markDirty],
  );

  const handleRemoveEnvironment = useCallback(async () => {
    const current = environment;
    setEnvironment(null);
    if (selectedKind === 'environment') applySelection(null, null);
    if (current?.blobId) {
      const db = await getDB();
      await db.delete('blobs', current.blobId).catch(() => {});
    }
    markDirty();
  }, [environment, selectedKind, applySelection, markDirty]);

  const handleUpdateBackground = useCallback(
    (color: string) => {
      setBackground(color);
      markDirty();
    },
    [markDirty],
  );

  const handleTransformModeChange = useCallback((mode: TransformMode) => {
    setTransformModeState(mode);
    const ctx = viewportRef.current;
    if (ctx) setTransformMode(ctx, mode);
  }, []);

  const handleModelClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const ctx = viewportRef.current;
    if (!ctx || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, ctx.camera);

    const objects = Array.from(ctx.models.values());
    const intersects = raycaster.intersectObjects(objects, true);

    if (intersects.length > 0) {
      let obj: THREE.Object3D = intersects[0].object;
      while (obj.parent && !ctx.models.has(obj.name)) {
        obj = obj.parent;
      }
      if (ctx.models.has(obj.name)) {
        applySelection(obj.name, 'model');
        return;
      }
    }
    applySelection(null, null);
  }, [applySelection]);

  const handleUpload = useCallback(
    async (file: File) => {
      const newModel = await addModel(file);
      const command: Command = {
        type: 'model:add',
        label: `"${newModel.name}" hinzufügen`,
        execute: () => {},
        undo: () => {
          const ctx = viewportRef.current;
          if (ctx) removeModel(ctx, newModel.id);
          deleteModel(newModel.id);
        },
      };
      history.execute(command);
      markDirty();
    },
    [addModel, deleteModel, history, markDirty],
  );

  const handleKeyframesChange = useCallback(
    (newKeyframes: Keyframe[]) => {
      setKeyframes(newKeyframes);
      markDirty();
    },
    [markDirty],
  );

  if (!project) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Laden…</div>
      </div>
    );
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <EditorToolbar
        transformMode={transformModeState}
        onTransformModeChange={handleTransformModeChange}
        onAddModel={() => setShowUploadDialog(true)}
        onAddLight={handleAddLight}
        onAddEnvironment={() => setShowEnvDialog(true)}
        onOpenKeyframeEditor={() => setShowKeyframeEditor(!showKeyframeEditor)}
        onExport={async () => {
          await performSave();
          setShowExportDialog(true);
        }}
        onBack={handleBack}
        onUndo={history.undo}
        onRedo={history.redo}
        history={history}
        projectName={project.name}
        saveStatus={saveStatus}
        hasKeyframes={keyframes.length > 0}
      />
      <SceneOutliner
        models={models}
        groups={groups}
        lights={lights}
        environment={environment}
        background={background}
        selectedId={selectedId}
        selectedKind={selectedKind}
        visibilityMap={visibilityMap}
        onSelect={handleOutlinerSelect}
        onToggleVisibility={handleToggleVisibility}
        onRename={handleOutlinerRename}
        onDuplicate={handleOutlinerDuplicate}
        onDelete={handleOutlinerDelete}
        onToggleLightVisibility={handleToggleLightVisibility}
        onRenameLight={handleRenameLight}
        onDeleteLight={handleDeleteLight}
        onRemoveEnvironment={handleRemoveEnvironment}
        onCreateGroup={handleCreateGroup}
        onRenameGroup={handleRenameGroup}
        onDeleteGroup={handleDeleteGroup}
        onToggleGroupCollapsed={handleToggleGroupCollapsed}
        onReorder={handleReorder}
        collapsed={outlinerCollapsed}
        onToggleCollapse={() => setOutlinerCollapsed(!outlinerCollapsed)}
      />
      <canvas
        ref={canvasRef}
        className="h-full w-full"
        onClick={handleModelClick}
      />
      {(selectedKind === 'world' ||
        (selectedKind === 'light' && selectedId) ||
        (selectedKind === 'environment' && environment)) && (
        <PropertiesPanel
          light={selectedKind === 'light' ? lights.find((l) => l.id === selectedId) ?? null : null}
          environment={selectedKind === 'environment' ? environment : null}
          background={selectedKind === 'world' ? background : null}
          onUpdateLight={handleUpdateLight}
          onUpdateEnvironment={handleUpdateEnvironment}
          onReplaceEnvironment={() => setShowEnvDialog(true)}
          onUpdateBackground={handleUpdateBackground}
        />
      )}
      {showKeyframeEditor && (
        <KeyframeEditor
          viewportCtx={viewportRef.current}
          keyframes={keyframes}
          isLoop={isLoop}
          speed={cameraSpeed}
          onKeyframesChange={handleKeyframesChange}
          onLoopChange={(v) => { setIsLoop(v); markDirty(); }}
          onSpeedChange={(v) => { setCameraSpeed(v); markDirty(); }}
        />
      )}
      <ModelUploadDialog open={showUploadDialog} onOpenChange={setShowUploadDialog} onUpload={handleUpload} />
      <EnvironmentUploadDialog open={showEnvDialog} onOpenChange={setShowEnvDialog} onUpload={handleEnvironmentUpload} />
      <ExportDialog
        open={showExportDialog}
        onOpenChange={setShowExportDialog}
        project={{
          ...project,
          // Live-Weltfarbe mitgeben – sonst landet die zuletzt gespeicherte Farbe im Embed.
          settings: { ...project.settings, background },
          cameraPath: { keyframes, isLoop, speed: cameraSpeed },
          lights,
          environment,
        }}
      />

      <AlertDialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ungespeicherte Änderungen</AlertDialogTitle>
            <AlertDialogDescription>
              Du hast ungespeicherte Änderungen. Möchtest du speichern bevor du gehst?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <Button variant="destructive" onClick={handleDiscardAndLeave}>
              Verwerfen
            </Button>
            <AlertDialogAction onClick={handleSaveAndLeave}>
              Speichern & Verlassen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default EditorPage;
