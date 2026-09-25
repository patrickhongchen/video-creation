import path from 'node:path'
import { ProjectStore } from '../electron/project/projectStore'
import { lintPresentation, type PresentationDiagnostic } from '../src/presentationLint'

export interface ProjectValidationResult {
  valid: boolean
  errors: PresentationDiagnostic[]
  warnings: PresentationDiagnostic[]
}

export async function validateProject(projectInput: string): Promise<ProjectValidationResult> {
  const root = path.basename(projectInput) === 'presentation.json' ? path.dirname(projectInput) : projectInput
  const store = new ProjectStore()
  try {
    const snapshot = await store.openAt(root)
    const errors: PresentationDiagnostic[] = snapshot.missingAssets.map((asset) => ({
      code: 'missing-asset',
      message: asset.message,
      path: asset.path,
      slideId: asset.slideIds[0],
    }))
    return { valid: errors.length === 0, errors, warnings: lintPresentation(snapshot.presentation) }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const separator = message.indexOf(': ')
    const propertyPath = message.startsWith('presentation.') && separator > 0 ? message.slice(0, separator) : undefined
    return { valid: false, errors: [{ code: 'project-invalid', message, ...(propertyPath ? { path: propertyPath } : {}) }], warnings: [] }
  }
}

export async function runValidator(argv: string[]) {
  const json = argv.includes('--json')
  const strict = argv.includes('--strict')
  const positional = argv.filter((arg) => arg !== '--json' && arg !== '--strict')
  if (positional.length !== 1 || positional[0].startsWith('--')) {
    const message = 'Usage: npm run validate-project -- <project-folder|presentation.json> [--json] [--strict]'
    if (json) console.log(JSON.stringify({ valid: false, errors: [{ code: 'usage', message }], warnings: [] }, null, 2))
    else console.error(message)
    return 1
  }
  const result = await validateProject(positional[0])
  if (json) console.log(JSON.stringify(result, null, 2))
  else {
    for (const error of result.errors) console.error(`ERROR ${error.path ?? ''}\n${error.message}\n`)
    for (const warning of result.warnings) {
      const location = [warning.slideId && `Slide "${warning.slideId}"`, warning.elementId && `element "${warning.elementId}"`].filter(Boolean).join(' / ')
      console.log(`WARNING ${location} (${warning.code})\n${warning.message}\n`)
    }
    console.log(result.valid
      ? `Project is structurally valid with ${result.warnings.length} warning${result.warnings.length === 1 ? '' : 's'}.`
      : `Project has ${result.errors.length} error${result.errors.length === 1 ? '' : 's'} and ${result.warnings.length} warning${result.warnings.length === 1 ? '' : 's'}.`)
  }
  return result.valid && (!strict || result.warnings.length === 0) ? 0 : 1
}
