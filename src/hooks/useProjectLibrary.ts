import { starterCode } from '../engine/levels'
import { defaultPixelId, type PixelReferenceId } from '../engine/pixelCreation'
import type { SpaceMode } from '../runners/types'
import { useState } from 'react'
import { defaultVoxelId, voxelStarter, type VoxelLevelId } from '../engine/voxel'
import { exportProject, importProject, maxProjectFileBytes, parseProject, projectFilename, projectName, uniqueProjectName, type Project } from '../engine/projects'
import type { Progress, useProgress } from './useProgress'

export function creationDraft(progress: Progress, mode: SpaceMode = '3d') {
  const pixel = mode === '2d'
  const projects = (pixel ? progress.pixelProjects : progress.voxelProjects) ?? []
  const active = projects.find(project => project.id === (pixel ? progress.pixelProjectId : progress.voxelProjectId))
  const code = (pixel ? progress.pixelCode : progress.voxelCode) ?? (pixel ? starterCode : voxelStarter)
  const referenceId = (pixel ? progress.pixelReferenceId : progress.voxelReferenceId) ?? (pixel ? defaultPixelId : defaultVoxelId)
  const name = (pixel ? progress.pixelDraftName : progress.voxelDraftName) ?? active?.name ?? ''
  const modified = active
    ? code !== active.code || referenceId !== active.referenceId || name.trim() !== active.name
    : code !== (pixel ? starterCode : voxelStarter) || name.trim() !== '' || referenceId !== (pixel ? defaultPixelId : defaultVoxelId)
  return { projects, active, code, referenceId, name, modified }
}

function snapshot(progress: Progress, mode: SpaceMode, preview: { source: string; colors: number[] } | undefined, name: string, id: string = crypto.randomUUID(), createdAt = new Date().toISOString()): Project {
  const { code, referenceId, active } = creationDraft(progress, mode)
  // Keep timestamps ordered even if the system clock moved backwards.
  const updatedAt = [createdAt, new Date().toISOString()].sort().at(-1)!
  const savedPreview = preview?.source === code ? preview.colors.join('') : active?.code === code ? active.preview : undefined
  return parseProject({ id, name, code, referenceId, createdAt, updatedAt, ...(savedPreview !== undefined ? { preview: savedPreview } : {}) }, mode)
}

export function useProjectLibrary(
  progress: Progress,
  commit: ReturnType<typeof useProgress>['commit'],
  onSwitch: () => void,
  mode: SpaceMode = '3d',
  preview?: { source: string; colors: number[] },
) {
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)
  const draft = creationDraft(progress, mode)

  function patch(value: { projects?: Project[]; projectId?: string | null; name?: string; code?: string; referenceId?: string }): Partial<Progress> {
    return mode === '3d' ? {
      ...(value.projects !== undefined ? { voxelProjects: value.projects } : {}),
      ...(value.projectId !== undefined ? { voxelProjectId: value.projectId } : {}),
      ...(value.name !== undefined ? { voxelDraftName: value.name } : {}),
      ...(value.code !== undefined ? { voxelCode: value.code } : {}),
      ...(value.referenceId !== undefined ? { voxelReferenceId: value.referenceId as VoxelLevelId } : {}),
    } : {
      ...(value.projects !== undefined ? { pixelProjects: value.projects } : {}),
      ...(value.projectId !== undefined ? { pixelProjectId: value.projectId } : {}),
      ...(value.name !== undefined ? { pixelDraftName: value.name } : {}),
      ...(value.code !== undefined ? { pixelCode: value.code } : {}),
      ...(value.referenceId !== undefined ? { pixelReferenceId: value.referenceId as PixelReferenceId } : {}),
    }
  }

  function perform(action: () => void) {
    setNotice(''); setError('')
    try { action() } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)) }
  }

  function save(copy = false) {
    perform(() => {
      commit(current => {
        const { active, projects, name } = creationDraft(current, mode)
        const title = projectName(name)
        const fresh = copy || !active
        if (!fresh && projects.some(project => project.id !== active.id && project.name === title)) throw new Error('此名称已存在，请为作品换一个名称。')
        const project = fresh
          ? snapshot(current, mode, preview, uniqueProjectName(title, projects))
          : snapshot(current, mode, preview, title, active.id, active.createdAt)
        return patch({
          projects: fresh ? [...projects, project] : projects.map(item => item.id === project.id ? project : item),
          projectId: project.id, name: project.name,
        })
      })
      setNotice(copy ? '副本已保存，正在编辑副本。' : '作品已保存。')
    })
  }

  function open(id: string | null) {
    perform(() => {
      const changed = commit(current => {
        const { projects, modified, name } = creationDraft(current, mode)
        const selected = id === null ? undefined : projects.find(project => project.id === id)
        if (id !== null && !selected) throw new Error('找不到该作品。')
        let next = projects
        if (modified) {
          if (!window.confirm('当前修改尚未保存到作品库。继续时会先保留一份草稿副本，再切换作品。是否继续？')) return null
          const backupName = uniqueProjectName((name.trim() || '未命名作品').slice(0, 74) + '（草稿）', projects)
          next = [...projects, snapshot(current, mode, preview, backupName)]
        }
        return patch({
          projects: next, projectId: selected?.id ?? null,
          code: selected?.code ?? (mode === '2d' ? starterCode : voxelStarter), name: selected?.name ?? '',
          referenceId: selected?.referenceId ?? (mode === '2d' ? defaultPixelId : defaultVoxelId),
        })
      })
      if (changed) {
        onSwitch()
        setNotice(id === null ? '已新建草稿。' : '作品已打开，运行代码即可生成画面。')
      }
    })
  }

  async function importFile(file: File) {
    setNotice(''); setError(''); setImporting(true)
    try {
      if (file.size > maxProjectFileBytes) throw new Error('作品文件不能超过 1 MB。')
      const project = importProject(await file.text(), crypto.randomUUID(), mode)
      commit(current => {
        const { projects } = creationDraft(current, mode)
        return patch({ projects: [...projects, { ...project, name: uniqueProjectName(project.name, projects) }] })
      })
      setNotice('作品已导入列表，点击「打开」继续编辑。')
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)) }
    finally { setImporting(false) }
  }

  function download(project?: Project) {
    perform(() => {
      // Export the current editor buffer, including edits not yet saved to the library.
      const exported = project ?? snapshot(progress, mode, preview, draft.name.trim() || '未命名作品', draft.active?.id, draft.active?.createdAt)
      const file = new Blob([exportProject(exported, mode)], { type: 'application/json;charset=utf-8' })
      if (file.size > maxProjectFileBytes) throw new Error('导出文件超过 1 MB，请缩短代码后重试。')
      const url = URL.createObjectURL(file)
      const link = document.createElement('a')
      link.href = url; link.download = projectFilename(exported.name)
      document.body.append(link); link.click(); link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setNotice('已生成作品文件。')
    })
  }

  function clearFeedback() { setNotice(''); setError('') }

  return { ...draft, clearFeedback, mode, notice, error, importing, save, open, importFile, download }
}
