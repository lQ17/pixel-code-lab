import { targetColors } from './evaluate'

export const pixelRadius = 10
export const pixelReferences = {
  'pixel-cross': {
    title: '彩色十字',
    target: (x: number, y: number) => Math.abs(x) <= 1 && Math.abs(y) <= 7 ? 3 : Math.abs(y) <= 1 && Math.abs(x) <= 7 ? 5 : 0,
    exampleCode: 'def pixel(x, y):\n    if abs(x) <= 1 and abs(y) <= 7:\n        return 3\n    if abs(y) <= 1 and abs(x) <= 7:\n        return 5\n    return 0\n',
  },
  'pixel-diamond': {
    title: '菱形花纹',
    target: (x: number, y: number) => Math.abs(x) + Math.abs(y) <= 8 ? (Math.abs(x) + Math.abs(y)) % 6 + 1 : 0,
    exampleCode: 'def pixel(x, y):\n    distance = abs(x) + abs(y)\n    if distance <= 8:\n        return distance % 6 + 1\n    return 0\n',
  },
  'pixel-tree': {
    title: '像素小树',
    target: (x: number, y: number) => y >= -1 && y <= 7 && Math.abs(x) <= (7 - y) / 2 ? 4 : Math.abs(x) <= 1 && y >= -6 && y < -1 ? 2 : 0,
    exampleCode: 'def pixel(x, y):\n    if -1 <= y <= 7 and abs(x) <= (7 - y) / 2:\n        return 4\n    if abs(x) <= 1 and -6 <= y < -1:\n        return 2\n    return 0\n',
  },
}
export type PixelReferenceId = keyof typeof pixelReferences
export const pixelReferenceIds = Object.keys(pixelReferences) as PixelReferenceId[]
export const defaultPixelId: PixelReferenceId = 'pixel-cross'
export function isPixelReferenceId(value: unknown): value is PixelReferenceId {
  return typeof value === 'string' && Object.hasOwn(pixelReferences, value)
}
export function pixelReference(id: PixelReferenceId) {
  return targetColors({ radius: pixelRadius, target: pixelReferences[id].target })
}
