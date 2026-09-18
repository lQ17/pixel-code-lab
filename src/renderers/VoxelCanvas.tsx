import { useEffect, useMemo, useRef, useState } from 'react'
import { palette } from '../engine/levels'

type Point = [number, number, number]
const initial = { yaw: -0.65, pitch: 0.45, zoom: 1 }
// Face vertices have outward normals. Interior faces are omitted.
const faces: { normal: Point; corners: Point[]; light: number }[] = [
  { normal: [1, 0, 0], corners: [[.5,-.5,-.5],[.5,.5,-.5],[.5,.5,.5],[.5,-.5,.5]], light: .82 },
  { normal: [-1, 0, 0], corners: [[-.5,-.5,.5],[-.5,.5,.5],[-.5,.5,-.5],[-.5,-.5,-.5]], light: .72 },
  { normal: [0, 1, 0], corners: [[-.5,.5,-.5],[-.5,.5,.5],[.5,.5,.5],[.5,.5,-.5]], light: 1 },
  { normal: [0, -1, 0], corners: [[-.5,-.5,.5],[-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5]], light: .55 },
  { normal: [0, 0, 1], corners: [[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5],[-.5,-.5,.5]], light: .9 },
  { normal: [0, 0, -1], corners: [[-.5,-.5,-.5],[-.5,.5,-.5],[.5,.5,-.5],[.5,-.5,-.5]], light: .65 },
]

export function VoxelCanvas({ colors, radius }: { colors: number[]; radius: number }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [view, setView] = useState(initial)
  const [axes, setAxes] = useState(true)
  const [size, setSize] = useState({ width: 1, height: 1 })
  const drag = useRef<{ x: number; y: number; id: number } | null>(null)
  const surface = useMemo(() => {
    const side = radius * 2 + 1
    const get = (x: number, y: number, z: number) => Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) > radius ? 0 : colors[(z + radius) * side * side + (radius - y) * side + x + radius] ?? 0
    const result: { center: Point; normal: Point; corners: Point[]; color: number; light: number }[] = []
    for (let z = -radius; z <= radius; z++) for (let y = -radius; y <= radius; y++) for (let x = -radius; x <= radius; x++) {
      const color = get(x, y, z)
      if (!color) continue
      for (const face of faces) {
        const [nx, ny, nz] = face.normal
        if (get(x + nx, y + ny, z + nz)) continue
        result.push({ center: [x + nx / 2, y + ny / 2, z + nz / 2], normal: face.normal, corners: face.corners.map(([a,b,c]) => [x+a,y+b,z+c]), color, light: face.light })
      }
    }
    return result
  }, [colors, radius])
  useEffect(() => {
    const element = canvas.current!
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }))
    observer.observe(element)
    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      setView(v => ({ ...v, zoom: Math.max(.4, Math.min(4, v.zoom * Math.exp(-event.deltaY * .001))) }))
    }
    element.addEventListener('wheel', wheel, { passive: false })
    return () => { observer.disconnect(); element.removeEventListener('wheel', wheel) }
  }, [])
  useEffect(() => {
    const element = canvas.current!
    const ctx = element.getContext('2d')!
    const dpr = window.devicePixelRatio || 1
    element.width = Math.round(size.width * dpr); element.height = Math.round(size.height * dpr)
    ctx.scale(dpr, dpr)
    ctx.fillStyle = '#0c1822'; ctx.fillRect(0, 0, size.width, size.height)
    const scale = Math.min(size.width, size.height) / ((radius * 2 + 3) * 1.8) * view.zoom
    const rotate = ([x,y,z]: Point): Point => {
      const a = Math.cos(view.yaw) * x + Math.sin(view.yaw) * z
      const b = -Math.sin(view.yaw) * x + Math.cos(view.yaw) * z
      return [a, Math.cos(view.pitch) * y - Math.sin(view.pitch) * b, Math.sin(view.pitch) * y + Math.cos(view.pitch) * b]
    }
    const project = (p: Point) => { const [x,y] = rotate(p); return [size.width / 2 + x * scale, size.height / 2 - y * scale] }
    const visible = surface.filter(f => rotate(f.normal)[2] > 0.001).map(f => ({ ...f, depth: rotate(f.center)[2] })).sort((a,b) => a.depth - b.depth)
    for (const face of visible) {
      const hex = palette[face.color].slice(1)
      const rgb = [0,2,4].map(i => Math.round(parseInt(hex.slice(i,i+2),16) * face.light))
      ctx.fillStyle = `rgb(${rgb.join(',')})`; ctx.strokeStyle = '#08131c66'; ctx.lineWidth = .6
      ctx.beginPath()
      face.corners.forEach((p,i) => { const [x,y] = project(p); if (i === 0) ctx.moveTo(x,y); else ctx.lineTo(x,y) })
      ctx.closePath(); ctx.fill(); ctx.stroke()
    }
    if (axes) {
      // Select a silhouette edge for each axis. All coordinates use the same
      // world projection as the voxels; labels remain upright in screen space.
      const extent = radius + .5
      const definitions = [
        { axis: 0, color: '#ff6b6b', label: 'X' },
        { axis: 1, color: '#6ef09a', label: 'Y' },
        { axis: 2, color: '#61b5ff', label: 'Z' },
      ]
      // The box encloses the outer faces of all cells, not their centers.
      ctx.strokeStyle = '#d3e5ee'; ctx.lineWidth = 1.3
      for (let axis=0; axis<3; axis++) {
        const others = [0,1,2].filter(i => i !== axis)
        for (const a of [-1,1]) for (const b of [-1,1]) {
          const start: Point = [0,0,0]; start[axis] = -extent
          start[others[0]] = a*extent; start[others[1]] = b*extent
          const end: Point = [...start]; end[axis] = extent
          const [x1,y1] = project(start), [x2,y2] = project(end)
          ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke()
        }
      }
      // Center directions deliberately overlay the model, as dashed guides.
      for (const { axis, color } of definitions) {
        const start: Point = [0,0,0], end: Point = [0,0,0]
        start[axis] = -extent; end[axis] = extent
        const [ax,ay] = project(start), [bx,by] = project(end)
        const distance = Math.hypot(bx-ax,by-ay)
        if (distance < 1) continue
        const dx = (bx-ax)/distance, dy = (by-ay)/distance
        ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.setLineDash([4,5])
        ctx.beginPath(); ctx.moveTo(ax,ay); ctx.lineTo(bx,by); ctx.stroke()
        ctx.setLineDash([])
        ctx.beginPath(); ctx.moveTo(bx-dx*8-dy*3,by-dy*8+dx*3); ctx.lineTo(bx,by); ctx.lineTo(bx-dx*8+dy*3,by-dy*8-dx*3); ctx.stroke()
      }
      ctx.font = '11px Consolas'; ctx.lineWidth = 1.2
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      for (const { axis, color, label } of definitions) {
        const unit: Point = [0,0,0]; unit[axis] = 1
        const [ux, uy] = rotate(unit)
        const length = Math.hypot(ux, uy)
        // An axis viewed exactly end-on has no readable projected scale.
        if (length < .025) continue
        const dx = ux / length, dy = -uy / length
        const others = [0,1,2].filter(i => i !== axis)
        const candidates: { base: Point; distance: number; nx: number; ny: number }[] = []
        for (const first of [-1,1]) for (const second of [-1,1]) {
          const base: Point = [0,0,0]
          base[others[0]] = first * extent; base[others[1]] = second * extent
          if (axis !== 1 && base[1] > 0) continue
          const [px,py] = project(base)
          const signed = (px-size.width/2)*(-dy)+(py-size.height/2)*dx
          const sign = signed < 0 ? -1 : 1
          candidates.push({ base, distance: Math.abs(signed), nx:-dy*sign, ny:dx*sign })
        }
        // X/Z stay on the bottom of the world; Y uses the right silhouette edge.
        candidates.sort((a,b) => Math.abs(b.distance-a.distance) > .01 ? b.distance-a.distance : (axis === 1 ? b.nx-a.nx : b.ny-a.ny))
        const { base, nx, ny } = candidates[0]
        const at = (value: number) => { const p: Point = [...base]; p[axis] = value; const [x,y] = project(p); return [x+nx*7,y+ny*7] }
        const [ax,ay] = at(-radius-.5), [bx,by] = at(radius+.95)
        ctx.strokeStyle = color; ctx.fillStyle = color
        ctx.beginPath(); ctx.moveTo(ax,ay); ctx.lineTo(bx,by)
        ctx.moveTo(bx-dx*7-dy*3,by-dy*7+dx*3); ctx.lineTo(bx,by); ctx.lineTo(bx-dx*7+dy*3,by-dy*7-dx*3); ctx.stroke()
        const stride = Math.max(1,Math.ceil(14/(scale*length)))
        const text = (value: string, x: number, y: number) => {
          ctx.lineWidth = 3; ctx.strokeStyle = '#0c1822'
          ctx.strokeText(value,x,y); ctx.fillText(value,x,y)
          ctx.lineWidth = 1.2; ctx.strokeStyle = color
        }
        for (let value=-radius; value<=radius; value++) {
          const [x,y] = at(value)
          ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+nx*5,y+ny*5); ctx.stroke()
          if (value % stride === 0) text(value > 0 ? '+'+value : String(value),x+nx*13,y+ny*13)
        }
        text('+'+label,bx+dx*14+nx*14,by+dy*14+ny*14)
      }
    }
  }, [surface, radius, view, axes, size])
  return <div className="voxel-viewport">
    <canvas ref={canvas} aria-label="三维体素画布" tabIndex={0} data-view={`${view.yaw},${view.pitch},${view.zoom}`} data-voxels={colors.filter(Boolean).length}
      onPointerDown={e => { drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId }; e.currentTarget.setPointerCapture(e.pointerId) }}
      onPointerMove={e => { const last = drag.current; if (!last || last.id !== e.pointerId) return; const dx = e.clientX-last.x, dy = e.clientY-last.y; drag.current = { x:e.clientX,y:e.clientY,id:e.pointerId }; setView(v => ({ ...v,yaw:v.yaw+dx*.008,pitch:Math.max(-1.45,Math.min(1.45,v.pitch+dy*.008)) })) }}
      onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }} onLostPointerCapture={() => { drag.current = null }}
      onKeyDown={e => { if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-'].includes(e.key)) return; e.preventDefault(); setView(v => ({ yaw:v.yaw+(e.key==='ArrowLeft'?-.1:e.key==='ArrowRight'?.1:0),pitch:Math.max(-1.45,Math.min(1.45,v.pitch+(e.key==='ArrowUp'?.1:e.key==='ArrowDown'?-.1:0))),zoom:Math.max(.4,Math.min(4,v.zoom*(e.key==='+'?1.1:e.key==='-'?1/1.1:1))) })) }}/>
    <div className="voxel-view-actions"><button aria-pressed={axes} onClick={() => setAxes(!axes)}>坐标辅助</button><button onClick={() => setView(initial)}>重置视角</button></div>
    <span className="voxel-gesture">拖动旋转 · 滚轮缩放 · 方向键旋转</span>
  </div>
}
