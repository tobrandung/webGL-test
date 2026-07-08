import { useState, useCallback, useEffect } from 'react';
import { Copy, Check, Download, AlertTriangle, FolderDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { getDB, type Project, type ModelEntry } from '@/lib/db';
import { slugify } from '@/lib/utils';

type ExportMode = 'scroll' | 'autoplay' | 'loop';

type ExportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project | null;
};

// Minimal File System Access API typings (not in the DOM lib for our target).
type FsWritable = { write: (data: BufferSource | Blob) => Promise<void>; close: () => Promise<void> };
type FsFileHandle = { createWritable: () => Promise<FsWritable> };
type FsDirHandle = {
  getDirectoryHandle: (name: string, opts?: { create?: boolean }) => Promise<FsDirHandle>;
  getFileHandle: (name: string, opts?: { create?: boolean }) => Promise<FsFileHandle>;
};
type DirectoryPicker = (opts?: { mode?: 'read' | 'readwrite' }) => Promise<FsDirHandle>;

const supportsFsAccess = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

function fileExtension(fileName: string): string {
  const idx = fileName.lastIndexOf('.');
  return idx >= 0 ? fileName.slice(idx + 1).toLowerCase() : 'glb';
}

export function ExportDialog({ open, onOpenChange, project }: ExportDialogProps) {
  const [exportMode, setExportMode] = useState<ExportMode>('scroll');
  const [transparent, setTransparent] = useState(false);
  const [copied, setCopied] = useState(false);
  const [owner, setOwner] = useState('tobrandung');
  const [repo, setRepo] = useState('webGL-test');
  const [branch, setBranch] = useState('main');
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [savingFolder, setSavingFolder] = useState(false);
  const [folderStatus, setFolderStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !project) return;
    (async () => {
      const db = await getDB();
      const all = await db.getAllFromIndex('models', 'by-project', project.id);
      setModels(all);
    })();
  }, [open, project]);

  const projectSlug = project ? slugify(project.name) : '';
  const baseUrl = `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${branch}`;
  const scriptUrl = `${baseUrl}/dist-widget/web3d-widget.iife.js?v=2`;
  const modelFileName = (m: ModelEntry) => `${m.id}.${fileExtension(m.fileName)}`;
  const modelPath = (m: ModelEntry) => `${baseUrl}/dist-widget/models/${projectSlug}/${modelFileName(m)}`;

  const getEmbedCode = useCallback(() => {
    if (!project) return '';

    const mappedModels = models.map((m) => ({
      url: modelPath(m),
      position: m.position,
      rotation: m.rotation,
      scale: m.scale,
    }));

    const config: Record<string, unknown> = {
      mode: exportMode,
      transparent,
      background: transparent ? 'transparent' : project.settings.background,
      keyframes: project.cameraPath.keyframes,
      isLoop: exportMode === 'loop' || project.cameraPath.isLoop,
      speed: project.cameraPath.speed,
      models: mappedModels,
    };

    // Rückwärtskompatibel: ältere Widget-Builds auf jsDelivr lesen nur modelUrl.
    if (mappedModels.length === 1) {
      config.modelUrl = mappedModels[0].url;
    }

    const configStr = JSON.stringify(config);

    const markup =
      exportMode === 'scroll'
        ? `<!-- Web3D Studio Widget (Scroll) -->
<div id="web3d-widget-track" style="position:relative;height:300vh;">
  <div id="web3d-widget" style="position:sticky;top:0;width:100%;height:100vh;overflow:hidden;"></div>
</div>`
        : `<!-- Web3D Studio Widget -->
<div id="web3d-widget" style="width:100%;height:100vh;"></div>`;

    return `${markup}
<script>
(function () {
  var config = ${configStr};
  function boot() {
    if (!window.Web3DWidget) {
      console.error('[Web3DWidget] Script nicht geladen. jsDelivr liefert nur aus öffentlichen GitHub-Repos – Repo public machen oder Dateien woanders hosten.');
      return;
    }
    Web3DWidget.init('#web3d-widget', config);
  }
  var existing = document.querySelector('script[data-web3d-widget]');
  if (existing) { existing.addEventListener('load', boot); return; }
  var s = document.createElement('script');
  s.src = '${scriptUrl}';
  s.async = false;
  s.setAttribute('data-web3d-widget', '1');
  s.onload = boot;
  s.onerror = function () {
    console.error('[Web3DWidget] Script-URL nicht erreichbar:', s.src);
  };
  document.head.appendChild(s);
})();
<\/script>`;
  }, [project, exportMode, transparent, models, scriptUrl, baseUrl]);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(getEmbedCode());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [getEmbedCode]);

  const downloadModel = useCallback(async (m: ModelEntry) => {
    const db = await getDB();
    const blob = await db.get('blobs', m.id);
    if (!blob) return;
    const url = URL.createObjectURL(new Blob([blob.data]));
    const a = document.createElement('a');
    a.href = url;
    a.download = modelFileName(m);
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const saveModelsToFolder = useCallback(async () => {
    if (!project || !models.length) return;
    setFolderStatus(null);
    setSavingFolder(true);
    try {
      const picker = (window as unknown as { showDirectoryPicker: DirectoryPicker }).showDirectoryPicker;
      const root = await picker({ mode: 'readwrite' });
      const projectDir = await root.getDirectoryHandle(projectSlug, { create: true });
      const db = await getDB();
      let count = 0;
      for (const m of models) {
        const blob = await db.get('blobs', m.id);
        if (!blob) continue;
        const handle = await projectDir.getFileHandle(modelFileName(m), { create: true });
        const writable = await handle.createWritable();
        await writable.write(new Blob([blob.data]));
        await writable.close();
        count += 1;
      }
      setFolderStatus(`${count} Modell(e) in „${projectSlug}/" gespeichert.`);
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return;
      setFolderStatus('Speichern fehlgeschlagen – nutze stattdessen den Einzel-Download.');
    } finally {
      setSavingFolder(false);
    }
  }, [project, models, projectSlug]);

  if (!project) return null;

  const hasEnoughKeyframes = project.cameraPath.keyframes.length >= 2;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Widget exportieren</DialogTitle>
          <DialogDescription>
            Generiere ein Embed-Snippet für Webflow, Slater oder dein eigenes Projekt.
          </DialogDescription>
        </DialogHeader>

        <div className="min-w-0 space-y-4">
          {!hasEnoughKeyframes && (
            <div className="flex items-start gap-2 rounded-md border border-orange-500/40 bg-orange-500/10 p-3 text-xs text-orange-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Dieses Projekt hat weniger als 2 Keyframes. Ohne Kamerafahrt bewegt sich die Kamera
                nicht. Erstelle zuerst im Keyframe-Editor mindestens 2 Keyframes.
              </span>
            </div>
          )}

          <div className="space-y-2">
            <Label>Modus</Label>
            <div className="flex gap-2">
              {(['scroll', 'autoplay', 'loop'] as ExportMode[]).map((m) => (
                <Button
                  key={m}
                  variant={exportMode === m ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setExportMode(m)}
                >
                  {m === 'scroll' ? 'Scroll' : m === 'autoplay' ? 'Autoplay' : 'Loop'}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="export-transparent">Transparenter Hintergrund</Label>
            <Switch id="export-transparent" checked={transparent} onCheckedChange={setTransparent} />
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>GitHub-Repo (für jsDelivr-Hosting)</Label>
            <div className="grid grid-cols-3 gap-2">
              <Input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="owner" />
              <Input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="repo" />
              <Input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="branch" />
            </div>
            <p className="text-xs text-muted-foreground">
              Script wird geladen von{' '}
              <code className="break-all text-foreground">{scriptUrl}</code>
            </p>
            <div className="flex items-start gap-2 rounded-md border border-orange-500/40 bg-orange-500/10 p-3 text-xs text-orange-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                jsDelivr kann nur aus <strong>öffentlichen</strong> GitHub-Repos laden. Ist dein Repo
                privat, bekommst du 404 und nichts wird angezeigt. Entweder Repo auf Public stellen
                oder Widget + Modelle in Webflow Assets hochladen und die URLs im Embed-Code anpassen.
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Modelle</Label>
              <span className="text-xs text-muted-foreground">
                {models.length} {models.length === 1 ? 'Modell' : 'Modelle'}
              </span>
            </div>

            {models.length > 0 && supportsFsAccess && (
              <div className="space-y-1">
                <Button
                  variant="default"
                  size="sm"
                  className="w-full"
                  disabled={savingFolder}
                  onClick={saveModelsToFolder}
                >
                  <FolderDown className="mr-2 h-4 w-4" />
                  {savingFolder ? 'Speichere…' : 'Modelle in Ordner speichern'}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Wähle deinen lokalen Ordner{' '}
                  <code className="text-foreground">dist-widget/models</code> – die Modelle werden
                  automatisch nach{' '}
                  <code className="break-all text-foreground">{projectSlug}/</code> geschrieben.
                </p>
                {folderStatus && (
                  <p className="text-xs text-green-400">{folderStatus}</p>
                )}
              </div>
            )}

            {models.length === 0 ? (
              <p className="text-xs text-muted-foreground">Keine Modelle im Projekt.</p>
            ) : (
              <div className="space-y-1">
                {models.map((m) => (
                  <div key={m.id} className="flex items-center gap-2 rounded-md bg-secondary px-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-xs">{m.name}</span>
                    <Button variant="ghost" size="sm" className="shrink-0" onClick={() => downloadModel(m)}>
                      <Download className="mr-1 h-3.5 w-3.5" />
                      {modelFileName(m)}
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {supportsFsAccess
                ? 'Alternativ einzeln herunterladen und '
                : 'Lade jedes Modell herunter und lege es '}
              im Repo unter{' '}
              <code className="break-all text-foreground">dist-widget/models/{projectSlug}/</code>{' '}
              ablegen. Danach committen &amp; pushen – jsDelivr liefert die Dateien aus.
            </p>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>Embed-Code</Label>
            <div className="relative min-w-0">
              <pre className="max-h-56 w-full overflow-auto rounded-lg bg-secondary p-4 pr-10 text-xs">
                <code>{getEmbedCode()}</code>
              </pre>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-2 top-2"
                onClick={handleCopy}
                aria-label="Code kopieren"
              >
                {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Schließen
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
