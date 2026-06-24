import type { Keyframe, CameraPathConfig } from './camera-path';
import './editor.css';

export type EditorCallbacks = {
  onAddKeyframe: () => void;
  onDeleteKeyframe: (index: number) => void;
  onSelectKeyframe: (index: number) => void;
  onPlay: () => void;
  onPause: () => void;
  onScrub: (t: number) => void;
  onToggleLoop: (loop: boolean) => void;
  onSetSpeed: (speed: number) => void;
  onExport: () => void;
  onImport: (config: CameraPathConfig) => void;
  onPreviewMode: (enabled: boolean) => void;
  getKeyframes: () => Keyframe[];
  getIsPlaying: () => boolean;
  getIsLoop: () => boolean;
};

let callbacks: EditorCallbacks;
let listEl: HTMLElement;
let playBtn: HTMLButtonElement;
let loopBtn: HTMLButtonElement;
let previewBtn: HTMLButtonElement;
let scrubber: HTMLInputElement;
let speedLabel: HTMLElement;
let countEl: HTMLElement;

export function createEditorUI(cb: EditorCallbacks): void {
  callbacks = cb;

  const panel = document.createElement('div');
  panel.id = 'editor-panel';
  panel.innerHTML = `
    <div class="editor-header">
      <h2>Keyframe Editor</h2>
      <span class="editor-badge">EDITOR</span>
    </div>

    <div class="editor-actions">
      <button id="ed-add" class="ed-btn ed-btn-primary">+ Keyframe</button>
      <button id="ed-play" class="ed-btn">Play</button>
      <button id="ed-loop" class="ed-btn ed-btn-active">Loop</button>
      <button id="ed-preview" class="ed-btn">Preview</button>
    </div>

    <div class="editor-actions">
      <button id="ed-export" class="ed-btn ed-btn-accent">Export JSON</button>
      <button id="ed-import" class="ed-btn ed-btn-accent">Import JSON</button>
      <input type="file" id="ed-file-input" accept=".json" hidden />
    </div>

    <div class="editor-scrubber">
      <label>Timeline</label>
      <input type="range" id="ed-scrubber" min="0" max="1000" value="0" />
    </div>

    <div class="editor-scrubber">
      <label>Speed: <span id="ed-speed-label">1.0x</span></label>
      <input type="range" id="ed-speed" min="5" max="300" value="100" />
    </div>

    <div class="editor-info">
      <span id="ed-count">0 Keyframes</span>
    </div>

    <div class="editor-list" id="ed-list"></div>
  `;

  document.body.appendChild(panel);

  const addBtn = document.getElementById('ed-add') as HTMLButtonElement;
  playBtn = document.getElementById('ed-play') as HTMLButtonElement;
  loopBtn = document.getElementById('ed-loop') as HTMLButtonElement;
  previewBtn = document.getElementById('ed-preview') as HTMLButtonElement;
  const exportBtn = document.getElementById('ed-export') as HTMLButtonElement;
  const importBtn = document.getElementById('ed-import') as HTMLButtonElement;
  const fileInput = document.getElementById('ed-file-input') as HTMLInputElement;
  scrubber = document.getElementById('ed-scrubber') as HTMLInputElement;
  const speedSlider = document.getElementById('ed-speed') as HTMLInputElement;
  speedLabel = document.getElementById('ed-speed-label') as HTMLElement;
  listEl = document.getElementById('ed-list') as HTMLElement;
  countEl = document.getElementById('ed-count') as HTMLElement;

  addBtn.addEventListener('click', () => {
    callbacks.onAddKeyframe();
    refreshList();
  });

  playBtn.addEventListener('click', () => {
    if (callbacks.getIsPlaying()) {
      callbacks.onPause();
      playBtn.textContent = 'Play';
    } else {
      callbacks.onPlay();
      playBtn.textContent = 'Pause';
    }
  });

  loopBtn.addEventListener('click', () => {
    const newLoop = !callbacks.getIsLoop();
    callbacks.onToggleLoop(newLoop);
    loopBtn.classList.toggle('ed-btn-active', newLoop);
    loopBtn.textContent = newLoop ? 'Loop' : 'Once';
  });

  previewBtn.addEventListener('click', () => {
    const isActive = previewBtn.classList.toggle('ed-btn-active');
    callbacks.onPreviewMode(isActive);
    previewBtn.textContent = isActive ? 'Exit Preview' : 'Preview';
  });

  exportBtn.addEventListener('click', () => {
    callbacks.onExport();
    exportBtn.textContent = 'Exported!';
    setTimeout(() => { exportBtn.textContent = 'Export JSON'; }, 2000);
  });

  importBtn.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string) as CameraPathConfig;
        if (json.keyframes && Array.isArray(json.keyframes)) {
          callbacks.onImport(json);
          refreshList();
          importBtn.textContent = 'Imported!';
          setTimeout(() => { importBtn.textContent = 'Import JSON'; }, 2000);
        }
      } catch {
        importBtn.textContent = 'Error!';
        setTimeout(() => { importBtn.textContent = 'Import JSON'; }, 2000);
      }
    };
    reader.readAsText(file);
    fileInput.value = '';
  });

  scrubber.addEventListener('input', () => {
    const t = Number(scrubber.value) / 1000;
    callbacks.onScrub(t);
  });

  speedSlider.addEventListener('input', () => {
    const speed = Number(speedSlider.value) / 100;
    speedLabel.textContent = `${speed.toFixed(1)}x`;
    callbacks.onSetSpeed(speed);
  });
}

function refreshList(): void {
  const keyframes = callbacks.getKeyframes();
  countEl.textContent = `${keyframes.length} Keyframes`;

  listEl.innerHTML = '';
  keyframes.forEach((kf, i) => {
    const item = document.createElement('div');
    item.className = 'ed-keyframe-item';
    item.innerHTML = `
      <span class="ed-kf-index">#${i + 1}</span>
      <span class="ed-kf-pos">(${kf.position.map(v => v.toFixed(1)).join(', ')})</span>
      <button class="ed-kf-goto" data-index="${i}" aria-label="Zu Keyframe ${i + 1} springen">Go</button>
      <button class="ed-kf-delete" data-index="${i}" aria-label="Keyframe ${i + 1} löschen">X</button>
    `;
    listEl.appendChild(item);
  });

  listEl.querySelectorAll('.ed-kf-goto').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = Number((e.currentTarget as HTMLElement).dataset.index);
      callbacks.onSelectKeyframe(idx);
    });
  });

  listEl.querySelectorAll('.ed-kf-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = Number((e.currentTarget as HTMLElement).dataset.index);
      callbacks.onDeleteKeyframe(idx);
      refreshList();
    });
  });
}
