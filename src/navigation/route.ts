import { levels } from '../engine/levels'
import { defaultVoxelId, voxelTargetIds, type VoxelLevelId } from '../engine/voxel'
import type { ProgressData } from '../hooks/useProgress'

export type Mode = '2d' | '3d'
export type Activity = 'challenge' | 'create'

export interface StartRoute {
  kind: 'start'
  mode: Mode
  activity: Activity
}

export interface WorkChallengeRoute {
  kind: 'work'
  mode: Mode
  activity: 'challenge'
  levelId: string // square | checker | circle or voxelTargetIds
}

export interface WorkCreateRoute {
  kind: 'work'
  mode: Mode
  activity: 'create'
}

export type WorkRoute = WorkChallengeRoute | WorkCreateRoute
export type AppRoute = StartRoute | WorkRoute

const valid2dLevels = new Set(levels.map(l => l.id))
const valid3dLevels = new Set(voxelTargetIds)

export function isValid2dLevel(id: string): boolean {
  return valid2dLevels.has(id)
}

export function isValid3dLevel(id: string): id is VoxelLevelId {
  return valid3dLevels.has(id as VoxelLevelId)
}

export function getDefaultStartRoute(progress: ProgressData): StartRoute {
  const mode = progress.mode ?? '2d'
  const activity = mode === '3d' ? (progress.voxelActivity ?? 'create') : (progress.pixelActivity ?? 'challenge')
  return { kind: 'start', mode, activity }
}

export function getResumeRoute(progress: ProgressData): WorkRoute {
  const mode = progress.mode ?? '2d'
  if (mode === '3d') {
    const activity = progress.voxelActivity ?? 'create'
    if (activity === 'create') {
      return { kind: 'work', mode: '3d', activity: 'create' }
    }
    const voxelLevelId = progress.voxelLevelId && isValid3dLevel(progress.voxelLevelId) ? progress.voxelLevelId : defaultVoxelId
    return { kind: 'work', mode: '3d', activity: 'challenge', levelId: voxelLevelId }
  } else {
    const activity = progress.pixelActivity ?? 'challenge'
    if (activity === 'create') {
      return { kind: 'work', mode: '2d', activity: 'create' }
    }
    const levelId = progress.levelId && isValid2dLevel(progress.levelId) ? progress.levelId : (levels[0]?.id ?? 'square')
    return { kind: 'work', mode: '2d', activity: 'challenge', levelId }
  }
}

export function routeToHash(route: AppRoute): string {
  if (route.kind === 'start') {
    return `#/start/${route.activity}/${route.mode}`
  }
  if (route.activity === 'create') {
    return `#/work/${route.mode}/create`
  }
  return `#/work/${route.mode}/challenge/${route.levelId}`
}

export function parseHash(rawHash: string, progress: ProgressData): AppRoute {
  const hash = rawHash.startsWith('#') ? rawHash.slice(1) : rawHash
  const segments = hash.split('/').filter(Boolean)

  if (segments.length === 0) {
    return getDefaultStartRoute(progress)
  }

  const [top, p1, p2, p3] = segments

  if (top === 'start') {
    const activity = (p1 === 'challenge' || p1 === 'create') ? p1 : (progress.mode === '3d' ? (progress.voxelActivity ?? 'create') : (progress.pixelActivity ?? 'challenge'))
    const mode: Mode = (p2 === '2d' || p2 === '3d') ? p2 : (progress.mode ?? '2d')
    return { kind: 'start', mode, activity }
  }

  if (top === 'work') {
    const mode: Mode = (p1 === '2d' || p1 === '3d') ? p1 : '2d'
    if (p2 === 'create') {
      return { kind: 'work', mode, activity: 'create' }
    }
    if (p2 === 'challenge') {
      if (mode === '2d') {
        if (p3 && isValid2dLevel(p3)) {
          return { kind: 'work', mode: '2d', activity: 'challenge', levelId: p3 }
        }
        return { kind: 'start', mode: '2d', activity: 'challenge' }
      } else {
        if (p3 && isValid3dLevel(p3)) {
          return { kind: 'work', mode: '3d', activity: 'challenge', levelId: p3 }
        }
        return { kind: 'start', mode: '3d', activity: 'challenge' }
      }
    }
    // 未知子路径，回退到对应的 start
    return { kind: 'start', mode, activity: 'challenge' }
  }

  // 无法识别的路径，回退到默认入口
  return getDefaultStartRoute(progress)
}
