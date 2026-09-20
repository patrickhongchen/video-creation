import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const projectDirectory = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  build: {
    ssr: true,
    target: 'node22',
    outDir: 'dist-electron',
    emptyOutDir: true,
    sourcemap: true,
    minify: false,
    rollupOptions: {
      input: {
        main: path.resolve(projectDirectory, 'electron/main.ts'),
        preload: path.resolve(projectDirectory, 'electron/preload.ts'),
      },
      external: ['electron'],
      output: {
        format: 'cjs',
        entryFileNames: '[name].cjs',
        chunkFileNames: 'chunks/[name]-[hash].cjs',
      },
    },
  },
})
