import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-phaser': ['phaser'],
          'vendor-icons': ['lucide'],
        },
      },
    },
  },
})
