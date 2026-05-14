import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'

const base =
  process.env.VITE_BASE ?? (process.env.GITHUB_ACTIONS ? '/gition/' : '/')

// Injects the resolved base path into the static 404.html after Vite copies
// public/ to dist/. Keeps a single source of truth for the deploy prefix.
function replace404Base(): Plugin {
  return {
    name: 'replace-404-base',
    apply: 'build',
    closeBundle() {
      const target = path.resolve(__dirname, 'dist/404.html')
      if (!fs.existsSync(target)) return
      const src = fs.readFileSync(target, 'utf8')
      fs.writeFileSync(target, src.replace(/__GITION_BASE__/g, base))
    },
  }
}

export default defineConfig({
  // Serves from /gition/ on GitHub Pages; dev still uses /.
  // Override with VITE_BASE for custom domains.
  base,
  plugins: [react(), tailwindcss(), replace404Base()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
