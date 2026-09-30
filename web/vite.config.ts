import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { fileURLToPath, URL } from 'node:url';

const r = (p) => fileURLToPath(new URL(p, import.meta.url));

// The Midnight stack needs Buffer in the browser and its ledger WASM loaded
// as an ES module (vite-plugin-wasm). The level-family private-state store
// extends Node's EventEmitter — nodePolyfills provides real implementations
// for the Node core builtins (events, util, stream, ...) instead of Vite's
// empty externalization, whose import cycle breaks `class extends` at init.
// The crypto override follows the official midnight-wallet-dapp recipe.
export default defineConfig({
  plugins: [
    react(),
    wasm(),
    nodePolyfills({
      include: ['buffer', 'process', 'util', 'events', 'stream', 'crypto', 'assert'],
      globals: { Buffer: true, global: true, process: true },
      overrides: {
        crypto: 'crypto-browserify',
      },
    }),
  ],
  resolve: {
    alias: {
      // Guarantee the browser-native WebSocket for the indexer provider's
      // `import { WebSocket } from 'isomorphic-ws'`.
      'isomorphic-ws': r('./src/lib/ws-shim.ts'),
    },
  },
  optimizeDeps: {
    include: ['level', 'browser-level', 'abstract-level', 'level-supports', 'level-transcoder'],
    exclude: ['@midnight-ntwrk/ledger-v8'],
    esbuildOptions: {
      target: 'esnext',
      define: { global: 'globalThis' },
    },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 4000,
    target: 'esnext',
    // Wrap CommonJS modules in lazy factories: abstract-level's internal
    // import cycles otherwise resolve too late and `class extends` sees
    // undefined parents at module-init time.
    commonjsOptions: {
      strictRequires: true,
    },
  },
  server: {
    port: 5173,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
