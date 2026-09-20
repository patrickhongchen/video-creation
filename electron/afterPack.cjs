const { chmod } = require('node:fs/promises')
const path = require('node:path')

module.exports = async function ensureBundledFfmpegIsExecutable(context) {
  if (context.electronPlatformName !== 'darwin') return
  const executable = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
    'Contents',
    'Resources',
    'ffmpeg',
    'ffmpeg',
  )
  await chmod(executable, 0o755)
}

