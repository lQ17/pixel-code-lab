import { useEffect, useRef, useState } from 'react'
import { colorNames, palette } from '../engine/levels'
export function PixelCanvas({ colors, radius, label }: { colors: number[]; radius: number; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [hover, setHover] = useState<{ col: number; row: number } | null>(null)
  const size = radius * 2 + 1
  useEffect(() => {
    const canvas = ref.current!
    const context = canvas.getContext('2d')!
    const cell = 20
    canvas.width = canvas.height = size * cell
    context.clearRect(0, 0, canvas.width, canvas.height)
    colors.forEach((color, index) => {
      const x = index % size * cell
      const y = Math.floor(index / size) * cell
      context.fillStyle = palette[color]
      context.fillRect(x, y, cell, cell)
      context.strokeStyle = '#cdd6e5'
      context.lineWidth = 0.5
      context.strokeRect(x, y, cell, cell)
    })
    context.strokeStyle = '#566782'
    context.lineWidth = 1
    const center = (radius + 0.5) * cell
    context.beginPath()
    context.moveTo(center, 0); context.lineTo(center, canvas.height)
    context.moveTo(0, center); context.lineTo(canvas.width, center)
    context.stroke()
  }, [colors, radius, size])
  const color = hover && hover.col < size && hover.row < size ? colors[hover.row * size + hover.col] : undefined
  return <><canvas ref={ref} aria-label={label} className="pixel-canvas" onMouseLeave={() => setHover(null)} onMouseMove={event => {
    const rect = event.currentTarget.getBoundingClientRect()
    const col = Math.min(size - 1, Math.max(0, Math.floor((event.clientX - rect.left) / rect.width * size)))
    const row = Math.min(size - 1, Math.max(0, Math.floor((event.clientY - rect.top) / rect.height * size)))
    setHover({ col, row })
  }}/><p className="coordinate">{hover && color !== undefined ? `(${hover.col - radius}, ${radius - hover.row}) · ${color} ${colorNames[color]}` : '悬停查看坐标与颜色'}</p></>
}
