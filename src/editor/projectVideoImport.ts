/** Local desktop presentations need a Project before importing managed video files. */
export async function runProjectVideoImport<T>(
  currentProject: { projectId: string } | null,
  createProject: () => Promise<{ projectId: string } | null>,
  importVideo: (projectId: string) => Promise<T>,
): Promise<T | undefined> {
  const project = currentProject ?? await createProject()
  if (!project) return undefined
  return importVideo(project.projectId)
}
