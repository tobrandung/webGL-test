import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as THREE from 'three';
import { getDB, type Project, type ModelEntry } from '@/lib/db';
import { useModels } from '@/hooks/useModels';
import { useHistory, type Command } from '@/hooks/useHistory';
import {
  createViewport,
  loadModelFromBuffer,
  selectModel,
  setTransformMode,
  removeModel,
  type ViewportContext,
  type TransformMode,
} from '@/three/viewport';
import { EditorToolbar } from '@/components/EditorToolbar';
import { ModelUploadDialog } from '@/components/ModelUploadDialog';
import { KeyframeEditor } from '@/components/KeyframeEditor';
import { ExportDialog } from '@/components/ExportDialog';
import { SceneOutliner } from '@/components/SceneOutliner';
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
  const [showKeyframeEditor, setShowKeyframeEditor] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [keyframes, setKeyframes] = useState<Keyframe[]>([]);
  const [isLoop, setIsLoop] = useState(true);
  const [cameraSpeed, setCameraSpeed] = useState(1);
  const [isDirty, setIsDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'dirty'>('saved');
  const [outlinerCollapsed, setOutlinerCollapsed] = useState(false);
  const [visibilityMap, setVisibilityMap] = useState<Record<string, boolean>>({});
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);

  const clipboardRef = useRef<{ model: ModelEntry; blobId: string } | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const history = useHistory();
  const { models, addModel, updateModel, deleteModel, getModelBlob } = useModels(id ?? '');

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
    })();
  }, [id, navigate]);

  // Init viewport
  useEffect(() => {
    if (!canvasRef.current || !project) return;
    const ctx = createViewport(canvasRef.current, project.settings.background, project.settings.transparent);
    viewportRef.current = ctx;

    ctx.transformControls.addEventListener('objectChange', () => {
      markDirty();
    });

    return () => ctx.dispose();
  }, [project]);

  // Load models into viewport
  useEffect(() => {
    const ctx = viewportRef.current;
    if (!ctx || !models.length) return;
    (async () => {
      for (const model of models) {
        if (ctx.models.has(model.id)) continue;
        const buffer = await getModelBlob(model.id);
        if (!buffer) continue;
        await loadModelFromBuffer(ctx, model.id, buffer, model.fileName, model.position, model.rotation, model.scale);
      }
    })();
  }, [models, getModelBlob]);

  // Auto-save
  const markDirty = useCallback(() => {
    setIsDirty(true);
    setSaveStatus('dirty');
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      performSave();
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

    // Save camera path
    await db.put('projects', {
      ...project,
      cameraPath: { keyframes, isLoop, speed: cameraSpeed },
      updatedAt: Date.now(),
    });

    setSaveStatus('saved');
    setIsDirty(false);
  }, [id, project, keyframes, isLoop, cameraSpeed, updateModel]);

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
          if (selectedId) {
            deleteSelectedWithHistory();
          }
          break;
        case 'escape':
          selectModel(ctx, null);
          setSelectedId(null);
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

  const handleOutlinerSelect = useCallback((modelId: string | null) => {
    const ctx = viewportRef.current;
    if (!ctx) return;
    selectModel(ctx, modelId);
    setSelectedId(modelId);
  }, []);

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
      if (selectedId === modelId) setSelectedId(null);
      markDirty();
    },
    [deleteModel, selectedId, markDirty],
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
        selectModel(ctx, obj.name);
        setSelectedId(obj.name);
        return;
      }
    }
    selectModel(ctx, null);
    setSelectedId(null);
  }, []);

  const handleUpload = useCallback(
    async (file: File, _compress: boolean, _quality: number) => {
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
        onOpenKeyframeEditor={() => setShowKeyframeEditor(!showKeyframeEditor)}
        onExport={() => setShowExportDialog(true)}
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
        selectedId={selectedId}
        visibilityMap={visibilityMap}
        onSelect={handleOutlinerSelect}
        onToggleVisibility={handleToggleVisibility}
        onRename={handleOutlinerRename}
        onDuplicate={handleOutlinerDuplicate}
        onDelete={handleOutlinerDelete}
        collapsed={outlinerCollapsed}
        onToggleCollapse={() => setOutlinerCollapsed(!outlinerCollapsed)}
      />
      <canvas
        ref={canvasRef}
        className="h-full w-full"
        onClick={handleModelClick}
      />
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
      <ExportDialog open={showExportDialog} onOpenChange={setShowExportDialog} project={project} />

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
