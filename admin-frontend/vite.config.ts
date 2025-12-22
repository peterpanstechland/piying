import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/admin/',  // Base path for admin panel when served from FastAPI
  resolve: {
    alias: [
      { find: '@pose', replacement: path.resolve(__dirname, '../shared/pose') },
      { find: '@shared/pixi', replacement: path.resolve(__dirname, '../shared/pixi') },
    ],
    dedupe: ['pixi.js'],
  },
  server: {
    port: 3001,
    proxy: {
      '/api/admin': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  optimizeDeps: {
    include: ['pixi.js'],
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['**/*.{test,spec}.{ts,tsx}'],
  },
})
