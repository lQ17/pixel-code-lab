import { isVoxelLevelId, voxelRadius, type VoxelLevelId } from './voxel'

export interface VoxelProject {
  id: string
  name: string
  code: string
  referenceId: VoxelLevelId
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

export function parseProject(value: unknown): VoxelProject {
  const data = object(value)
  if (typeof data.id !== 'string' || !data.id.trim() || data.id.length > 128) throw new Error('作品标识无效。')
  const name = projectName(data.name)
  if (typeof data.code !== 'string' || data.code.length > maxProjectCode) throw new Error('作品代码必须是文本，且不超过 200000 个字符。')
  if (!isVoxelLevelId(data.referenceId)) throw new Error('作品参考模型无效。')
  for (const key of ['createdAt', 'updatedAt']) {
    const value = data[key]
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw new Error('作品时间无效。')
  }
  if (String(data.updatedAt) < String(data.createdAt)) throw new Error('作品更新时间早于创建时间。')
  return { id: data.id, name, code: data.code, referenceId: data.referenceId, createdAt: data.createdAt as string, updatedAt: data.updatedAt as string }
}

export function parseProjectLibrary(value: unknown): VoxelProject[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error('作品库格式无效。')
  const projects = value.map(parseProject)
  if (new Set(projects.map(project => project.id)).size !== projects.length) throw new Error('作品标识重复。')
  return projects
}

export function uniqueProjectName(name: string, projects: VoxelProject[]): string {
  const base = projectName(name)
  let candidate = base
  for (let suffix = 2; projects.some(project => project.name === candidate); suffix++) {
    const end = `（${suffix}）`
    candidate = base.slice(0, maxProjectName - end.length) + end
  }
  return candidate
}

export function exportProject(project: VoxelProject): string {
  const { id: _id, ...content } = parseProject(project)
  return JSON.stringify({ format: 'pixel-code-lab.voxel-project', version: 1, mode: '3d', language: 'python', radius: voxelRadius, project: content }, null, 2)
}

export function importProject(raw: string, id: string): VoxelProject {
  if (new TextEncoder().encode(raw).byteLength > maxProjectFileBytes) throw new Error('作品文件不能超过 1 MB。')
  let data: Record<string, unknown>
  try { data = object(JSON.parse(raw)) } catch { throw new Error('无法读取作品文件，请选择导出的 JSON 作品文件。') }
  if (data.format !== 'pixel-code-lab.voxel-project' || data.version !== 1 || data.mode !== '3d' || data.language !== 'python' || data.radius !== voxelRadius) throw new Error('不支持此作品格式、版本、语言或空间尺寸。')
  return parseProject({ ...object(data.project), id })
}

export function projectFilename(name: string): string {
  // Windows filenames cannot contain control characters.
  // eslint-disable-next-line no-control-regex
  return `pixel-code-lab-${name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 80)}.json`
}
