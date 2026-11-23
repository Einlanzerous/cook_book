import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

// Where the dev server proxies /api and /auth (override when 3000 is taken).
const apiTarget = process.env.API_TARGET || 'http://localhost:3000'

export default defineConfig({
  plugins: [vue()],
  build: {
    // Firefox is the primary browser (see README, Browser target). Keep in step with browserslist.
    target: ['es2022', 'firefox160', 'chrome111', 'safari16.4']
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.js']
  },
  server: {
    port: 5173,
    // shared/ (COOK-48) sits beside frontend/, outside the dev server's root.
    fs: { allow: ['..'] },
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true
      },
      // Sign-in and sign-out live outside /api (COOK-23).
      '/auth': {
        target: apiTarget,
        changeOrigin: true
      }
    }
  }
})
