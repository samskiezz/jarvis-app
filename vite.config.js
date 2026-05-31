import path from 'node:path';
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  logLevel: 'error',
  plugins: [react()],
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
