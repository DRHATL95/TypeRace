import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  // Electron loads the packaged renderer over file:// (electron/main.ts builds
  // `file://.../build/index.html`), so asset URLs have to be relative. The
  // default base of '/' would resolve against the filesystem root and 404.
  base: './',

  build: {
    // CRA emitted to build/, and three things still depend on that path:
    // electron/main.ts loads ../build/index.html, electron-builder packages
    // build/**/*, and the Dockerfile copies /app/build into the server image.
    // Vite's own default (dist/) is already taken by the compiled Electron
    // main process, so overriding this is required, not cosmetic.
    outDir: 'build',
    emptyOutDir: true,
  },

  server: {
    // electron/main.ts points at http://localhost:3000 in dev, and `npm run dev`
    // gates the Electron launch on `wait-on http://localhost:3000`.
    // strictPort so a busy port fails loudly instead of silently moving and
    // leaving Electron waiting on a URL that never comes up.
    port: 3000,
    strictPort: true,
  },
});
