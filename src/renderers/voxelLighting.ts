import type { Point } from './voxelGeometry'

// World-space light, independent of camera rotation.
const sun: Point = [-0.65, 0.25, 1]
const sunLength = Math.hypot(...sun)
type Occupancy = (x: number, y: number, z: number) => number

export function directionalLight(normal: Point): number {
  const diffuse = Math.max(0, normal.reduce((sum, value, axis) => sum + value * sun[axis], 0) / sunLength)
  return Math.min(1, 0.42 + 0.7 * diffuse)
}

// Sample only the exterior layer; coplanar neighbors never darken a flat wall.
export function cornerOcclusion(voxel: Point, normal: Point, corners: Point[], get: Occupancy): number[] {
  const tangents = [0, 1, 2].filter(axis => normal[axis] === 0)
  const outside = voxel.map((v, axis) => v + normal[axis]) as Point
  return corners.map(corner => {
    const first: Point = [...outside], second: Point = [...outside], diagonal: Point = [...outside]
    const a = tangents[0], b = tangents[1]
    first[a] += Math.sign(corner[a]); second[b] += Math.sign(corner[b])
    diagonal[a] += Math.sign(corner[a]); diagonal[b] += Math.sign(corner[b])
    const sideA = Number(Boolean(get(...first))), sideB = Number(Boolean(get(...second)))
    return (sideA && sideB ? 3 : sideA + sideB + Number(Boolean(get(...diagonal)))) / 3
  })
}

export function litColor(hex: string, brightness: number): string {
  return `rgb(${[1, 3, 5].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * brightness)).join(',')})`
}

/** Shade the current face path locally, preserving bright, unobstructed corners. */
export function paintOcclusion(ctx: CanvasRenderingContext2D, points: number[][], occlusion: number[]) {
  if (!occlusion.some(value => value > 0)) return
  ctx.save()
  ctx.clip()
  for (let i = 0; i < 4; i++) {
    if (!occlusion[i]) continue
    const [x, y] = points[i]
    const next = points[(i + 1) % 4], previous = points[(i + 3) % 4]
    const reach = Math.max(Math.hypot(next[0] - x, next[1] - y), Math.hypot(previous[0] - x, previous[1] - y)) * 0.95
    if (reach < 0.01) continue
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, reach)
    gradient.addColorStop(0, `rgba(4, 9, 18, ${occlusion[i] * 0.78})`)
    gradient.addColorStop(1, 'rgba(4, 9, 18, 0)')
    ctx.fillStyle = gradient
    ctx.fillRect(x - reach, y - reach, reach * 2, reach * 2)
  }
  ctx.restore()
}
