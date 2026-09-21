import { useState } from 'react'
import { defaultVoxelId, voxelStarter } from '../engine/voxel'
import { exportProject, importProject, maxProjectFileBytes, parseProject, projectFilename, projectName, uniqueProjectName, type VoxelProject } from '../engine/projects'
import type { Progress, useProgress } from './useProgress'

export function creationDraft(progress: Progress) {
  const projects = progress.voxelProjects ?? []
  const active = projects.find(project => project.id === progress.voxelProjectId)
  const code = progress.voxelCode ?? voxelStarter
  const referenceId = progress.voxelReferenceId ?? defaultVoxelId
  const name = progress.voxelDraftName ?? active?.name ?? ''
  const modified = active
    ? code !== active.code || referenceId !== active.referenceId || name.trim() !== active.name
    : code !== voxelStarter || name.trim() !== '' || referenceId !== defaultVoxelId
  return { projects, active, code, referenceId, name, modified }
}

function snapshot(progress: Progress, name: string, id: string = crypto.randomUUID(), createdAt = new Date().toISOString()): VoxelProject {
  const { code, referenceId } = creationDraft(progress)
  // Keep timestamps ordered even if the system clock moved backwards.
  const updatedAt = [createdAt, new Date().toISOString()].sort().at(-1)!
  return parseProject({ id, name, code, referenceId, createdAt, updatedAt })
}

export function useVoxelLibrary(
  progress: Progress,
  commit: ReturnType<typeof useProgress>['commit'],
  onSwitch: () => void,
) {
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)
  const draft = creationDraft(progress)

  function perform(action: () => void) {
    setNotice(''); setError('')
    try { action() } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)) }
  }

  function save(copy = false) {
    perform(() => {
      commit(current => {
        const { active, projects, name } = creationDraft(current)
        const title = projectName(name)
        const fresh = copy || !active
        if (!fresh && projects.some(project => project.id !== active.id && project.name === title)) throw new Error('此名称已存在，请为作品换一个名称。')
        const project = fresh
          ? snapshot(current, uniqueProjectName(title, projects))
          : snapshot(current, title, active.id, active.createdAt)
        return {
          voxelProjects: fresh ? [...projects, project] : projects.map(item => item.id === project.id ? project : item),
          voxelProjectId: project.id, voxelDraftName: project.name,
        }
      })
      setNotice(copy ? '副本已保存，正在编辑副本。' : '作品已保存。')
    })
  }

  function open(id: string | null) {
    perform(() => {
      const changed = commit(current => {
        const { projects, modified, name } = creationDraft(current)
        const selected = id === null ? undefined : projects.find(project => project.id === id)
        if (id !== null && !selected) throw new Error('找不到该作品。')
        let next = projects
        if (modified) {
          if (!window.confirm('当前修改尚未保存到作品库。继续时会先保留一份草稿副本，再切换作品。是否继续？')) return null
          const backupName = uniqueProjectName((name.trim() || '未命名作品').slice(0, 74) + '（草稿）', projects)
          next = [...projects, snapshot(current, backupName)]
        }
        return {
          voxelProjects: next, voxelProjectId: selected?.id ?? null,
          voxelCode: selected?.code ?? voxelStarter, voxelDraftName: selected?.name ?? '',
          voxelReferenceId: selected?.referenceId ?? defaultVoxelId,
        }
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
      const project = importProject(await file.text(), crypto.randomUUID())
      commit(current => {
        const projects = current.voxelProjects ?? []
        return { voxelProjects: [...projects, { ...project, name: uniqueProjectName(project.name, projects) }] }
      })
      setNotice('作品已导入列表，点击「打开」继续编辑。')
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)) }
    finally { setImporting(false) }
  }

  function download(project?: VoxelProject) {
    perform(() => {
      // Export the current editor buffer, including edits not yet saved to the library.
      const exported = project ?? snapshot(progress, draft.name.trim() || '未命名作品', draft.active?.id, draft.active?.createdAt)
      const file = new Blob([exportProject(exported)], { type: 'application/json;charset=utf-8' })
      if (file.size > maxProjectFileBytes) throw new Error('导出文件超过 1 MB，请缩短代码后重试。')
      const url = URL.createObjectURL(file)
      const link = document.createElement('a')
      link.href = url; link.download = projectFilename(exported.name)
      document.body.append(link); link.click(); link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setNotice('已生成作品文件。')
    })
  }

  return { ...draft, notice, error, importing, save, open, importFile, download }
}
