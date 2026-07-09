import { useState, useCallback, useEffect } from 'react';
import { Copy, Check, Download, AlertTriangle, FolderDown, Upload, Loader2 } from 'lucide-react';
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

/** Encodes an ArrayBuffer to base64 in chunks to avoid call-stack limits. */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function githubErrorMessage(res: Response): Promise<string> {
  try {
    const json = (await res.json()) as { message?: string };
    return json.message ?? res.statusText;
  } catch {
    return res.statusText;
  }
}

/**
 * Creates or updates a single file in a GitHub repo via the Contents API.
 * Fetches the existing blob sha first so updates don't fail with 409/422.
 * Returns the resulting commit SHA so callers can pin immutable CDN URLs.
 */
async function putFileToGitHub(params: {
  owner: string;
  repo: string;
  branch: string;
  path: string;
  data: ArrayBuffer;
  token: string;
  message: string;
}): Promise<string | undefined> {
  const { owner, repo, branch, path, data, token, message } = params;
  const encodedPath = path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  const api = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}`;
  const headers: HeadersInit = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  let sha: string | undefined;
  const getRes = await fetch(`${api}?ref=${encodeURIComponent(branch)}`, { headers });
  if (getRes.ok) {
    const json = (await getRes.json()) as { sha?: string };
    sha = json.sha;
  } else if (getRes.status !== 404) {
    throw new Error(`GET ${path}: ${getRes.status} – ${await githubErrorMessage(getRes)}`);
  }

  const putRes = await fetch(api, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ message, content: arrayBufferToBase64(data), branch, sha }),
  });
  if (!putRes.ok) {
    throw new Error(`PUT ${path}: ${putRes.status} – ${await githubErrorMessage(putRes)}`);
  }
  const putJson = (await putRes.json()) as { commit?: { sha?: string } };
  return putJson.commit?.sha;
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
  const [includeEnv, setIncludeEnv] = useState(true);
  const [envFolderStatus, setEnvFolderStatus] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadLog, setUploadLog] = useState<string[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // Commit SHA of the most recent GitHub upload. When set, embed URLs are pinned
  // to it (immutable → jsDelivr serves fresh content without cache purge).
  const [deployedSha, setDeployedSha] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !project) return;
    (async () => {
      const db = await getDB();
      const all = await db.getAllFromIndex('models', 'by-project', project.id);
      setModels(all);
    })();
  }, [open, project]);

  // Any change to the repo target or project invalidates a previously pinned
  // commit, so fall back to the branch until the user re-uploads.
  useEffect(() => {
    setDeployedSha(null);
  }, [owner, repo, branch, open, project]);

  const projectSlug = project ? slugify(project.name) : '';
  // Pin to the uploaded commit when available; otherwise track the branch.
  const ref = deployedSha ?? branch;
  const baseUrl = `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${ref}`;
  const rawBaseUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}`;
  // A commit-pinned script URL is immutable, so the cache-busting query is only
  // needed for the mutable @branch fallback.
  const scriptUrl = `${baseUrl}/dist-widget/web3d-widget.iife.js${deployedSha ? '' : '?v=2'}`;
  const modelFileName = (m: ModelEntry) => `${m.id}.${fileExtension(m.fileName)}`;
  // jsDelivr refuses GitHub files larger than 20 MiB (HTTP 403). Fall back to
  // raw.githubusercontent.com (CORS-enabled, 100 MB limit) for oversized assets.
  const JSDELIVR_MAX_BYTES = 20 * 1024 * 1024;
  const assetUrl = (repoPath: string, sizeBytes: number) =>
    sizeBytes > JSDELIVR_MAX_BYTES ? `${rawBaseUrl}/${repoPath}` : `${baseUrl}/${repoPath}`;
  const modelPath = (m: ModelEntry) =>
    assetUrl(`dist-widget/models/${projectSlug}/${modelFileName(m)}`, m.fileSize);
  const environment = project?.environment ?? null;
  const envFileName = environment ? `${environment.blobId}.${fileExtension(environment.fileName)}` : '';
  const envPath = `${baseUrl}/dist-widget/env/${projectSlug}/${envFileName}`;
  const oversizedModels = models.filter((m) => m.fileSize > JSDELIVR_MAX_BYTES);

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

    if (project.lights && project.lights.length) {
      config.lights = project.lights;
    }

    if (environment && includeEnv) {
      config.environment = {
        url: envPath,
        showBackground: environment.showBackground,
        useForReflection: environment.useForReflection,
        intensity: environment.intensity,
        blurriness: environment.blurriness,
      };
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
  }, [project, exportMode, transparent, models, scriptUrl, baseUrl, environment, includeEnv, envPath]);

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

  const downloadEnv = useCallback(async () => {
    if (!environment) return;
    const db = await getDB();
    const blob = await db.get('blobs', environment.blobId);
    if (!blob) return;
    const url = URL.createObjectURL(new Blob([blob.data]));
    const a = document.createElement('a');
    a.href = url;
    a.download = envFileName;
    a.click();
    URL.revokeObjectURL(url);
  }, [environment, envFileName]);

  const saveEnvToFolder = useCallback(async () => {
    if (!project || !environment) return;
    setEnvFolderStatus(null);
    try {
      const picker = (window as unknown as { showDirectoryPicker: DirectoryPicker }).showDirectoryPicker;
      const root = await picker({ mode: 'readwrite' });
      const projectDir = await root.getDirectoryHandle(projectSlug, { create: true });
      const db = await getDB();
      const blob = await db.get('blobs', environment.blobId);
      if (!blob) return;
      const handle = await projectDir.getFileHandle(envFileName, { create: true });
      const writable = await handle.createWritable();
      await writable.write(new Blob([blob.data]));
      await writable.close();
      setEnvFolderStatus(`Umgebung in „${projectSlug}/" gespeichert.`);
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return;
      setEnvFolderStatus('Speichern fehlgeschlagen – nutze stattdessen den Download.');
    }
  }, [project, environment, projectSlug, envFileName]);

  const uploadToGitHub = useCallback(async () => {
    if (!project || !token || !owner || !repo) return;
    setUploading(true);
    setUploadError(null);
    const log: string[] = [];
    setUploadLog([]);
    try {
      const db = await getDB();
      // Track the newest commit; the last upload's commit contains every prior
      // file plus the widget bundle, so pinning to it serves a consistent set.
      let lastSha: string | undefined;

      for (const m of models) {
        const blob = await db.get('blobs', m.id);
        if (!blob) continue;
        const path = `dist-widget/models/${projectSlug}/${modelFileName(m)}`;
        lastSha =
          (await putFileToGitHub({
            owner,
            repo,
            branch,
            path,
            data: blob.data,
            token,
            message: `Upload widget model ${modelFileName(m)}`,
          })) ?? lastSha;
        log.push(`OK  ${path}`);
        setUploadLog([...log]);
      }

      if (environment && includeEnv) {
        const blob = await db.get('blobs', environment.blobId);
        if (blob) {
          const path = `dist-widget/env/${projectSlug}/${envFileName}`;
          lastSha =
            (await putFileToGitHub({
              owner,
              repo,
              branch,
              path,
              data: blob.data,
              token,
              message: `Upload widget environment ${envFileName}`,
            })) ?? lastSha;
          log.push(`OK  ${path}`);
          setUploadLog([...log]);
        }
      }

      if (!log.length) {
        log.push('Nichts hochzuladen – kein Modell und keine Umgebung vorhanden.');
      } else if (lastSha) {
        setDeployedSha(lastSha);
        log.push(
          `Fertig. Embed-URLs auf Commit ${lastSha.slice(0, 7)} gepinnt – sofort live, kein Cache-Delay.`,
        );
        log.push('Wichtig: Embed-Code unten neu kopieren, damit der Pin greift.');
      } else {
        log.push('Fertig. jsDelivr cacht @main bis zu 12h – ggf. erneut einbetten.');
      }
      setUploadLog([...log]);
    } catch (err) {
      setUploadError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }, [project, token, owner, repo, branch, models, environment, includeEnv, projectSlug, envFileName]);

  if (!project) return null;

  const hasEnoughKeyframes = project.cameraPath.keyframes.length >= 2;
  const canUpload = Boolean(token && owner && repo) && (models.length > 0 || (environment && includeEnv));

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
            {deployedSha && (
              <p className="text-xs text-green-400">
                Auf Commit <code className="text-foreground">{deployedSha.slice(0, 7)}</code> gepinnt –
                unveränderliche URLs, kein jsDelivr-Cache-Problem.
              </p>
            )}
            <div className="flex items-start gap-2 rounded-md border border-orange-500/40 bg-orange-500/10 p-3 text-xs text-orange-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                jsDelivr kann nur aus <strong>öffentlichen</strong> GitHub-Repos laden. Ist dein Repo
                privat, bekommst du 404 und nichts wird angezeigt. Entweder Repo auf Public stellen
                oder Widget + Modelle in Webflow Assets hochladen und die URLs im Embed-Code anpassen.
              </span>
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label htmlFor="gh-token">Direkt nach GitHub hochladen</Label>
            <Input
              id="gh-token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="GitHub Personal Access Token"
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Token mit Schreibrecht auf <code className="text-foreground">Contents</code> (Fine-grained:
              „Contents: Read and write" für{' '}
              <code className="text-foreground">
                {owner}/{repo}
              </code>
              , oder Classic-Token mit <code className="text-foreground">repo</code>-Scope). Der Token wird
              nur im Browser verwendet und nirgends gespeichert.
            </p>

            <Button
              variant="default"
              size="sm"
              className="w-full"
              disabled={!canUpload || uploading}
              onClick={uploadToGitHub}
            >
              {uploading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              {uploading
                ? 'Lade hoch…'
                : `Nach ${owner}/${repo} hochladen (Modelle${environment && includeEnv ? ' + HDRI' : ''})`}
            </Button>

            {uploadLog.length > 0 && (
              <pre className="max-h-32 overflow-auto rounded-md bg-secondary p-2 text-[11px] text-green-400">
                {uploadLog.join('\n')}
              </pre>
            )}
            {uploadError && (
              <div className="flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Upload fehlgeschlagen: {uploadError}</span>
              </div>
            )}
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

            {oversizedModels.length > 0 && (
              <div className="flex items-start gap-2 rounded-md border border-orange-500/40 bg-orange-500/10 p-3 text-xs text-orange-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {oversizedModels.length === 1 ? 'Ein Modell ist' : `${oversizedModels.length} Modelle sind`}{' '}
                  größer als 20&nbsp;MiB und werden von jsDelivr mit 403 abgelehnt. Der Embed-Code lädt
                  diese daher über <code className="text-foreground">raw.githubusercontent.com</code>{' '}
                  (funktioniert, ist aber kein CDN). Für schnelleres Laden das GLB komprimieren (Draco /
                  Texturen), damit es unter 20&nbsp;MiB kommt.
                </span>
              </div>
            )}
          </div>

          {environment && (
            <>
              <Separator />
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="export-include-env">HDRI / Umgebung einbeziehen</Label>
                  <Switch id="export-include-env" checked={includeEnv} onCheckedChange={setIncludeEnv} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {environment.showBackground
                    ? 'Wird als Hintergrund und Spiegelung eingebettet.'
                    : 'Transparenter Hintergrund, Spiegelung im Modell bleibt erhalten.'}
                </p>

                {includeEnv && (
                  <>
                    <div className="flex items-center gap-2 rounded-md bg-secondary px-3 py-2">
                      <span className="min-w-0 flex-1 truncate text-xs">{environment.fileName}</span>
                      <Button variant="ghost" size="sm" className="shrink-0" onClick={downloadEnv}>
                        <Download className="mr-1 h-3.5 w-3.5" />
                        {envFileName}
                      </Button>
                    </div>
                    {supportsFsAccess && (
                      <Button variant="default" size="sm" className="w-full" onClick={saveEnvToFolder}>
                        <FolderDown className="mr-2 h-4 w-4" />
                        Umgebung in Ordner speichern
                      </Button>
                    )}
                    {envFolderStatus && <p className="text-xs text-green-400">{envFolderStatus}</p>}
                    <p className="text-xs text-muted-foreground">
                      Datei im Repo unter{' '}
                      <code className="break-all text-foreground">dist-widget/env/{projectSlug}/</code> ablegen.
                    </p>
                  </>
                )}
              </div>
            </>
          )}

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
