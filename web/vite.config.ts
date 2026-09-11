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
  // o app empacota o dist inteiro: sourcemap ali é peso morto dentro do APK
  build: { target: 'es2022', sourcemap: !process.env.BLOBBY_NATIVE },
})
