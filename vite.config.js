import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  build: { target: 'es2020', assetsInlineLimit: 4096 },
  // the Blender pipeline writes into art/ all the time; never reload for it
  server: { watch: { ignored: ['**/art/**'] } }
});
