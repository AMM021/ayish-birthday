import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    assetsInlineLimit: 4096,
    rollupOptions: {
      output: {
        // three.js in a chunk of its own (cached apart from the game's code;
        // its loaders stay with the dynamic imports that need them)
        manualChunks(id) {
          if (id.includes('node_modules/three/build/')) return 'three';
          return undefined;
        }
      }
    },
    // three.js alone is ~690 kB minified (~175 kB gzipped) and is imported
    // whole: the limit sits just above it (decision: PREBUILD_AUDIT.md)
    chunkSizeWarningLimit: 720
  },
  // the Blender pipeline writes into art/ all the time; never reload for it
  server: { watch: { ignored: ['**/art/**'] } }
});
