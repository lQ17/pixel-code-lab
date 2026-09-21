import { isPixelReferenceId, pixelRadius } from './pixelCreation'
import type { SpaceMode } from '../runners/types'
import { isVoxelLevelId, voxelRadius } from './voxel'

export interface Project {
  id: string
  name: string
  code: string
  referenceId: string
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
  const count = mode === '3d' ? (voxelRadius * 2 + 1) ** 3 : (pixelRadius * 2 + 1) ** 2
  if (data.preview !== undefined && (typeof data.preview !== 'string' || data.preview.length !== count || /[^0-8]/.test(data.preview))) throw new Error('作品预览无效。')
  for (const key of ['createdAt', 'updatedAt']) {
    const value = data[key]
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw new Error('作品时间无效。')
  }
  if (String(data.updatedAt) < String(data.createdAt)) throw new Error('作品更新时间早于创建时间。')
  return { id: data.id, name, code: data.code, referenceId: data.referenceId as string, ...(data.preview !== undefined ? { preview: data.preview as string } : {}), createdAt: data.createdAt as string, updatedAt: data.updatedAt as string }
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
  return JSON.stringify({ format: mode === '3d' ? 'pixel-code-lab.voxel-project' : 'pixel-code-lab.pixel-project', version: 1, mode, language: 'python', radius: mode === '3d' ? voxelRadius : pixelRadius, project: content }, null, 2)
}

export function importProject(raw: string, id: string, mode: SpaceMode = '3d'): Project {
  if (new TextEncoder().encode(raw).byteLength > maxProjectFileBytes) throw new Error('作品文件不能超过 1 MB。')
  let data: Record<string, unknown>
  try { data = object(JSON.parse(raw)) } catch { throw new Error('无法读取作品文件，请选择导出的 JSON 作品文件。') }
  if (data.format !== (mode === '3d' ? 'pixel-code-lab.voxel-project' : 'pixel-code-lab.pixel-project') || data.version !== 1 || data.mode !== mode || data.language !== 'python' || data.radius !== (mode === '3d' ? voxelRadius : pixelRadius)) throw new Error('不支持此作品格式、版本、语言或空间尺寸。')
  return parseProject({ ...object(data.project), id }, mode)
}

export function projectFilename(name: string): string {
  // Windows filenames cannot contain control characters.
  // eslint-disable-next-line no-control-regex
  return `pixel-code-lab-${name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 80)}.json`
}
