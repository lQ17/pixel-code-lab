import { useState } from 'react'
import { compileBlocks, emptyBlocksFor, type BlocksDocument, type EditorKind } from '../blocks/model'
import { starterCode } from '../engine/levels'
import { defaultPixelId, type PixelReferenceId } from '../engine/pixelCreation'
import { defaultVoxelId, voxelStarter, type VoxelLevelId } from '../engine/voxel'
import type { SpaceMode } from '../runners/types'
import { exportProject, importProject, maxProjectFileBytes, parseProject, projectFilename, projectName, uniqueProjectName, type Project } from '../engine/projects'
import type { Progress, useProgress } from './useProgress'

export function creationDraft(progress: Progress, mode: SpaceMode = '3d', selectedEditor?: EditorKind) {
  const pixel = mode === '2d'
  const editor = selectedEditor ?? (pixel ? progress.pixelEditor : progress.voxelEditor) ?? 'python'
  const blocks = editor === 'blocks'
  const projects = (pixel ? progress.pixelProjects : progress.voxelProjects) ?? []
  const blockDraft = pixel ? progress.pixelBlocks : progress.voxelBlocks
  const emptyBlocks = emptyBlocksFor(mode)
  const id = blocks ? blockDraft?.projectId : pixel ? progress.pixelProjectId : progress.voxelProjectId
  const active = projects.find(project => project.id === id)
  const document = blocks ? blockDraft?.document ?? emptyBlocks : undefined
  const code = document ? compileBlocks(document).code : (pixel ? progress.pixelCode : progress.voxelCode) ?? (pixel ? starterCode : voxelStarter)
  const referenceId = (blocks ? blockDraft?.referenceId : pixel ? progress.pixelReferenceId : progress.voxelReferenceId) ?? (pixel ? defaultPixelId : defaultVoxelId)
  const name = (blocks ? blockDraft?.name : pixel ? progress.pixelDraftName : progress.voxelDraftName) ?? active?.name ?? ''
  const modified = active
    ? code !== active.code || referenceId !== active.referenceId || name.trim() !== active.name || (blocks && JSON.stringify(document) !== JSON.stringify(active.blocks))
    : code !== (pixel ? starterCode : voxelStarter) || name.trim() !== '' || referenceId !== (pixel ? defaultPixelId : defaultVoxelId) || (blocks && JSON.stringify(document) !== JSON.stringify(emptyBlocks))
  return { projects, active, code, referenceId, name, modified, editor, document }
}
type Preview = { source: string; colors: number[] } | undefined
function snapshot(progress: Progress, mode: SpaceMode, preview: Preview, name: string, id: string = crypto.randomUUID(), createdAt = new Date().toISOString(), editor?: EditorKind): Project {
  const draft = creationDraft(progress, mode, editor)
  const { code, referenceId, active, document } = draft
  const updatedAt = [createdAt, new Date().toISOString()].sort().at(-1)!
  const savedPreview = code && preview?.source === code ? preview.colors.join('') : code && active?.code === code ? active.preview : undefined
  return parseProject({ id, name, code, referenceId, createdAt, updatedAt, ...(document ? { editor: 'blocks', blocks: document } : {}), ...(savedPreview !== undefined ? { preview: savedPreview } : {}) }, mode)
}

type DraftPatch = { projectId?: string | null; name?: string; code?: string; referenceId?: string; document?: BlocksDocument }
export function patchCreationDraft(current: Progress, mode: SpaceMode, editor: EditorKind, value: DraftPatch): Partial<Progress> {
  if (mode === '3d' && editor === 'blocks') return { voxelBlocks: {
    document: value.document ?? current.voxelBlocks?.document ?? emptyBlocksFor(mode),
    projectId: value.projectId !== undefined ? value.projectId : current.voxelBlocks?.projectId ?? null,
    name: value.name ?? current.voxelBlocks?.name ?? '',
    referenceId: (value.referenceId ?? current.voxelBlocks?.referenceId ?? defaultVoxelId) as VoxelLevelId,
  } }
  if (mode === '3d') return {
    ...(value.projectId !== undefined ? { voxelProjectId: value.projectId } : {}),
    ...(value.name !== undefined ? { voxelDraftName: value.name } : {}),
    ...(value.code !== undefined ? { voxelCode: value.code } : {}),
    ...(value.referenceId !== undefined ? { voxelReferenceId: value.referenceId as VoxelLevelId } : {}),
  }
  if (editor === 'blocks') return { pixelBlocks: {
    document: value.document ?? current.pixelBlocks?.document ?? emptyBlocksFor(mode),
    projectId: value.projectId !== undefined ? value.projectId : current.pixelBlocks?.projectId ?? null,
    name: value.name ?? current.pixelBlocks?.name ?? '',
    referenceId: (value.referenceId ?? current.pixelBlocks?.referenceId ?? defaultPixelId) as PixelReferenceId,
  } }
  return {
    ...(value.projectId !== undefined ? { pixelProjectId: value.projectId } : {}),
    ...(value.name !== undefined ? { pixelDraftName: value.name } : {}),
    ...(value.code !== undefined ? { pixelCode: value.code } : {}),
    ...(value.referenceId !== undefined ? { pixelReferenceId: value.referenceId as PixelReferenceId } : {}),
  }
}
export function useProjectLibrary(progress: Progress, commit: ReturnType<typeof useProgress>['commit'], onSwitch: () => void, mode: SpaceMode = '3d', preview?: { source: string; colors: number[] }, blockedReason = '') {
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)
  const draft = creationDraft(progress, mode)
  const projectPatch = (projects: Project[]) => mode === '2d' ? { pixelProjects: projects } : { voxelProjects: projects }
  function perform(action: () => void) {
    setNotice(''); setError('')
    try { if (blockedReason) throw new Error(blockedReason); action() } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)) }
  }
  function save(copy = false) {
    perform(() => {
      commit(current => {
        const { active, projects, name, editor } = creationDraft(current, mode)
        const title = projectName(name)
        const fresh = copy || !active
        if (!fresh && projects.some(project => project.id !== active.id && project.name === title)) throw new Error('此名称已存在，请为作品换一个名称。')
        const project = fresh ? snapshot(current, mode, preview, uniqueProjectName(title, projects)) : snapshot(current, mode, preview, title, active.id, active.createdAt)
        return { ...projectPatch(fresh ? [...projects, project] : projects.map(item => item.id === project.id ? project : item)), ...patchCreationDraft(current, mode, editor, { projectId: project.id, name: project.name }) }
      })
      setNotice(copy ? '副本已保存，正在编辑副本。' : '作品已保存。')
    })
  }
  function open(id: string | null) {
    perform(() => {
      const changed = commit(current => {
        const from = creationDraft(current, mode)
        const selected = id === null ? undefined : from.projects.find(project => project.id === id)
        if (id !== null && !selected) throw new Error('找不到该作品。')
        const editor = selected ? selected.editor === 'blocks' ? 'blocks' : 'python' : from.editor
        const target = creationDraft(current, mode, editor)
        const dirty = [from, ...(editor !== from.editor ? [target] : [])].filter(item => item.modified)
        let projects = from.projects
        if (dirty.length) {
          if (!window.confirm('当前修改尚未保存到作品库。继续时会先保留受影响的草稿副本，再切换作品。是否继续？')) return null
          for (const item of dirty) {
            const title = uniqueProjectName((item.name.trim() || '未命名作品').slice(0, 74) + '（草稿）', projects)
            projects = [...projects, snapshot(current, mode, item.editor === from.editor ? preview : undefined, title, undefined, undefined, item.editor)]
          }
        }
        return {
          ...projectPatch(projects), ...(mode === '2d' ? { pixelEditor: editor } : { voxelEditor: editor }),
          ...patchCreationDraft(current, mode, editor, { projectId: selected?.id ?? null, code: selected?.code ?? (mode === '2d' ? starterCode : voxelStarter), document: selected?.blocks ?? emptyBlocksFor(mode), name: selected?.name ?? '', referenceId: selected?.referenceId ?? (mode === '2d' ? defaultPixelId : defaultVoxelId) }),
        }
      })
      if (changed) { onSwitch(); setNotice(id === null ? '已新建草稿。' : '作品已打开，运行代码即可生成画面。') }
    })
  }
  function copyPython() {
    perform(() => {
      commit(current => {
        const { projects, name, document, code } = creationDraft(current, mode)
        if (!document || !code) throw new Error('请先补齐积木，再复制为 Python 作品。')
        const title = uniqueProjectName((name.trim() || '积木作品').slice(0, 68) + '（Python）', projects)
        const { editor: _editor, blocks: _blocks, ...project } = snapshot(current, mode, preview, title)
        return projectPatch([...projects, project])
      })
      setNotice('Python 副本已加入作品库；原积木和手写草稿均保留。')
    })
  }
  async function importFile(file: File) {
    setNotice(''); setError(''); setImporting(true)
    try {
      if (file.size > maxProjectFileBytes) throw new Error('作品文件不能超过 1 MB。')
      const project = importProject(await file.text(), crypto.randomUUID(), mode)
      commit(current => {
        const { projects } = creationDraft(current, mode)
        return projectPatch([...projects, { ...project, name: uniqueProjectName(project.name, projects) }])
      })
      setNotice('作品已导入列表，点击「打开」继续编辑。')
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)) }
    finally { setImporting(false) }
  }
  function download(project?: Project) {
    perform(() => {
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
  return { ...draft, clearFeedback, mode, notice, error, importing, save, open, importFile, download, copyPython }
}
