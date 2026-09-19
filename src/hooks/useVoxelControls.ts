import { useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
type Point = [number,number,number]
const initial = { yaw: -.65, pitch: .45, zoom: 1 }
export interface VoxelControls {
  view: typeof initial; setView: Dispatch<SetStateAction<typeof initial>>
  axes: boolean; setAxes: Dispatch<SetStateAction<boolean>>
  cuts: Point; setCuts: Dispatch<SetStateAction<Point>>
}
export function useVoxelControls(radius: number): VoxelControls {
  const [view, setView] = useState(initial)
  const [axes, setAxes] = useState(true)
  const [cuts, setCuts] = useState<Point>([radius,radius,radius])
  return { view, setView, axes, setAxes, cuts, setCuts }
}
