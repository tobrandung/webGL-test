import type { Keyframe } from './camera-path';
import './editor.css';

export type EditorCallbacks = {
  onAddKeyframe: () => void;
  onDeleteKeyframe: (index: number) => void;
  onSelectKeyframe: (index: number) => void;
  onPlay: () => void;
  onPause: () => void;
  onScrub: (t: number) => void;
  onToggleLoop: (loop: boolean) => void;
  onExport: () => void;
  getKeyframes: () => Keyframe[];
  getIsPlaying: () => boolean;
  getIsLoop: () => boolean;
};

let callbacks: EditorCallbacks;
let listEl: HTMLElement;
let playBtn: HTMLButtonElement;
let loopBtn: HTMLButtonElement;
let scrubber: HTMLInputElement;
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
      <button id="ed-export" class="ed-btn ed-btn-accent">Export JSON</button>
    </div>

    <div class="editor-scrubber">
      <label>Timeline</label>
      <input type="range" id="ed-scrubber" min="0" max="1000" value="0" />
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
  const exportBtn = document.getElementById('ed-export') as HTMLButtonElement;
  scrubber = document.getElementById('ed-scrubber') as HTMLInputElement;
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

  exportBtn.addEventListener('click', () => {
    callbacks.onExport();
    exportBtn.textContent = 'Exported!';
    setTimeout(() => { exportBtn.textContent = 'Export JSON'; }, 2000);
  });

  scrubber.addEventListener('input', () => {
    const t = Number(scrubber.value) / 1000;
    callbacks.onScrub(t);
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
