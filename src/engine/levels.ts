export const starterCode = 'def pixel(x, y):\n    return 0\n'
export const palette = ['#edf1f7', '#ef4444', '#f97316', '#facc15', '#22c55e', '#3b82f6', '#a855f7', '#ffffff', '#172033']
export const colorNames = ['空', '红', '橙', '黄', '绿', '蓝', '紫', '白', '黑']
export const levels = [
  { id: 'square', title: '实心正方形', radius: 5, target: (x: number, y: number) => Math.abs(x) <= 2 && Math.abs(y) <= 2 ? 1 : 0 },
  { id: 'checkerboard', title: '双色棋盘', radius: 4, target: (x: number, y: number) => (x + y) % 2 === 0 ? 1 : 5 },
  { id: 'circle', title: '实心圆', radius: 10, target: (x: number, y: number) => x * x + y * y <= 64 ? 5 : 0 },
]
