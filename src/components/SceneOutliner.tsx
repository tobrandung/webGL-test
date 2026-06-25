import { useState, useCallback } from 'react';
import { Eye, EyeOff, MoreHorizontal, Pencil, Copy, Trash2, ChevronRight, ChevronDown, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { ModelEntry } from '@/lib/db';

type SceneOutlinerProps = {
  models: ModelEntry[];
  selectedId: string | null;
  visibilityMap: Record<string, boolean>;
  onSelect: (id: string | null) => void;
  onToggleVisibility: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
};

export function SceneOutliner({
  models,
  selectedId,
  visibilityMap,
  onSelect,
  onToggleVisibility,
  onRename,
  onDuplicate,
  onDelete,
  collapsed,
  onToggleCollapse,
}: SceneOutlinerProps) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const startRename = useCallback((id: string, currentName: string) => {
    setRenamingId(id);
    setRenameValue(currentName);
  }, []);

  const commitRename = useCallback(
    (id: string) => {
      if (renameValue.trim()) {
        onRename(id, renameValue.trim());
      }
      setRenamingId(null);
    },
    [renameValue, onRename],
  );

  if (collapsed) {
    return (
      <div className="absolute left-0 top-[49px] z-10">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="secondary"
              size="icon"
              className="m-2 h-8 w-8"
              onClick={onToggleCollapse}
              aria-label="Scene Outliner öffnen"
            >
              <Layers className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Scene Outliner</TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="absolute left-0 top-[49px] z-10 flex h-[calc(100%-49px)] w-[260px] flex-col border-r bg-background/95 backdrop-blur-sm">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Scene</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onToggleCollapse} aria-label="Scene Outliner schließen">
              <ChevronRight className="h-3 w-3 rotate-180" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Einklappen</TooltipContent>
        </Tooltip>
      </div>
      <Separator />
      <ScrollArea className="flex-1">
        <div className="p-1">
          {models.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-muted-foreground">
              Noch keine Modelle vorhanden
            </p>
          ) : (
            models.map((model) => {
              const isVisible = visibilityMap[model.id] !== false;
              const isSelected = selectedId === model.id;
              const isRenaming = renamingId === model.id;

              return (
                <div
                  key={model.id}
                  className={`group flex items-center gap-1 rounded-md px-2 py-1 ${
                    isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
                  }`}
                  onClick={() => onSelect(model.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && onSelect(model.id)}
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleVisibility(model.id);
                        }}
                        type="button"
                        aria-label={isVisible ? 'Ausblenden' : 'Einblenden'}
                      >
                        {isVisible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5 opacity-50" />}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right">{isVisible ? 'Ausblenden' : 'Einblenden'}</TooltipContent>
                  </Tooltip>

                  {isRenaming ? (
                    <Input
                      className="h-6 flex-1 px-1 text-xs"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => commitRename(model.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename(model.id);
                        if (e.key === 'Escape') setRenamingId(null);
                        e.stopPropagation();
                      }}
                      onClick={(e) => e.stopPropagation()}
                      autoFocus
                    />
                  ) : (
                    <span
                      className={`flex-1 truncate text-xs ${!isVisible ? 'opacity-50' : ''}`}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        startRename(model.id, model.name);
                      }}
                    >
                      {model.name}
                    </span>
                  )}

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="shrink-0 opacity-0 group-hover:opacity-100"
                        onClick={(e) => e.stopPropagation()}
                        type="button"
                        aria-label="Modell-Optionen"
                      >
                        <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenuItem onClick={() => startRename(model.id, model.name)}>
                        <Pencil className="mr-2 h-3.5 w-3.5" />
                        Umbenennen
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onDuplicate(model.id)}>
                        <Copy className="mr-2 h-3.5 w-3.5" />
                        Duplizieren
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-red-400 focus:text-red-400" onClick={() => onDelete(model.id)}>
                        <Trash2 className="mr-2 h-3.5 w-3.5" />
                        Löschen
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
