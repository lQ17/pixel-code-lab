import { palette } from '../engine/levels'
import { pixelRadius } from '../engine/pixelCreation'
import { voxelRadius } from '../engine/voxel'
import { projectFilename } from '../engine/projects'
import type { SpaceMode } from '../runners/types'
import { faces, rotatePoint, type Point } from './voxelGeometry'
import { directionalLight, cornerOcclusion, paintOcclusion, litColor } from './voxelLighting'

// Clean, complete artwork: no axes, selection, cuts or editor overlays.
// A fixed camera makes library previews and exports comparable across sessions.
export function projectImage(colors: number[], mode: SpaceMode, thumbnail = false) {
  const canvas = document.createElement('canvas')
  const radius = mode === '2d' ? pixelRadius : voxelRadius
  const side = radius * 2 + 1
  if (colors.length !== side ** (mode === '2d' ? 2 : 3) || colors.some(c => !Number.isInteger(c) || c < 0 || c > 8)) throw new Error('作品图像数据无效。')
  canvas.width = canvas.height = mode === '2d' ? side * (thumbnail ? 8 : 40) : thumbnail ? 192 : 1024
  const ctx = canvas.getContext('2d')!
  if (mode === '2d') {
    const cell = canvas.width / side
    colors.forEach((color, i) => {
      if (!color) return
      ctx.fillStyle = palette[color]
      ctx.fillRect(i % side * cell, Math.floor(i / side) * cell, cell, cell)
    })
  } else {
    const view = { yaw: -.65, pitch: .45, zoom: 1 }
    const scale = canvas.width / ((side + 2) * 1.8)
    const get = (x: number, y: number, z: number) => Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) > radius ? 0 : colors[(z + radius) * side * side + (radius - y) * side + x + radius]
    const visible: { corners: Point[]; color: number; light: number; ao: number[]; depth: number }[] = []
    for (let z = -radius; z <= radius; z++) for (let y = -radius; y <= radius; y++) for (let x = -radius; x <= radius; x++) {
      const color = get(x, y, z)
      if (!color) continue
      for (const face of faces) {
        const [nx, ny, nz] = face.normal
        if (get(x + nx, y + ny, z + nz) || rotatePoint(face.normal, view)[2] <= .001) continue
        visible.push({ color, light: directionalLight(face.normal), ao: cornerOcclusion([x, y, z], face.normal, face.corners, get), depth: rotatePoint([x + nx / 2, y + ny / 2, z + nz / 2], view)[2], corners: face.corners.map(([a, b, c]) => [x + a, y + b, z + c]) })
      }
    }
    for (const face of visible.sort((a, b) => a.depth - b.depth)) {
      ctx.fillStyle = litColor(palette[face.color], face.light)
      ctx.beginPath()
      const points = face.corners.map(point => {
        const [x, y] = rotatePoint(point, view)
        return [canvas.width / 2 + x * scale, canvas.height / 2 - y * scale]
      })
      points.forEach(([x, y], i) => {
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.closePath(); ctx.fill()
      ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = .5; ctx.stroke()
      paintOcclusion(ctx, points, face.ao)
    }
  }
  if (thumbnail) {
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    let left = canvas.width, top = canvas.height, right = -1, bottom = -1
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      if (!pixels[(y * canvas.width + x) * 4 + 3]) continue
      left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y)
    }
    if (right >= left) {
      const fitted = document.createElement('canvas'); fitted.width = fitted.height = canvas.width
      const context = fitted.getContext('2d')!
      context.imageSmoothingEnabled = mode === '3d'
      const width = right - left + 1, height = bottom - top + 1
      const scale = (fitted.width - 24) / Math.max(width, height)
      context.drawImage(canvas, left, top, width, height, (fitted.width - width * scale) / 2, (fitted.height - height * scale) / 2, width * scale, height * scale)
      return fitted
    }
  }
  return canvas
}

export function downloadPng(colors: number[], mode: SpaceMode, name: string) {
  const link = document.createElement('a')
  link.href = projectImage(colors, mode).toDataURL('image/png')
  link.download = projectFilename(name || '未命名作品').replace(/\.json$/, '.png')
  document.body.append(link); link.click(); link.remove()
}
