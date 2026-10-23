import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

// The extension host writes its own HTML (CSP + nonce) and loads these fixed file names.
export default defineConfig({
  root,
  base: './',
  plugins: [react()],
  build: {
    outDir: fileURLToPath(new URL('../dist/webview', import.meta.url)),
    emptyOutDir: true,
    sourcemap: false,
    cssCodeSplit: false,
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/main.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: (asset) => (asset.names.some((n) => n.endsWith('.css')) ? 'assets/main.css' : 'assets/[name][extname]'),
      },
    },
  },
});
