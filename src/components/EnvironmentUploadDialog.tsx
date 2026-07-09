import { useState, useRef, useCallback } from 'react';
import { Upload, Image as ImageIcon } from 'lucide-react';
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

type EnvironmentUploadDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpload: (file: File) => void;
};

const ACCEPTED = ['.hdr', '.exr', '.jpg', '.jpeg', '.png', '.webp'];
const MAX_FILE_SIZE = 60 * 1024 * 1024; // 60MB

function isSupported(fileName: string): boolean {
  const ext = fileName.toLowerCase().slice(fileName.lastIndexOf('.'));
  return ACCEPTED.includes(ext);
}

export function EnvironmentUploadDialog({ open, onOpenChange, onUpload }: EnvironmentUploadDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File) => {
    setError('');
    if (!isSupported(f.name)) {
      setError('Nicht unterstütztes Format. Erlaubt: .hdr, .exr, .jpg, .png, .webp');
      return;
    }
    if (f.size > MAX_FILE_SIZE) {
      setError('Datei zu groß. Maximale Größe: 60 MB.');
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

  const reset = () => {
    setFile(null);
    setError('');
  };

  const handleSubmit = () => {
    if (!file) return;
    onUpload(file);
    reset();
    onOpenChange(false);
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
          <DialogTitle>Umgebung / HDRI hinzufügen</DialogTitle>
          <DialogDescription>
            Lade ein equirektanguläres Bild hoch. Es dient als Spiegelung (IBL) und optional als
            Hintergrund. Erlaubt: .hdr, .exr, .jpg, .png, .webp (max. 60 MB).
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
            aria-label="Umgebungsbild hochladen"
          >
            <Upload className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Bild hierher ziehen oder klicken</p>
            <Input
              ref={inputRef}
              type="file"
              accept={ACCEPTED.join(',')}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-lg bg-secondary p-3">
            <ImageIcon className="h-8 w-8 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{file.name}</p>
              <p className="text-xs text-muted-foreground">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
            </div>
            <Button variant="ghost" size="sm" onClick={reset}>
              Ändern
            </Button>
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
