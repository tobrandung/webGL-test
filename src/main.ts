import { createScene } from './scene';
import { loadModel } from './model';
import { initControls, updateControls } from './controls';
import { initUI, showLoadingProgress, hideLoadingScreen } from './ui';
import './style.css';

async function init(): Promise<void> {
  const container = document.getElementById('canvas-container');
  if (!container) throw new Error('Canvas container not found');

  const ctx = createScene(container);
  initControls(ctx);
  initUI();

  await loadModel(ctx.scene, (progress) => {
    showLoadingProgress(progress);
  });

  hideLoadingScreen();

  function animate(): void {
    requestAnimationFrame(animate);
    ctx.timer.update();
    const deltaTime = ctx.timer.getDelta();

    updateControls(ctx, deltaTime);
    ctx.renderer.render(ctx.scene, ctx.camera);
  }

  animate();
}

init().catch((err) => {
  console.error('Failed to initialize 3D viewer:', err);
});
