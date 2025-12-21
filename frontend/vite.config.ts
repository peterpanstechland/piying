import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
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
    port: 5173,
    host: true,
    fs: {
      strict: false,
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/config': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/assets': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  assetsInclude: ['**/*.wasm', '**/*.task'],
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'mediapipe': ['@mediapipe/tasks-vision'],
          'vendor': ['react', 'react-dom', 'axios'],
        },
      },
    },
  },
  preview: {
    port: 3000,
    host: true,
  },
})
