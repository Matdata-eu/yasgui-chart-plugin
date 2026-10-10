import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: 'demo',
  publicDir: false,
  server: {
    host: '0.0.0.0',
    port: 5173,
    open: false,
  },
  resolve: {
    alias: {
      '@matdata/yasgui-chart-plugin': resolve(__dirname, 'src/index.ts'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000,
  },
});
