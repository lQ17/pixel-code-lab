import { compileBlocks, parseBlocks, type BlocksDocument } from '../blocks/model'
import { isPixelReferenceId, pixelRadius } from './pixelCreation'
import type { SpaceMode } from '../runners/types'
import { isVoxelLevelId, voxelRadius } from './voxel'

export interface Project {
  id: string
  name: string
  code: string
  referenceId: string
  editor?: 'blocks'
  blocks?: BlocksDocument
  preview?: string
  createdAt: string
  updatedAt: string
}

export const maxProjectName = 80
export const maxProjectCode = 200_000
export const maxProjectFileBytes = 1024 * 1024

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('作品格式无效。')
  return value as Record<string, unknown>
}

export function projectName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maxProjectName) throw new Error('请输入 1～80 个字符的作品名称。')
  return value.trim()
}

export function parseProject(value: unknown, mode: SpaceMode = '3d'): Project {
  const data = object(value)
  if (typeof data.id !== 'string' || !data.id.trim() || data.id.length > 128) throw new Error('作品标识无效。')
  const name = projectName(data.name)
  if (typeof data.code !== 'string' || data.code.length > maxProjectCode) throw new Error('作品代码必须是文本，且不超过 200000 个字符。')
  if (!(mode === '3d' ? isVoxelLevelId(data.referenceId) : isPixelReferenceId(data.referenceId))) throw new Error('作品参考模型无效。')
  if (data.editor !== undefined && data.editor !== 'blocks') throw new Error('不支持此作品编辑方式。')
  if ((data.editor === 'blocks' && (mode !== '2d' || data.blocks === undefined)) || (data.editor === undefined && data.blocks !== undefined)) throw new Error('积木作品信息不完整。')
  const blocks = data.editor === 'blocks' ? parseBlocks(data.blocks) : undefined
  const compiled = blocks ? compileBlocks(blocks) : undefined
  const code = compiled ? compiled.code : data.code
  const validPreview = !compiled || (!!code && code === data.code)
  const count = mode === '3d' ? (voxelRadius * 2 + 1) ** 3 : (pixelRadius * 2 + 1) ** 2
  if (data.preview !== undefined && (typeof data.preview !== 'string' || data.preview.length !== count || /[^0-8]/.test(data.preview))) throw new Error('作品预览无效。')
  for (const key of ['createdAt', 'updatedAt']) {
    const value = data[key]
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw new Error('作品时间无效。')
  }
  if (String(data.updatedAt) < String(data.createdAt)) throw new Error('作品更新时间早于创建时间。')
  return { id: data.id, name, code, ...(blocks ? { editor: 'blocks' as const, blocks } : {}), referenceId: data.referenceId as string, ...(data.preview !== undefined && validPreview ? { preview: data.preview as string } : {}), createdAt: data.createdAt as string, updatedAt: data.updatedAt as string }
}

export function parseProjectLibrary(value: unknown, mode: SpaceMode = '3d'): Project[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error('作品库格式无效。')
  const projects = value.map(item => parseProject(item, mode))
  if (new Set(projects.map(project => project.id)).size !== projects.length) throw new Error('作品标识重复。')
  return projects
}

export function uniqueProjectName(name: string, projects: Project[]): string {
  const base = projectName(name)
  let candidate = base
  for (let suffix = 2; projects.some(project => project.name === candidate); suffix++) {
    const end = `（${suffix}）`
    candidate = base.slice(0, maxProjectName - end.length) + end
  }
  return candidate
}

export function exportProject(project: Project, mode: SpaceMode = '3d'): string {
  const { id: _id, ...content } = parseProject(project, mode)
  return JSON.stringify({ format: mode === '3d' ? 'pixel-code-lab.voxel-project' : 'pixel-code-lab.pixel-project', version: content.editor === 'blocks' ? 2 : 1, mode, language: 'python', radius: mode === '3d' ? voxelRadius : pixelRadius, project: content }, null, 2)
}

export function importProject(raw: string, id: string, mode: SpaceMode = '3d'): Project {
  if (new TextEncoder().encode(raw).byteLength > maxProjectFileBytes) throw new Error('作品文件不能超过 1 MB。')
  let data: Record<string, unknown>
  try { data = object(JSON.parse(raw)) } catch { throw new Error('无法读取作品文件，请选择导出的 JSON 作品文件。') }
  if (data.format !== (mode === '3d' ? 'pixel-code-lab.voxel-project' : 'pixel-code-lab.pixel-project') || (data.version !== 1 && !(mode === '2d' && data.version === 2)) || data.mode !== mode || data.language !== 'python' || data.radius !== (mode === '3d' ? voxelRadius : pixelRadius)) throw new Error('不支持此作品格式、版本、语言或空间尺寸。')
  const content = object(data.project)
  if ((data.version === 2 && content.editor !== 'blocks') || (data.version === 1 && (content.editor !== undefined || content.blocks !== undefined))) throw new Error('作品版本与编辑方式不一致。')
  return parseProject({ ...content, id }, mode)
}

export function projectFilename(name: string): string {
  // Windows filenames cannot contain control characters.
  // eslint-disable-next-line no-control-regex
  return `pixel-code-lab-${name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 80)}.json`
}
