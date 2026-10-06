import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

/** Compte les lignes de code de l'application (src/, api/, config), pour le panneau de diagnostic. */
function codeStats() {
  const files: { path: string; lines: number }[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) walk(full)
      else if (['.ts', '.tsx', '.css', '.html'].includes(extname(name))) files.push({ path: full, lines: readFileSync(full, 'utf8').split('\n').length })
    }
  }
  for (const d of ['src', 'api']) walk(d)
  for (const f of ['index.html', 'vite.config.ts']) files.push({ path: f, lines: readFileSync(f, 'utf8').split('\n').length })
  const byType: Record<string, number> = {}
  for (const f of files) byType[extname(f.path)] = (byType[extname(f.path)] ?? 0) + f.lines
  return { files: files.length, lines: files.reduce((n, f) => n + f.lines, 0), byType, top: files.sort((a, b) => b.lines - a.lines).slice(0, 6) }
}

function commit() {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7)
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return 'dev'
  }
}

export default defineConfig({
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __COMMIT__: JSON.stringify(commit()),
    __CODE_STATS__: JSON.stringify(codeStats()),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Pêche',
        short_name: 'Pêche',
        description: 'Conditions de pêche, espèces et carnet de prises en Morbihan',
        lang: 'fr',
        theme_color: '#0b1f2e',
        background_color: '#0b1f2e',
        display: 'standalone',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
})
