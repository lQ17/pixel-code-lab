import type { VoxelControls } from '../hooks/useVoxelControls'
import { useEffect, useMemo, useRef, useState } from 'react'
import { palette, colorNames } from '../engine/levels'

type Point = [number, number, number]
const initial = { yaw: -0.65, pitch: 0.45, zoom: 1 }
function rotatePoint([x,y,z]: Point, view: typeof initial): Point {
  const a = Math.cos(view.yaw)*x + Math.sin(view.yaw)*z
  const b = -Math.sin(view.yaw)*x + Math.cos(view.yaw)*z
  return [a, Math.cos(view.pitch)*y-Math.sin(view.pitch)*b, Math.sin(view.pitch)*y+Math.cos(view.pitch)*b]
}
// Face vertices have outward normals. Interior faces are omitted.
const faces: { normal: Point; corners: Point[]; light: number }[] = [
  { normal: [1, 0, 0], corners: [[.5,-.5,-.5],[.5,.5,-.5],[.5,.5,.5],[.5,-.5,.5]], light: .82 },
  { normal: [-1, 0, 0], corners: [[-.5,-.5,.5],[-.5,.5,.5],[-.5,.5,-.5],[-.5,-.5,-.5]], light: .72 },
  { normal: [0, 1, 0], corners: [[-.5,.5,-.5],[-.5,.5,.5],[.5,.5,.5],[.5,.5,-.5]], light: 1 },
  { normal: [0, -1, 0], corners: [[-.5,-.5,.5],[-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5]], light: .55 },
  { normal: [0, 0, 1], corners: [[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5],[-.5,-.5,.5]], light: .9 },
  { normal: [0, 0, -1], corners: [[-.5,-.5,-.5],[-.5,.5,-.5],[.5,.5,-.5],[.5,-.5,-.5]], light: .65 },
]

export function VoxelCanvas({ colors, radius, controls, label = '三维体素画布', showControls = true }: { colors: number[]; radius: number; controls: VoxelControls; label?: string; showControls?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const { view, setView, axes, setAxes, cuts, setCuts } = controls
  const cutDrag = useRef<{ axis: number; x: number; y: number; value: number; dx: number; dy: number } | null>(null)
  const [size, setSize] = useState({ width: 1, height: 1 })
  const drag = useRef<{ x: number; y: number; id: number } | null>(null)
  const [pointer, setPointer] = useState<{ x:number; y:number; view:typeof view; cuts:typeof cuts; colors:typeof colors; size:typeof size } | null>(null)
  const surface = useMemo(() => {
    const side = radius * 2 + 1
    const get = (x: number, y: number, z: number) => x > cuts[0] || y > cuts[1] || z > cuts[2] || Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) > radius ? 0 : colors[(z + radius) * side * side + (radius - y) * side + x + radius] ?? 0
    const result: { voxel: Point; center: Point; normal: Point; corners: Point[]; color: number; light: number }[] = []
    for (let z = -radius; z <= radius; z++) for (let y = -radius; y <= radius; y++) for (let x = -radius; x <= radius; x++) {
      const color = get(x, y, z)
      if (!color) continue
      for (const face of faces) {
        const [nx, ny, nz] = face.normal
        if (get(x + nx, y + ny, z + nz)) continue
        result.push({ voxel: [x,y,z], center: [x + nx / 2, y + ny / 2, z + nz / 2], normal: face.normal, corners: face.corners.map(([a,b,c]) => [x+a,y+b,z+c]), color, light: face.light })
      }
    }
    return result
  }, [colors, radius, cuts])
  const hover = useMemo(() => {
    if (!pointer || pointer.view !== view || pointer.cuts !== cuts || pointer.colors !== colors || pointer.size !== size) return null
    const scale = Math.min(size.width,size.height)/((radius*2+3)*1.8)*view.zoom
    const px = (pointer.x-size.width/2)/scale, py = (size.height/2-pointer.y)/scale
    let nearest: { voxel: Point; color: number; depth: number } | null = null
    for (const face of surface) {
      const normal = rotatePoint(face.normal,view)
      if (normal[2] <= .001) continue
      const corners = face.corners.map(p => rotatePoint(p,view))
      let positive = false, negative = false
      for (let i=0;i<4;i++) {
        const a=corners[i], b=corners[(i+1)%4]
        const cross=(b[0]-a[0])*(py-a[1])-(b[1]-a[1])*(px-a[0])
        if (cross > 1e-7) positive=true
        if (cross < -1e-7) negative=true
      }
      if (positive && negative) continue
      const center=rotatePoint(face.center,view)
      const depth=center[2]-(normal[0]*(px-center[0])+normal[1]*(py-center[1]))/normal[2]
      if (!nearest || depth > nearest.depth) nearest={voxel:face.voxel,color:face.color,depth}
    }
    return nearest
  }, [pointer,view,cuts,colors,size,radius,surface])
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
  }, [setView])
  useEffect(() => {
    const element = canvas.current!
    const ctx = element.getContext('2d')!
    const dpr = window.devicePixelRatio || 1
    element.width = Math.round(size.width * dpr); element.height = Math.round(size.height * dpr)
    ctx.scale(dpr, dpr)
    ctx.fillStyle = '#0c1822'; ctx.fillRect(0, 0, size.width, size.height)
    const scale = Math.min(size.width, size.height) / ((radius * 2 + 3) * 1.8) * view.zoom
    const rotate = (point: Point) => rotatePoint(point, view)
    const project = (p: Point) => { const [x,y] = rotate(p); return [size.width / 2 + x * scale, size.height / 2 - y * scale] }
    // Hidden voxel centers provide context without obscuring the cut faces.
    const side = radius * 2 + 1
    colors.forEach((color, index) => {
      if (!color) return
      const x = index % side - radius, y = radius - Math.floor(index / side) % side, z = Math.floor(index / (side * side)) - radius
      if (x <= cuts[0] && y <= cuts[1] && z <= cuts[2]) return
      const [px,py] = project([x,y,z])
      ctx.fillStyle = palette[color]; ctx.globalAlpha = .22
      ctx.fillRect(px-.7,py-.7,1.4,1.4)
    })
    ctx.globalAlpha = 1
    const visible = surface.filter(f => rotate(f.normal)[2] > 0.001).map(f => ({ ...f, depth: rotate(f.center)[2] })).sort((a,b) => a.depth - b.depth)
    for (const face of visible) {
      const hex = palette[face.color].slice(1)
      const rgb = [0,2,4].map(i => Math.round(parseInt(hex.slice(i,i+2),16) * face.light))
      ctx.fillStyle = `rgb(${rgb.join(',')})`; ctx.strokeStyle = '#08131c66'; ctx.lineWidth = .6
      ctx.beginPath()
      face.corners.forEach((p,i) => { const [x,y] = project(p); if (i === 0) ctx.moveTo(x,y); else ctx.lineTo(x,y) })
      ctx.closePath(); ctx.fill(); ctx.stroke()
      if (hover && face.voxel.every((v,i) => v === hover.voxel[i])) {
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.stroke()
      }
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
  }, [surface, radius, view, axes, size, colors, cuts, hover])
  const scale = Math.min(size.width, size.height) / ((radius * 2 + 3) * 1.8) * view.zoom
  const vectors = ([ [1,0,0], [0,1,0], [0,0,1] ] as Point[]).map(point => {
    const [x,y] = rotatePoint(point, view)
    return [x,-y]
  })
  const clipped = cuts.some(value => value < radius)
  const side = radius*2+1
  const shown = colors.filter((color,index) => color && index%side-radius<=cuts[0] && radius-Math.floor(index/side)%side<=cuts[1] && Math.floor(index/(side*side))-radius<=cuts[2]).length
  return <div className="voxel-viewport" data-cuts={cuts.join(',')} data-visible-voxels={shown}>
    <canvas ref={canvas} aria-label={label} tabIndex={0} data-view={`${view.yaw},${view.pitch},${view.zoom}`} data-voxels={colors.filter(Boolean).length}
      onPointerDown={e => { setPointer(null); drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId }; e.currentTarget.setPointerCapture(e.pointerId) }}
      onPointerMove={e => { const last = drag.current; if (!last) { const box=e.currentTarget.getBoundingClientRect(); setPointer({ x:e.clientX-box.left,y:e.clientY-box.top,view,cuts,colors,size }); return } if (last.id !== e.pointerId) return; const dx = e.clientX-last.x, dy = e.clientY-last.y; drag.current = { x:e.clientX,y:e.clientY,id:e.pointerId }; setView(v => ({ ...v,yaw:v.yaw+dx*.008,pitch:Math.max(-1.45,Math.min(1.45,v.pitch+dy*.008)) })) }}
      onPointerLeave={() => setPointer(null)}
      onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }} onLostPointerCapture={() => { drag.current = null }}
      onKeyDown={e => { if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-'].includes(e.key)) return; e.preventDefault(); setView(v => ({ yaw:v.yaw+(e.key==='ArrowLeft'?-.1:e.key==='ArrowRight'?.1:0),pitch:Math.max(-1.45,Math.min(1.45,v.pitch+(e.key==='ArrowUp'?.1:e.key==='ArrowDown'?-.1:0))),zoom:Math.max(.4,Math.min(4,v.zoom*(e.key==='+'?1.1:e.key==='-'?1/1.1:1))) })) }}/>
    {hover && pointer && <p className="coordinate voxel-coordinate" role="tooltip" style={{left:Math.max(4,Math.min(pointer.x+12,size.width-280)),top:Math.max(4,pointer.y-34)}}><span>坐标:(</span><span className="coordinate-x">x: {hover.voxel[0]}</span><span>, </span><span className="coordinate-y">y: {hover.voxel[1]}</span><span>, </span><span className="coordinate-z">z: {hover.voxel[2]}</span><span>), </span><span className="coordinate-color">颜色: <i className="coordinate-swatch" style={{backgroundColor:palette[hover.color]}}/>{colorNames[hover.color]}</span></p>}
    {axes && vectors.map(([vx,vy], axis) => {
      if (Math.hypot(vx,vy) < .08) return null
      const label = ['X','Y','Z'][axis]
      return <button key={label} className="voxel-cut-handle" role="slider" aria-label={`${label} 轴剖切`} aria-valuemin={-radius-1} aria-valuemax={radius} aria-valuenow={cuts[axis]} aria-valuetext={`保留 ${label} ≤ ${cuts[axis]} 的体素`} title={`拖动剖切 ${label}；方向键逐层调整`}
        style={{ left: size.width/2+vx*scale*(cuts[axis]+.5), top:size.height/2+vy*scale*(cuts[axis]+.5), color:['#ff6b6b','#6ef09a','#61b5ff'][axis] }}
        onPointerDown={e => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); cutDrag.current={axis,x:e.clientX,y:e.clientY,value:cuts[axis],dx:vx*scale,dy:vy*scale} }}
        onPointerMove={e => { const d=cutDrag.current; if (!d || d.axis!==axis) return; const delta=((e.clientX-d.x)*d.dx+(e.clientY-d.y)*d.dy)/(d.dx*d.dx+d.dy*d.dy); const value=Math.max(-radius-1,Math.min(radius,Math.round(d.value+delta))); setCuts(previous => { const next: Point=[...previous]; next[axis]=value; return next }) }}
        onPointerUp={() => { cutDrag.current=null }} onPointerCancel={() => { cutDrag.current=null }} onLostPointerCapture={() => { cutDrag.current=null }}
        onKeyDown={e => { if (!['ArrowLeft','ArrowDown','ArrowRight','ArrowUp','Home','End'].includes(e.key)) return; e.preventDefault(); setCuts(previous => { const next: Point=[...previous]; next[axis]=e.key==='Home'?-radius-1:e.key==='End'?radius:Math.max(-radius-1,Math.min(radius,next[axis]+(['ArrowLeft','ArrowDown'].includes(e.key)?-1:1))); return next }) }}>{label}</button>
    })}
    {showControls && <div className="voxel-view-actions"><button disabled={!clipped} onClick={() => setCuts([radius,radius,radius])}>恢复完整模型</button><button aria-pressed={axes} onClick={() => setAxes(!axes)}>坐标辅助</button><button onClick={() => setView(initial)}>重置视角</button></div>}
    {clipped && <span className="voxel-cut-status" role="status">剖切预览 · 显示 {shown} / {colors.filter(Boolean).length} 个体素 · X≤{cuts[0]} Y≤{cuts[1]} Z≤{cuts[2]}</span>}
    <span className="voxel-gesture">拖动轴上手柄剖切 · 拖动空白旋转 · 滚轮缩放</span>
  </div>
}
