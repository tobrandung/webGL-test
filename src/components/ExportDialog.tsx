import { useState, useCallback } from 'react';
import { Copy, Check, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import type { Project } from '@/lib/db';

type ExportMode = 'scroll' | 'autoplay' | 'loop';

type ExportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project | null;
};

export function ExportDialog({ open, onOpenChange, project }: ExportDialogProps) {
  const [exportMode, setExportMode] = useState<ExportMode>('scroll');
  const [transparent, setTransparent] = useState(false);
  const [copied, setCopied] = useState(false);

  const getEmbedCode = useCallback(() => {
    if (!project) return '';

    const config = JSON.stringify({
      projectId: project.id,
      mode: exportMode,
      transparent,
      background: transparent ? 'transparent' : project.settings.background,
      keyframes: project.cameraPath.keyframes,
      isLoop: exportMode === 'loop' || project.cameraPath.isLoop,
      speed: project.cameraPath.speed,
    });

    return `<!-- Web3D Studio Widget -->
<div id="web3d-widget" style="width:100%;height:100vh;"></div>
<script src="web3d-widget.js"><\/script>
<script>
  Web3DWidget.init('#web3d-widget', ${config});
<\/script>`;
  }, [project, exportMode, transparent]);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(getEmbedCode());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [getEmbedCode]);

  if (!project) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Widget exportieren</DialogTitle>
          <DialogDescription>
            Generiere ein Embed-Snippet für Webflow, Slater oder dein eigenes Projekt.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
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
            <Label>Embed-Code</Label>
            <div className="relative">
              <pre className="max-h-48 overflow-auto rounded-lg bg-secondary p-4 text-xs">
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
            <Button disabled>
              <Download className="mr-2 h-4 w-4" />
              ZIP Download
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
