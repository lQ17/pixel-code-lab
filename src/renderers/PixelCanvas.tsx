import { useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { colorNames, palette } from '../engine/levels'
import { CANVAS_SIZE, cellSize, hitCell, zoomView } from '../engine/view'
import type { AxisMode, ViewState } from '../engine/view'

type PointerState = { x: number; y: number; screenX: number; screenY: number; width: number; axisMode: AxisMode }

function canvasScale(width: number, height: number, axisMode: AxisMode) {
  const axisReserve = axisMode === 'edge' ? Math.min(34, Math.max(24, height * 0.16)) : Math.min(48, Math.max(32, Math.min(width, height) * 0.12))
  const widthReserve = axisMode === 'center' ? axisReserve : 0
  return Math.min(Math.max(1, width - widthReserve) / CANVAS_SIZE, Math.max(1, height - axisReserve) / CANVAS_SIZE)
}

function canvasPoint(event: { clientX: number; clientY: number }, canvas: HTMLCanvasElement, axisMode: AxisMode) {
  const rect = canvas.getBoundingClientRect()
  const scale = canvasScale(rect.width, rect.height, axisMode)
  return {
    x: (event.clientX - rect.left - rect.width / 2) / scale + CANVAS_SIZE / 2,
    y: (event.clientY - rect.top - rect.height / 2) / scale + CANVAS_SIZE / 2,
    screenX: event.clientX - rect.left,
    screenY: event.clientY - rect.top,
    width: rect.width,
    scale,
  }
}

export function PixelCanvas({ colors, radius, label, view, setView, axisMode }: {
  colors: number[]; radius: number; label: string
  view: ViewState; setView: Dispatch<SetStateAction<ViewState>>; axisMode: AxisMode
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
      const viewportScale = canvasScale(rect.width, rect.height, axisMode)
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
      const originX = left + (radius + 0.5) * cell
      const originY = top + (radius + 0.5) * cell
      const axisX = axisMode === 'center' ? originX : left - axisOffset
      const axisY = axisMode === 'center' ? originY : top + side + axisOffset
      const axisWidth = Math.max(1.5, Math.min(3, 2.4 * viewportScale))
      const arrowSize = Math.max(5, Math.min(9, 7 * viewportScale))
      const tickFontSize = Math.max(10, Math.min(16, cell * 0.32))
      const xAxisColor = '#ef4444'
      const yAxisColor = '#22bd59'
      context.save()
      context.lineWidth = axisWidth
      context.lineCap = 'round'
      context.lineJoin = 'round'
      context.strokeStyle = yAxisColor
      context.fillStyle = yAxisColor
      context.beginPath()
      context.moveTo(axisX, axisMode === 'center' ? top + side : axisY)
      context.lineTo(axisX, top - arrowSize)
      context.moveTo(axisX, top - arrowSize)
      context.lineTo(axisX - arrowSize * 0.58, top)
      context.moveTo(axisX, top - arrowSize)
      context.lineTo(axisX + arrowSize * 0.58, top)
      for (let index = 0; index < size; index += 1) {
        const y = top + (index + 0.5) * cell
        context.moveTo(axisX - 3, y)
        context.lineTo(axisX + 3, y)
      }
      context.moveTo(axisX, axisY)
      context.stroke()
      context.strokeStyle = xAxisColor
      context.fillStyle = xAxisColor
      context.beginPath()
      context.moveTo(axisMode === 'center' ? left : axisX, axisY)
      context.lineTo(left + side + arrowSize, axisY)
      context.moveTo(left + side + arrowSize, axisY)
      context.lineTo(left + side, axisY - arrowSize * 0.58)
      context.moveTo(left + side + arrowSize, axisY)
      context.lineTo(left + side, axisY + arrowSize * 0.58)
      for (let index = 0; index < size; index += 1) {
        const x = left + (index + 0.5) * cell
        context.moveTo(x, axisY - 3)
        context.lineTo(x, axisY + 3)
      }
      context.stroke()
      context.font = `600 ${tickFontSize}px Consolas, monospace`
      context.fillStyle = xAxisColor
      context.textAlign = 'center'
      context.textBaseline = 'top'
      for (let index = 0; index < size; index += 1) {
        const value = index - radius
        if (axisMode !== 'center' || value !== 0) context.fillText(String(value), left + (index + 0.5) * cell, axisY + 5)
      }
      context.fillStyle = yAxisColor
      context.textAlign = 'right'
      context.textBaseline = 'middle'
      for (let index = 0; index < size; index += 1) {
        const value = radius - index
        if (axisMode !== 'center' || value !== 0) context.fillText(String(value), axisX - 5, top + (index + 0.5) * cell)
      }
      context.font = `700 ${Math.max(10, Math.min(16, tickFontSize))}px Consolas, monospace`
      context.fillStyle = xAxisColor
      context.textAlign = 'left'
      context.textBaseline = 'middle'
      context.fillText('x', left + side + arrowSize + 4, axisY)
      context.fillStyle = yAxisColor
      context.textAlign = 'center'
      context.textBaseline = 'bottom'
      context.fillText('y', axisX, top - arrowSize - 3)
      if (axisMode === 'center') {
        context.fillStyle = xAxisColor
        context.textAlign = 'left'
        context.textBaseline = 'top'
        context.fillText('0', originX + 4, originY + 4)
      }
      context.restore()
    }
    const observer = new ResizeObserver(draw)
    observer.observe(canvas)
    draw()
    return () => observer.disconnect()
  }, [axisMode, colors, radius, size, view])
  useEffect(() => {
    const canvas = ref.current!
    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      const point = canvasPoint(event, canvas, axisMode)
      setView(previous => zoomView(previous, previous.zoom * Math.exp(-Math.max(-200, Math.min(200, event.deltaY)) * 0.003), point.x, point.y))
      setPointer({ ...point, axisMode })
    }
    canvas.addEventListener('wheel', wheel, { passive: false })
    return () => canvas.removeEventListener('wheel', wheel)
  }, [axisMode, setView])
  const activePointer = pointer?.axisMode === axisMode ? pointer : null
  const hit = activePointer ? hitCell(activePointer.x, activePointer.y, radius, view) : null
  const color = hit ? colors[hit.row * size + hit.col] : undefined
  return <div className="canvas-area"><canvas ref={ref} width={CANVAS_SIZE} height={CANVAS_SIZE} aria-label={label} className="pixel-canvas" data-view={`${view.zoom},${view.x},${view.y}`} data-axis-mode={axisMode}
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
      const point = canvasPoint(event, event.currentTarget, axisMode)
      if (drag.current) {
        const dx = (event.clientX - drag.current.x) / point.scale
        const dy = (event.clientY - drag.current.y) / point.scale
        setView(previous => ({ ...previous, x: previous.x + dx, y: previous.y + dy }))
        drag.current = { x: event.clientX, y: event.clientY }
      }
      setPointer({ ...point, axisMode })
    }}/><p className="coordinate" style={activePointer && hit && color !== undefined ? { left: `${Math.max(4, Math.min(activePointer.screenX + 12, activePointer.width - 208))}px`, top: `${Math.max(4, activePointer.screenY - 34)}px` } : undefined}>{hit && color !== undefined ? <><span>坐标:(</span><span className="coordinate-x">x: {hit.x}</span><span>, </span><span className="coordinate-y">y: {hit.y}</span><span>), </span><span className="coordinate-color">颜色: <i className={color === 0 ? 'coordinate-swatch empty' : 'coordinate-swatch'} style={color === 0 ? undefined : { backgroundColor: palette[color] }} />{colorNames[color]}</span></> : ''}</p></div>
}
