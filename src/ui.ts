import { setModelColor, type ModelColor } from './model';

type SwatchConfig = {
  color: string;
  label: string;
  value: ModelColor;
};

const SWATCHES: SwatchConfig[] = [
  { color: '#8a8a8a', label: 'Standard', value: 'default' },
  { color: '#ffd700', label: 'Gold', value: 'gold' },
  { color: '#cc0000', label: 'Rot', value: 'red' },
];

export function initUI(): void {
  createColorSwatches();
  initSettingsToggle();
}

function createColorSwatches(): void {
  const container = document.getElementById('color-swatches');
  if (!container) return;

  let activeIndex = 0;

  SWATCHES.forEach((swatch, index) => {
    const button = document.createElement('button');
    button.className = 'swatch';
    button.setAttribute('aria-label', `Farbe: ${swatch.label}`);
    button.style.setProperty('--swatch-color', swatch.color);
    if (index === 0) button.classList.add('active');

    button.addEventListener('click', () => {
      container.querySelectorAll('.swatch').forEach(el => el.classList.remove('active'));
      button.classList.add('active');
      activeIndex = index;
      setModelColor(swatch.value);
    });

    container.appendChild(button);
  });
}

function initSettingsToggle(): void {
  const toggle = document.getElementById('settings-toggle');
  const panel = document.getElementById('settings-panel');
  if (!toggle || !panel) return;

  toggle.addEventListener('click', () => {
    panel.classList.toggle('hidden');
    const isOpen = !panel.classList.contains('hidden');
    toggle.setAttribute('aria-expanded', String(isOpen));
    toggle.setAttribute('aria-label', isOpen ? 'Einstellungen schließen' : 'Einstellungen öffnen');
  });
}

export function showLoadingProgress(progress: number): void {
  const fill = document.getElementById('progress-fill');
  if (fill) {
    fill.style.width = `${Math.round(progress * 100)}%`;
  }
}

export function hideLoadingScreen(): void {
  const screen = document.getElementById('loading-screen');
  if (screen) {
    screen.classList.add('fade-out');
    setTimeout(() => screen.remove(), 600);
  }
}
