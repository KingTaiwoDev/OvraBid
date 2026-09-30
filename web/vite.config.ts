import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import { fileURLToPath } from 'node:url';

// The Midnight stack needs Buffer in the browser and its ledger WASM loaded
// as an ES module (vite-plugin-wasm); Vite 7's ES2022 target covers
// top-level await natively.
export default defineConfig({
  plugins: [react(), wasm()],
  define: {
    global: 'globalThis',
  },
  resolve: {
    alias: {
      buffer: 'buffer/',
      // Guarantee the browser-native WebSocket for the indexer provider's
      // `import { WebSocket } from 'isomorphic-ws'`.
      'isomorphic-ws': fileURLToPath(new URL('./src/lib/ws-shim.ts', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['@midnight-ntwrk/ledger-v8'],
    esbuildOptions: {
      define: { global: 'globalThis' },
    },
  },
  publicDir: fileURLToPath(new URL('./public', import.meta.url)),
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 4000,
  },
  server: {
    port: 5173,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
