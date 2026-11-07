import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.js']
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      // Sign-in and sign-out live outside /api (COOK-23).
      '/auth': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
})
