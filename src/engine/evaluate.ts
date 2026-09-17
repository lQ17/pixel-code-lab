export function evaluate(target: number[], actual: number[]) {
  if (target.length !== actual.length || actual.some(color => !Number.isInteger(color) || color < 0 || color > 8)) throw new Error('像素数据无效')
  let union = 0
  let matched = 0
  let passed = true
  for (let i = 0; i < target.length; i++) {
    if (target[i] !== actual[i]) passed = false
    if (target[i] !== 0 || actual[i] !== 0) {
      union++
      if (target[i] === actual[i]) matched++
    }
  }
  const percent = union === 0 ? 100 : matched / union * 100
  return { passed, percent: passed ? 100 : Math.min(99.9, Math.round(percent * 10) / 10) }
}
export function targetColors(level: { radius: number; target: (x: number, y: number) => number }) {
  const colors: number[] = []
  for (let y = level.radius; y >= -level.radius; y--) {
    for (let x = -level.radius; x <= level.radius; x++) colors.push(level.target(x, y))
  }
  return colors
}
