import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  // The widget is a library bundle with no public assets of its own. Without
  // this, Vite copies all of public/ into dist-widget on every widget build —
  // which duplicated the ~11 MB of bundled HDRI presets into a committed
  // directory (they reach the CDN as project environments, not from here).
  publicDir: false,
  build: {
    lib: {
      entry: resolve(__dirname, 'src/widget/index.ts'),
      name: 'Web3DWidget',
      fileName: 'web3d-widget',
      formats: ['iife'],
    },
    outDir: 'dist-widget',
    // Keep hosted assets (models/, env/) that live alongside the bundle in this
    // directory — Vite would otherwise wipe them on every widget build.
    emptyOutDir: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
    target: 'es2020',
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});
