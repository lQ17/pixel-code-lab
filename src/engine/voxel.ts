export const voxelRadius = 8
export const voxelStarter = 'def voxel(x, y, z):\n    return 0\n'

interface VoxelLevel {
  title: string
  target: (x: number, y: number, z: number) => number
  exampleCode?: string
}

// IDs are persisted; display order may change without changing saved selections.
export const voxelLevels = {
  'voxel-cube': {
    title: '立方体',
    target: (x, y, z) => Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) <= 3 ? 2 : 0,
    exampleCode: 'def voxel(x, y, z):\n    if abs(x) <= 3 and abs(y) <= 3 and abs(z) <= 3:\n        return 2\n    return 0\n',
  },
  'voxel-hollow-cube': {
    title: '空心立方体',
    target: (x, y, z) => Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) === 4 ? 6 : 0,
    exampleCode: 'def voxel(x, y, z):\n    if max(abs(x), abs(y), abs(z)) == 4:\n        return 6\n    return 0\n',
  },
  'voxel-cylinder': {
    title: '圆柱',
    target: (x, y, z) => x*x + y*y <= 16 && Math.abs(z) <= 4 ? 4 : 0,
    exampleCode: 'def voxel(x, y, z):\n    if x*x + y*y <= 16 and abs(z) <= 4:\n        return 4\n    return 0\n',
  },
  'voxel-sphere': {
    title: '球体',
    target: (x, y, z) => x*x + y*y + z*z <= 36 ? 5 : 0,
    exampleCode: 'def voxel(x, y, z):\n    if x*x + y*y + z*z <= 36:\n        return 5\n    return 0\n',
  },
  'voxel-stairs': {
    title: '彩色阶梯',
    target: (x, y, z) => Math.abs(y) <= 2 && x >= -5 && x <= 5 && z >= -5 && z <= x ? (x + 5) % 6 + 1 : 0,
    exampleCode: 'def voxel(x, y, z):\n    if abs(y) <= 2 and -5 <= x <= 5 and -5 <= z <= x:\n        return (x + 5) % 6 + 1\n    return 0\n',
  },
  'voxel-pyramid': {
    title: '金字塔',
    target: (x, y, z) => z >= -5 && z <= 1 && Math.max(Math.abs(x), Math.abs(y)) <= 1 - z ? 3 : 0,
    exampleCode: 'def voxel(x, y, z):\n    if -5 <= z <= 1 and max(abs(x), abs(y)) <= 1 - z:\n        return 3\n    return 0\n',
  },
  'voxel-house': {
    title: '简单房屋',
    target: (x, y, z) => {
      if (z >= 1 && z <= 5 && Math.abs(y) <= 4 && Math.abs(x) <= 5 - z) return 1
      if (Math.abs(x) <= 3 && Math.abs(y) <= 3 && z >= -4 && z <= 0) {
        if (y === -3 && ((Math.abs(x) <= 1 && z <= -2) || (Math.abs(x) === 2 && z === -1))) return 5
        return 3
      }
      return 0
    },
    exampleCode: 'def voxel(x, y, z):\n    if 1 <= z <= 5 and abs(y) <= 4 and abs(x) <= 5 - z:\n        return 1\n    if abs(x) <= 3 and abs(y) <= 3 and -4 <= z <= 0:\n        if y == -3 and ((abs(x) <= 1 and z <= -2) or (abs(x) == 2 and z == -1)):\n            return 5\n        return 3\n    return 0\n',
  },
} satisfies Record<string, VoxelLevel>

export type VoxelLevelId = keyof typeof voxelLevels
export const voxelTargetIds = Object.keys(voxelLevels) as VoxelLevelId[]
export const defaultVoxelId: VoxelLevelId = 'voxel-cube'
// Frozen mapping for schemaVersion 1 saves written before ID-based references.
export const legacyVoxelExampleIds = ['voxel-cube', 'voxel-sphere', 'voxel-stairs'] as const

export function isVoxelLevelId(value: unknown): value is VoxelLevelId {
  return typeof value === 'string' && Object.hasOwn(voxelLevels, value)
}

export function getVoxelLevel(id: VoxelLevelId): VoxelLevel {
  return voxelLevels[id]
}

export function voxelReference(id: VoxelLevelId): number[] {
  const colors: number[] = []
  const { target } = getVoxelLevel(id)
  for (let z = -voxelRadius; z <= voxelRadius; z++) {
    for (let y = voxelRadius; y >= -voxelRadius; y--) {
      for (let x = -voxelRadius; x <= voxelRadius; x++) colors.push(target(x, y, z))
    }
  }
  return colors
}
