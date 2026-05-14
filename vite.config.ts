import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  // Serves from /gition/ on GitHub Pages; dev still uses /.
  // Override with VITE_BASE for custom domains.
  base: process.env.VITE_BASE ?? (process.env.GITHUB_ACTIONS ? '/gition/' : '/'),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
