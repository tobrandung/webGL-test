import { defineConfig } from 'vite';

export const config = defineConfig({
  assetsInclude: ['**/*.glb'],
  build: {
    target: 'es2020',
  },
});

export default config;
