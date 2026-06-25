import { useCallback, useRef, useState } from 'react';

export type Command = {
  type: string;
  label: string;
  execute: () => void;
  undo: () => void;
};

export type HistoryState = {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string;
  redoLabel: string;
};

const MAX_HISTORY = 50;

export function useHistory() {
  const undoStack = useRef<Command[]>([]);
  const redoStack = useRef<Command[]>([]);
  const [state, setState] = useState<HistoryState>({
    canUndo: false,
    canRedo: false,
    undoLabel: '',
    redoLabel: '',
  });

  const updateState = useCallback(() => {
    setState({
      canUndo: undoStack.current.length > 0,
      canRedo: redoStack.current.length > 0,
      undoLabel: undoStack.current[undoStack.current.length - 1]?.label ?? '',
      redoLabel: redoStack.current[redoStack.current.length - 1]?.label ?? '',
    });
  }, []);

  const execute = useCallback(
    (command: Command) => {
      command.execute();
      undoStack.current.push(command);
      if (undoStack.current.length > MAX_HISTORY) {
        undoStack.current.shift();
      }
      redoStack.current = [];
      updateState();
    },
    [updateState],
  );

  const undo = useCallback(() => {
    const command = undoStack.current.pop();
    if (!command) return;
    command.undo();
    redoStack.current.push(command);
    updateState();
  }, [updateState]);

  const redo = useCallback(() => {
    const command = redoStack.current.pop();
    if (!command) return;
    command.execute();
    undoStack.current.push(command);
    updateState();
  }, [updateState]);

  const clear = useCallback(() => {
    undoStack.current = [];
    redoStack.current = [];
    updateState();
  }, [updateState]);

  return { ...state, execute, undo, redo, clear };
}
