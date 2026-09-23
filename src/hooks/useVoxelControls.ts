import { useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { initial } from '../renderers/voxelGeometry'
type Point = [number,number,number]
export interface VoxelControls {
  view: typeof initial; setView: Dispatch<SetStateAction<typeof initial>>
  lighting: boolean; setLighting: Dispatch<SetStateAction<boolean>>
  axes: boolean; setAxes: Dispatch<SetStateAction<boolean>>
  cuts: Point; setCuts: Dispatch<SetStateAction<Point>>
  showCutHandles: boolean; setShowCutHandles: Dispatch<SetStateAction<boolean>>
}
export function useVoxelControls(radius: number): VoxelControls {
  const [view, setView] = useState(initial)
  const [lighting, setLighting] = useState(true)
  const [axes, setAxes] = useState(true)
  const [cuts, setCuts] = useState<Point>([radius,radius,radius])
  const [showCutHandles, setShowCutHandles] = useState(false)
  return { lighting, setLighting, view, setView, axes, setAxes, cuts, setCuts, showCutHandles, setShowCutHandles }
}
