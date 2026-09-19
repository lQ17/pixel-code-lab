export const voxelRadius = 8
export const voxelStarter = 'def voxel(x, y, z):\n    return 0\n'
export const voxelTargetIds = ['voxel-cube', 'voxel-sphere', 'voxel-stairs'] as const
export const voxelExamples = [
  { title: '立方体', code: 'def voxel(x, y, z):\n    if abs(x) <= 3 and abs(y) <= 3 and abs(z) <= 3:\n        return 2\n    return 0\n' },
  { title: '球体', code: 'def voxel(x, y, z):\n    if x*x + y*y + z*z <= 36:\n        return 5\n    return 0\n' },
  { title: '彩色阶梯', code: 'def voxel(x, y, z):\n    if abs(z) <= 2 and -5 <= x <= 5 and -5 <= y <= x:\n        return (x + 5) % 6 + 1\n    return 0\n' },
]

export function voxelReference(index: number): number[] {
  const colors: number[] = []
  for (let z=-voxelRadius; z<=voxelRadius; z++) for (let y=voxelRadius; y>=-voxelRadius; y--) for (let x=-voxelRadius; x<=voxelRadius; x++) {
    colors.push(index === 1 ? (x*x+y*y+z*z<=36 ? 5 : 0) : index === 2 ? (Math.abs(z)<=2 && x>=-5 && x<=5 && y>=-5 && y<=x ? (x+5)%6+1 : 0) : (Math.max(Math.abs(x),Math.abs(y),Math.abs(z))<=3 ? 2 : 0))
  }
  return colors
}
