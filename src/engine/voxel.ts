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
    target: (x, y, z) => x*x + z*z <= 16 && Math.abs(y) <= 4 ? 4 : 0,
    exampleCode: 'def voxel(x, y, z):\n    if x*x + z*z <= 16 and abs(y) <= 4:\n        return 4\n    return 0\n',
  },
  'voxel-sphere': {
    title: '球体',
    target: (x, y, z) => x*x + y*y + z*z <= 36 ? 5 : 0,
    exampleCode: 'def voxel(x, y, z):\n    if x*x + y*y + z*z <= 36:\n        return 5\n    return 0\n',
  },
  'voxel-stairs': {
    title: '彩色阶梯',
    target: (x, y, z) => Math.abs(z) <= 2 && x >= -5 && x <= 5 && y >= -5 && y <= x ? (x + 5) % 6 + 1 : 0,
    exampleCode: 'def voxel(x, y, z):\n    if abs(z) <= 2 and -5 <= x <= 5 and -5 <= y <= x:\n        return (x + 5) % 6 + 1\n    return 0\n',
  },
  'voxel-pyramid': {
    title: '金字塔',
    target: (x, y, z) => y >= -5 && y <= 1 && Math.max(Math.abs(x), Math.abs(z)) <= 1 - y ? 3 : 0,
    exampleCode: 'def voxel(x, y, z):\n    if -5 <= y <= 1 and max(abs(x), abs(z)) <= 1 - y:\n        return 3\n    return 0\n',
  },
  'voxel-house': {
    title: '简单房屋',
    target: (x, y, z) => {
      if (y >= 1 && y <= 5 && Math.abs(z) <= 4 && Math.abs(x) <= 5 - y) return 1
      if (Math.abs(x) <= 3 && Math.abs(z) <= 3 && y >= -4 && y <= 0) {
        if (z === 3 && ((Math.abs(x) <= 1 && y <= -2) || (Math.abs(x) === 2 && y === -1))) return 5
        return 3
      }
      return 0
    },
    exampleCode: 'def voxel(x, y, z):\n    if 1 <= y <= 5 and abs(z) <= 4 and abs(x) <= 5 - y:\n        return 1\n    if abs(x) <= 3 and abs(z) <= 3 and -4 <= y <= 0:\n        if z == 3 and ((abs(x) <= 1 and y <= -2) or (abs(x) == 2 and y == -1)):\n            return 5\n        return 3\n    return 0\n',
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
