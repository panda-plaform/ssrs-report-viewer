import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5201',
        changeOrigin: true,
      },
    },
  },
  test: {
    setupFiles: ['./src/test/setup.ts'],
    projects: [
      {
        extends: true,
        test: {
          name: 'helpers',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'chrome',
          environment: 'jsdom',
          include: ['src/**/*.test.tsx'],
        },
      },
    ],
  },
})