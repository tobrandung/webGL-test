import { useState, useRef, useCallback } from 'react';
import { Upload, FileBox } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { isSupportedModelFile } from '@/three/viewport';

type ModelUploadDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpload: (file: File, compress: boolean, quality: number) => void;
};

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

export function ModelUploadDialog({ open, onOpenChange, onUpload }: ModelUploadDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [compress, setCompress] = useState(false);
  const [quality, setQuality] = useState([70]);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File) => {
    setError('');
    if (!isSupportedModelFile(f.name)) {
      setError('Nicht unterstütztes Format. Erlaubt: .glb, .gltf, .fbx, .obj, .stl, .dae, .3ds');
      return;
    }
    if (f.size > MAX_FILE_SIZE) {
      setError('Datei zu groß. Maximale Größe: 100 MB.');
      return;
    }
    setFile(f);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile],
  );

  const handleSubmit = () => {
    if (!file) return;
    onUpload(file, compress, quality[0]);
    setFile(null);
    setCompress(false);
    setQuality([70]);
    onOpenChange(false);
  };

  const reset = () => {
    setFile(null);
    setError('');
    setCompress(false);
    setQuality([70]);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Modell hinzufügen</DialogTitle>
          <DialogDescription>
            Lade ein 3D-Modell hoch (.glb, .gltf, .fbx, .obj, .stl, .dae). Max. 100 MB.
          </DialogDescription>
        </DialogHeader>

        {!file ? (
          <div
            className={`flex h-40 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed transition-colors ${
              dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground'
            }`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
            aria-label="Datei hochladen"
          >
            <Upload className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Datei hierher ziehen oder klicken</p>
            <Input
              ref={inputRef}
              type="file"
              accept=".glb,.gltf,.fbx,.obj,.stl,.dae,.3ds"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg bg-secondary p-3">
              <FileBox className="h-8 w-8 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(file.size / (1024 * 1024)).toFixed(2)} MB
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={reset}>
                Ändern
              </Button>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="compress-switch">Komprimieren (Draco)</Label>
              <Switch id="compress-switch" checked={compress} onCheckedChange={setCompress} />
            </div>

            {compress && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Qualität</Label>
                  <span className="text-sm text-muted-foreground">{quality[0]}%</span>
                </div>
                <Slider min={10} max={100} step={5} value={quality} onValueChange={setQuality} />
              </div>
            )}
          </div>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button disabled={!file} onClick={handleSubmit}>
            Hinzufügen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
