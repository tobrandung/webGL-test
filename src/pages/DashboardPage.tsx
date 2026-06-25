import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { ProjectCard } from '@/components/ProjectCard';
import { ExportDialog } from '@/components/ExportDialog';
import { useProjects } from '@/hooks/useProjects';
import type { Project } from '@/lib/db';

export function DashboardPage() {
  const navigate = useNavigate();
  const { projects, loading, createProject, updateProject, deleteProject, duplicateProject } = useProjects();
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportProject, setExportProject] = useState<Project | null>(null);
  const [renameId, setRenameId] = useState('');
  const [inputValue, setInputValue] = useState('');

  const handleCreate = async () => {
    const name = inputValue.trim() || 'Unbenanntes Projekt';
    const project = await createProject(name);
    setShowNewDialog(false);
    setInputValue('');
    navigate(`/project/${project.id}`);
  };

  const handleRename = async () => {
    if (!renameId) return;
    await updateProject(renameId, { name: inputValue.trim() || 'Unbenanntes Projekt' });
    setShowRenameDialog(false);
    setInputValue('');
    setRenameId('');
  };

  const openRename = (id: string) => {
    const project = projects.find((p) => p.id === id);
    setRenameId(id);
    setInputValue(project?.name ?? '');
    setShowRenameDialog(true);
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Laden…</div>
      </div>
    );
  }

  const isEmpty = projects.length === 0;

  return (
    <div className="min-h-screen px-6 py-8 lg:px-8">
      {isEmpty ? (
        <div className="flex h-[calc(100vh-4rem)] flex-col items-center justify-center gap-6">
          <h1 className="text-4xl font-bold tracking-tight">Web3D Studio</h1>
          <p className="max-w-md text-center text-muted-foreground">
            Erstelle interaktive 3D-Erlebnisse mit Kamerafahrten und exportiere sie als embeddable
            Widget für deine Webprojekte.
          </p>
          <Button size="lg" onClick={() => setShowNewDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Neues Projekt
          </Button>
        </div>
      ) : (
        <>
          <div className="mb-6 flex items-center justify-between">
            <h1 className="text-2xl font-bold tracking-tight">Projekte</h1>
            <Button onClick={() => setShowNewDialog(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Neues Projekt
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onRename={openRename}
                onDuplicate={(id) => duplicateProject(id)}
                onDelete={(id) => deleteProject(id)}
                onExport={(projectId) => {
                  const p = projects.find((pr) => pr.id === projectId);
                  if (p) { setExportProject(p); setShowExportDialog(true); }
                }}
              />
            ))}
          </div>
        </>
      )}

      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Neues Projekt</DialogTitle>
            <DialogDescription>Gib deinem Projekt einen Namen.</DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Projektname"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewDialog(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleCreate}>Erstellen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Projekt umbenennen</DialogTitle>
            <DialogDescription>Gib einen neuen Namen ein.</DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Neuer Name"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleRename()}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRenameDialog(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleRename}>Speichern</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ExportDialog open={showExportDialog} onOpenChange={setShowExportDialog} project={exportProject} />
    </div>
  );
}

export default DashboardPage;
