import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/admin/',  // Base path for admin panel when served from FastAPI
  resolve: {
    alias: {
      '@pose': path.resolve(__dirname, '../shared/pose'),
      '@renderer': path.resolve(__dirname, '../shared/pixi'),
      'pixi.js': path.resolve(__dirname, 'node_modules/pixi.js'),
    },
  },
  optimizeDeps: {
    include: ['pixi.js'],
    entries: [
      './src/**/*.{ts,tsx}',
      '../shared/**/*.ts',
    ],
  },
  server: {
    port: 3001,
    fs: {
      strict: false,
    },
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
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['**/*.{test,spec}.{ts,tsx}'],
  },
})
