import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// Auto-clean rogue brace-expansion directories before Vite starts
// These are created when `mkdir -p src/{a,b}` runs in a shell that
// doesn't support brace expansion (the build container's shell).
function cleanRogueDirs() {
  return {
    name: 'clean-rogue-dirs',
    buildStart() {
      const srcDir = path.resolve(__dirname, 'src')
      function scan(dir: string) {
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true })
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name)
            if (entry.isDirectory()) {
              if (entry.name.includes('{') || entry.name.includes('}')) {
                console.log(`[Gigs4You] Removing rogue directory: ${fullPath}`)
                fs.rmSync(fullPath, { recursive: true, force: true })
              } else {
                scan(fullPath)
              }
            }
          }
        } catch (_) {}
      }
      scan(srcDir)
    },
  }
}

export default defineConfig({
  plugins: [cleanRogueDirs(), react()],
  server: {
    port: 3001,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
