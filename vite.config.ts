import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'

const build = (() => {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return 'dev'
  }
})()

export default defineConfig({
  base: './',
  define: { __BUILD__: JSON.stringify(build) },
  server: { host: true, port: 5173 },
  build: { target: 'es2022', sourcemap: true },
})
