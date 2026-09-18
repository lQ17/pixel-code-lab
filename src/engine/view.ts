export interface ViewState { zoom: number; x: number; y: number }
export type AxisMode = 'edge' | 'center'
export const initialView: ViewState = { zoom: 1, x: 0, y: 0 }
export const CANVAS_SIZE = 600
export function cellSize(radius: number, zoom: number) { return 500 / (radius * 2 + 1) * zoom }
export function zoomView(view: ViewState, zoom: number, px = 300, py = 300): ViewState {
  const next = Math.min(8, Math.max(1, zoom))
  const ratio = next / view.zoom
  return { zoom: next, x: px - 300 - (px - 300 - view.x) * ratio, y: py - 300 - (py - 300 - view.y) * ratio }
}
export function hitCell(px: number, py: number, radius: number, view: ViewState) {
  const cell = cellSize(radius, view.zoom)
  const side = (radius * 2 + 1) * cell
  const col = Math.floor((px - (300 + view.x - side / 2)) / cell)
  const row = Math.floor((py - (300 + view.y - side / 2)) / cell)
  if (col < 0 || row < 0 || col > radius * 2 || row > radius * 2) return null
  return { col, row, x: col - radius, y: radius - row }
}
