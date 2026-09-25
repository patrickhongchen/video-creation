import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'silent' })
try {
  const { runValidator } = await server.ssrLoadModule('/scripts/validateProject.ts')
  process.exitCode = await runValidator(process.argv.slice(2))
} finally {
  await server.close()
}
