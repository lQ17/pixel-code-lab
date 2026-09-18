import { useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { colorNames, palette } from '../engine/levels'
import { CANVAS_SIZE, cellSize, hitCell, zoomView } from '../engine/view'
import type { ViewState } from '../engine/view'

function canvasPoint(event: { clientX: number; clientY: number }, canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect()
  const scale = Math.min(rect.width / CANVAS_SIZE, rect.height / CANVAS_SIZE)
  const offsetX = (rect.width - CANVAS_SIZE * scale) / 2
  const offsetY = (rect.height - CANVAS_SIZE * scale) / 2
  return {
    x: (event.clientX - rect.left - offsetX) / scale,
    y: (event.clientY - rect.top - offsetY) / scale,
    scale,
  }
}

export function PixelCanvas({ colors, radius, label, view, setView }: {
  colors: number[]; radius: number; label: string
  view: ViewState; setView: Dispatch<SetStateAction<ViewState>>
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null)
  const drag = useRef<{ x: number; y: number } | null>(null)
  const size = radius * 2 + 1
  useEffect(() => {
    const canvas = ref.current!
    const context = canvas.getContext('2d')!
    const cell = cellSize(radius, view.zoom)
    const left = 300 + view.x - size * cell / 2
    const top = 300 + view.y - size * cell / 2
    context.fillStyle = '#0c1822'
    context.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)
    colors.forEach((color, index) => {
      const x = left + index % size * cell
      const y = top + Math.floor(index / size) * cell
      context.fillStyle = color === 0 ? '#172a36' : palette[color]
      context.fillRect(x, y, cell, cell)
      context.strokeStyle = '#395464'
      context.lineWidth = 0.8
      context.strokeRect(x, y, cell, cell)
    })
    context.save()
    context.beginPath(); context.rect(left, top, size * cell, size * cell); context.clip()
    context.strokeStyle = '#6495a8'; context.lineWidth = 1.4
    context.beginPath()
    context.moveTo(300 + view.x, top); context.lineTo(300 + view.x, top + size * cell)
    context.moveTo(left, 300 + view.y); context.lineTo(left + size * cell, 300 + view.y)
    context.stroke(); context.restore()
    context.fillStyle = '#7aafbf'; context.font = '18px sans-serif'
    context.fillText('y ↑', 12, 24); context.fillText('x →', 548, 584)
  }, [colors, radius, size, view])
  useEffect(() => {
    const canvas = ref.current!
    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      const { x, y } = canvasPoint(event, canvas)
      setView(previous => zoomView(previous, previous.zoom * Math.exp(-Math.max(-200, Math.min(200, event.deltaY)) * 0.003), x, y))
      setPointer({ x, y })
    }
    canvas.addEventListener('wheel', wheel, { passive: false })
    return () => canvas.removeEventListener('wheel', wheel)
  }, [setView])
  const hit = pointer ? hitCell(pointer.x, pointer.y, radius, view) : null
  const color = hit ? colors[hit.row * size + hit.col] : undefined
  return <div className="canvas-area"><canvas ref={ref} width={CANVAS_SIZE} height={CANVAS_SIZE} aria-label={label} className="pixel-canvas" data-view={`${view.zoom},${view.x},${view.y}`}
    onPointerDown={event => {
      if (event.button !== 0) return
      event.currentTarget.setPointerCapture(event.pointerId)
      drag.current = { x: event.clientX, y: event.clientY }
    }}
    onPointerUp={event => { drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) }}
    onPointerCancel={() => { drag.current = null }}
    onLostPointerCapture={() => { drag.current = null }}
    onPointerLeave={() => setPointer(null)}
    onPointerMove={event => {
      const point = canvasPoint(event, event.currentTarget)
      if (drag.current) {
        const dx = (event.clientX - drag.current.x) / point.scale
        const dy = (event.clientY - drag.current.y) / point.scale
        setView(previous => ({ ...previous, x: previous.x + dx, y: previous.y + dy }))
        drag.current = { x: event.clientX, y: event.clientY }
      }
      setPointer({ x: point.x, y: point.y })
    }}/><p className="coordinate">{hit && color !== undefined ? `(${hit.x}, ${hit.y}) · ${color} ${colorNames[color]}` : pointer ? '画布范围外' : ''}</p></div>
}
