export type Point = [number, number, number]
export const initial: { yaw: number; pitch: number; zoom: number; topDown?: boolean } = { yaw: -0.65, pitch: 0.45, zoom: 1 }
export function rotatePoint([x,y,z]: Point, view: typeof initial): Point {
  // Camera coordinates form a right-handed basis: X right, Z up, -Y toward the camera.
  if (view.topDown) return [x, y, z]
  const a = Math.cos(view.yaw)*x - Math.sin(view.yaw)*y
  const b = -Math.sin(view.yaw)*x - Math.cos(view.yaw)*y
  return [a, Math.cos(view.pitch)*z-Math.sin(view.pitch)*b, Math.sin(view.pitch)*z+Math.cos(view.pitch)*b]
}
// Face vertices have outward normals. Interior faces are omitted.
export const faces: { normal: Point; corners: Point[]; light: number }[] = [
  { normal: [1, 0, 0], corners: [[.5,-.5,-.5],[.5,.5,-.5],[.5,.5,.5],[.5,-.5,.5]], light: .82 },
  { normal: [-1, 0, 0], corners: [[-.5,-.5,.5],[-.5,.5,.5],[-.5,.5,-.5],[-.5,-.5,-.5]], light: .72 },
  { normal: [0, 1, 0], corners: [[-.5,.5,-.5],[-.5,.5,.5],[.5,.5,.5],[.5,.5,-.5]], light: .9 },
  { normal: [0, -1, 0], corners: [[-.5,-.5,.5],[-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5]], light: .65 },
  { normal: [0, 0, 1], corners: [[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5],[-.5,-.5,.5]], light: 1 },
  { normal: [0, 0, -1], corners: [[-.5,-.5,-.5],[-.5,.5,-.5],[.5,.5,-.5],[.5,-.5,-.5]], light: .55 },
]
