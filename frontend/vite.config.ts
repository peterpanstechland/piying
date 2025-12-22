import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      // Use array format for more precise matching
      { find: '@pose', replacement: path.resolve(__dirname, '../shared/pose') },
      { find: '@shared/pixi', replacement: path.resolve(__dirname, '../shared/pixi') },
    ],
    // Ensure pixi.js resolves from this project's node_modules for shared code
    dedupe: ['pixi.js'],
  },
  server: {
    port: 5173,
    host: true,
    fs: {
      strict: false,
      // Allow serving files from the shared folder
      allow: ['..'],
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
    commonjsOptions: {
      // Include shared folder in commonjs transformation
      include: [/node_modules/, /shared/],
    },
    rollupOptions: {
      output: {
        manualChunks: {
          'mediapipe': ['@mediapipe/tasks-vision'],
          'vendor': ['react', 'react-dom', 'axios'],
          'pixi': ['pixi.js'],
        },
      },
    },
  },
  optimizeDeps: {
    // Pre-bundle pixi.js and ensure it's available for shared code
    include: ['pixi.js'],
  },
  preview: {
    port: 3000,
    host: true,
  },
})
