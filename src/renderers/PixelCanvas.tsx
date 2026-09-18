import { useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { palette } from '../engine/levels'
import { CANVAS_SIZE, cellSize, hitCell, zoomView } from '../engine/view'
import type { ViewState } from '../engine/view'

type PointerState = { x: number; y: number; screenX: number; screenY: number; width: number }

function canvasScale(width: number, height: number) {
  const axisReserve = Math.min(34, Math.max(24, height * 0.16))
  return Math.min(width / CANVAS_SIZE, Math.max(1, height - axisReserve) / CANVAS_SIZE)
}

function canvasPoint(event: { clientX: number; clientY: number }, canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect()
  const scale = canvasScale(rect.width, rect.height)
  return {
    x: (event.clientX - rect.left - rect.width / 2) / scale + CANVAS_SIZE / 2,
    y: (event.clientY - rect.top - rect.height / 2) / scale + CANVAS_SIZE / 2,
    screenX: event.clientX - rect.left,
    screenY: event.clientY - rect.top,
    width: rect.width,
    scale,
  }
}

export function PixelCanvas({ colors, radius, label, view, setView }: {
  colors: number[]; radius: number; label: string
  view: ViewState; setView: Dispatch<SetStateAction<ViewState>>
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [pointer, setPointer] = useState<PointerState | null>(null)
  const drag = useRef<{ x: number; y: number } | null>(null)
  const size = radius * 2 + 1
  useEffect(() => {
    const canvas = ref.current!
    const draw = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      const backingWidth = Math.max(1, Math.round(rect.width * dpr))
      const backingHeight = Math.max(1, Math.round(rect.height * dpr))
      if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
        canvas.width = backingWidth
        canvas.height = backingHeight
      }
      const context = canvas.getContext('2d')!
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      const viewportScale = canvasScale(rect.width, rect.height)
      const cell = cellSize(radius, view.zoom) * viewportScale
      const left = rect.width / 2 + (view.x - size * cell / viewportScale / 2) * viewportScale
      const top = rect.height / 2 + (view.y - size * cell / viewportScale / 2) * viewportScale
      context.fillStyle = '#0c1822'
      context.fillRect(0, 0, rect.width, rect.height)
      colors.forEach((color, index) => {
        const x = left + index % size * cell
        const y = top + Math.floor(index / size) * cell
        context.fillStyle = color === 0 ? '#172a36' : palette[color]
        context.fillRect(x, y, cell, cell)
        context.strokeStyle = '#395464'
        context.lineWidth = 0.8
        context.strokeRect(x, y, cell, cell)
      })
      const side = size * cell
      const axisOffset = Math.max(8, Math.min(14, 12 * viewportScale))
      const axisX = left - axisOffset
      const axisY = top + side + axisOffset
      const axisWidth = Math.max(1.5, Math.min(3, 2.4 * viewportScale))
      const arrowSize = Math.max(5, Math.min(9, 7 * viewportScale))
      const tickFontSize = Math.max(10, Math.min(16, cell * 0.32))
      context.save()
      context.strokeStyle = '#22bd59'
      context.fillStyle = '#22bd59'
      context.lineWidth = axisWidth
      context.lineCap = 'round'
      context.lineJoin = 'round'
      context.beginPath()
      context.moveTo(axisX, axisY)
      context.lineTo(axisX, top - arrowSize)
      context.moveTo(axisX, top - arrowSize)
      context.lineTo(axisX - arrowSize * 0.58, top)
      context.moveTo(axisX, top - arrowSize)
      context.lineTo(axisX + arrowSize * 0.58, top)
      context.moveTo(axisX, axisY)
      context.lineTo(left + side + arrowSize, axisY)
      context.moveTo(left + side + arrowSize, axisY)
      context.lineTo(left + side, axisY - arrowSize * 0.58)
      context.moveTo(left + side + arrowSize, axisY)
      context.lineTo(left + side, axisY + arrowSize * 0.58)
      context.stroke()
      context.font = `600 ${tickFontSize}px Consolas, monospace`
      context.textAlign = 'center'
      context.textBaseline = 'top'
      for (let index = 0; index < size; index += 1) {
        context.fillText(String(index - radius), left + (index + 0.5) * cell, axisY + 5)
      }
      context.textAlign = 'right'
      context.textBaseline = 'middle'
      for (let index = 0; index < size; index += 1) {
        context.fillText(String(radius - index), axisX - 5, top + (index + 0.5) * cell)
      }
      context.restore()
    }
    const observer = new ResizeObserver(draw)
    observer.observe(canvas)
    draw()
    return () => observer.disconnect()
  }, [colors, radius, size, view])
  useEffect(() => {
    const canvas = ref.current!
    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      const point = canvasPoint(event, canvas)
      setView(previous => zoomView(previous, previous.zoom * Math.exp(-Math.max(-200, Math.min(200, event.deltaY)) * 0.003), point.x, point.y))
      setPointer(point)
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
      setPointer(point)
    }}/><p className="coordinate" style={pointer && hit && color !== undefined ? { left: `${Math.max(4, Math.min(pointer.screenX + 12, pointer.width - 208))}px`, top: `${Math.max(4, pointer.screenY - 34)}px` } : undefined}>{hit && color !== undefined ? `坐标:(x: ${hit.x}, y: ${hit.y}), 颜色: ${color}` : ''}</p></div>
}
