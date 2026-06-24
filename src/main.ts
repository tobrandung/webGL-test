import { createScene } from './scene';
import { loadModel } from './model';
import { initControls, updateControls } from './controls';
import { initUI, showLoadingProgress, hideLoadingScreen } from './ui';
import './style.css';

const isEditorMode = new URLSearchParams(window.location.search).has('editor');

async function init(): Promise<void> {
  const container = document.getElementById('canvas-container');
  if (!container) throw new Error('Canvas container not found');

  const ctx = createScene(container);

  if (!isEditorMode) {
    initControls(ctx);
    initUI();
  } else {
    document.body.classList.add('editor-mode');
  }

  await loadModel(ctx.scene, (progress) => {
    showLoadingProgress(progress);
  });

  hideLoadingScreen();

  if (isEditorMode) {
    const { initEditor, updateEditor } = await import('./editor');
    initEditor(ctx);

    function animateEditor(): void {
      requestAnimationFrame(animateEditor);
      ctx.timer.update();
      const deltaTime = ctx.timer.getDelta();
      updateEditor(ctx, deltaTime);
      ctx.renderer.render(ctx.scene, ctx.camera);
    }
    animateEditor();
  } else {
    function animate(): void {
      requestAnimationFrame(animate);
      ctx.timer.update();
      const deltaTime = ctx.timer.getDelta();
      updateControls(ctx, deltaTime);
      ctx.renderer.render(ctx.scene, ctx.camera);
    }
    animate();
  }
}

init().catch((err) => {
  console.error('Failed to initialize 3D viewer:', err);
});
