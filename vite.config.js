import path from 'node:path';
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  logLevel: 'error',
  plugins: [react()],
  // The generated 3D asset library (~900MB of preview PNGs + GLBs) lives under
  // public/immersive/assets for UE5 filesystem import — the browser never loads it.
  // Keep Vite's dev watcher out of it (and the heavy loader/contact-sheet) so HMR
  // and startup stay fast while the asset batch is writing there.
  server: { watch: { ignored: [
    '**/.venv/**', '**/.venv-tts/**', '**/node_modules/**',
    '**/jarvis_assets', '**/jarvis_assets/**', '**/dist/**', '**/dist_prev/**',
    '**/vendor/**', '**/world_os/**', '**/server/data/**', '**/logs/**',
    '**/_old_textfirst_glbs/**',
    '**/public/immersive/glb/**', '**/public/immersive/loader/**',
    '**/public/immersive/contact_sheet.png', '**/underworld/**',
  ] } },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // This is the Jarvis frontend's own test suite. `underworld/web` is a separate
  // package with its own (jsdom) vitest config, so scope ours to ./src and don't
  // glob into it — otherwise its DOM tests run under the wrong environment.
  test: {
    include: ['src/**/*.{test,spec}.{js,jsx,ts,tsx}'],
    environment: 'node',
  },
});
