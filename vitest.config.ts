import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      // Vitest does not load VitePWA, so give the virtual module a resolvable test target.
      'virtual:pwa-register/react': new URL('./src/test/virtual-pwa-register-react.ts', import.meta.url).pathname,
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
