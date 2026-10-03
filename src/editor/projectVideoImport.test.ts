import { describe, expect, it, vi } from 'vitest'
import { runProjectVideoImport } from './projectVideoImport'

describe('desktop video import from local presentations', () => {
  it('waits for the project to be saved before importing with its new identity', async () => {
    const steps: string[] = []
    const result = await runProjectVideoImport(null, async () => {
      steps.push('save')
      await Promise.resolve()
      steps.push('saved')
      return { projectId: 'new-project' }
    }, async (projectId) => {
      steps.push(`import:${projectId}`)
      return 'converted-video'
    })
    expect(result).toBe('converted-video')
    expect(steps).toEqual(['save', 'saved', 'import:new-project'])
  })

  it('leaves the presentation alone when saving is cancelled', async () => {
    const importVideo = vi.fn()
    expect(await runProjectVideoImport(null, async () => null, importVideo)).toBeUndefined()
    expect(importVideo).not.toHaveBeenCalled()
  })

  it('uses the open project without prompting for another save location', async () => {
    const createProject = vi.fn()
    const importVideo = vi.fn(async (id: string) => id)
    expect(await runProjectVideoImport({ projectId: 'existing' }, createProject, importVideo)).toBe('existing')
    expect(createProject).not.toHaveBeenCalled()
  })
})
