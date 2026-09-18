export const voxelRadius = 8
export const voxelStarter = 'def voxel(x, y, z):\n    return 0\n'
export const voxelExamples = [
  { title: '立方体', code: 'def voxel(x, y, z):\n    if abs(x) <= 3 and abs(y) <= 3 and abs(z) <= 3:\n        return 2\n    return 0\n' },
  { title: '球体', code: 'def voxel(x, y, z):\n    if x*x + y*y + z*z <= 36:\n        return 5\n    return 0\n' },
  { title: '彩色阶梯', code: 'def voxel(x, y, z):\n    if abs(z) <= 2 and -5 <= x <= 5 and -5 <= y <= x:\n        return (x + 5) % 6 + 1\n    return 0\n' },
]
