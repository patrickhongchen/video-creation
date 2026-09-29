const { constants } = require('node:fs')
const { access, chmod, copyFile, mkdir, readdir } = require('node:fs/promises')
const path = require('node:path')
const { promisify } = require('node:util')
const { execFile } = require('node:child_process')

const run = promisify(execFile)
const defaultWhisperRoot = path.resolve(__dirname, '../../whisper.cpp')

async function requireFile(filePath, description) {
  try {
    await access(filePath, constants.R_OK)
  } catch {
    throw new Error(`${description} is missing: ${filePath}. Build whisper.cpp locally or set WHISPER_BUILD_BIN_DIR and WHISPER_MEDIUM_EN_MODEL.`)
  }
}

async function makeDylibsPortable(filePath) {
  const { stdout } = await run('otool', ['-l', filePath])
  const rpaths = [...stdout.matchAll(/cmd LC_RPATH\s+cmdsize \d+\s+path (.+?) \(offset \d+\)/g)]
    .map((match) => match[1])
  for (const rpath of rpaths) {
    if (rpath !== '@loader_path') await run('install_name_tool', ['-rpath', rpath, '@loader_path', filePath])
  }
  // install_name_tool invalidates the original signature on Apple Silicon.
  await run('codesign', ['--force', '--sign', '-', filePath])
}

module.exports = async function prepareBundledResources(context) {
  if (context.electronPlatformName !== 'darwin') return
  const resources = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
    'Contents',
    'Resources',
  )
  await chmod(path.join(resources, 'ffmpeg', 'ffmpeg'), 0o755)

  const whisperBin = process.env.WHISPER_BUILD_BIN_DIR || path.join(defaultWhisperRoot, 'build', 'bin')
  const model = process.env.WHISPER_MEDIUM_EN_MODEL || path.join(defaultWhisperRoot, 'models', 'ggml-medium.en.bin')
  const executable = path.join(whisperBin, 'whisper-cli')
  await requireFile(executable, 'whisper.cpp executable')
  await requireFile(model, 'Whisper medium.en model')

  const whisperResources = path.join(resources, 'whisper')
  await mkdir(whisperResources, { recursive: true })
  const libraries = (await readdir(whisperBin)).filter((name) => /^lib(?:whisper|ggml)[^/]*\.dylib$/.test(name))
  if (libraries.length === 0) throw new Error(`whisper.cpp dynamic libraries are missing from ${whisperBin}.`)
  const nativeFiles = ['whisper-cli', ...libraries]
  for (const name of nativeFiles) {
    const target = path.join(whisperResources, name)
    await copyFile(path.join(whisperBin, name), target)
    await chmod(target, 0o755)
    await makeDylibsPortable(target)
  }
  await copyFile(model, path.join(whisperResources, 'ggml-medium.en.bin'), constants.COPYFILE_FICLONE)
}
