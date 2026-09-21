import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadPyodide } from 'pyodide'
import { defaultVoxelId, getVoxelLevel, legacyVoxelExampleIds, voxelRadius, voxelReference, voxelTargetIds } from '../src/engine/voxel'
import { parseProgress, STORAGE_KEY } from '../src/hooks/useProgress'
import { evaluate } from '../src/engine/evaluate'

const counts = {
  'voxel-cube': 343, 'voxel-hollow-cube': 386, 'voxel-cylinder': 441,
  'voxel-sphere': 925, 'voxel-stairs': 330, 'voxel-pyramid': 455, 'voxel-house': 470,
}
const base = { schemaVersion: 1, codes: { square: 'keep 2d' }, passed: { square: true }, levelId: 'square', introSeen: true }

// Independent geometric expectations, including invisible interiors and boundary layers.
test('七关目标的体积、边界、内部空腔和组合颜色正确', () => {
  expect(voxelTargetIds).toHaveLength(7)
  for (const id of voxelTargetIds) {
    const colors = voxelReference(id)
    expect(colors).toHaveLength(17 ** 3)
    expect(colors.filter(Boolean)).toHaveLength(counts[id])
    expect(colors.every(c => Number.isInteger(c) && c >= 0 && c <= 8)).toBe(true)
  }
  const hollow = getVoxelLevel('voxel-hollow-cube').target
  expect(hollow(0, 0, 0)).toBe(0)
  expect(hollow(3, 3, 3)).toBe(0)
  expect(hollow(-4, 0, 0)).toBe(6)
  expect(hollow(4, 4, 4)).toBe(6)
  expect(hollow(5, 0, 0)).toBe(0)
  const target = voxelReference('voxel-hollow-cube')
  const filled = [...target]
  filled[(8 * 17 + 8) * 17 + 8] = 6
  expect(evaluate(target, filled).passed).toBe(false)
  const cylinder = getVoxelLevel('voxel-cylinder').target
  expect(cylinder(4, 4, 0)).toBe(4)
  expect(cylinder(4, -4, 0)).toBe(4)
  expect(cylinder(4, 0, 1)).toBe(0)
  expect(cylinder(0, 5, 0)).toBe(0)
  const pyramid = getVoxelLevel('voxel-pyramid').target
  expect(pyramid(-6, -5, 6)).toBe(3)
  expect(pyramid(0, 1, 0)).toBe(3)
  expect(pyramid(1, 1, 0)).toBe(0)
  expect(pyramid(0, 2, 0)).toBe(0)
  const house = getVoxelLevel('voxel-house').target
  expect(house(0, -2, 0)).toBe(3)
  expect(house(0, -2, 3)).toBe(5)
  expect(house(-2, -1, 3)).toBe(5)
  expect(house(2, -1, 3)).toBe(5)
  expect(house(0, 5, -4)).toBe(1)
  expect(house(1, 5, 0)).toBe(0)
  expect(house(4, 0, 0)).toBe(0)
})

test('七关 Python 示例通过真实执行层生成与目标逐格一致的数据', async () => {
  const python = await loadPyodide({ indexURL: resolve('node_modules/pyodide') })
  const execute = readFileSync(resolve('src/runners/execute.py'), 'utf8')
  for (const id of voxelTargetIds) {
    python.globals.set('_source', getVoxelLevel(id).exampleCode!)
    python.globals.set('_radius', voxelRadius)
    python.globals.set('_mode', '3d')
    const result = JSON.parse(await python.runPythonAsync(execute))
    expect(result.error, id).toBeUndefined()
    expect(result.colors, id).toEqual(voxelReference(id))
  }
})

test('旧数字参考固定映射、独立新 ID 与新关卡代码完整往返，非法存档拒绝', () => {
  legacyVoxelExampleIds.forEach((id, index) => {
    const migrated = parseProgress(JSON.stringify({ ...base, voxelExample: index, voxelCode: 'old code', voxelPassed: { [id]: true } }))
    expect(migrated).toMatchObject({ voxelReferenceId: id, voxelLevelId: id, voxelCodes: { [id]: 'old code' }, voxelPassed: { [id]: true }, passed: base.passed })
    expect(parseProgress(JSON.stringify(migrated))).toEqual(migrated)
    const split = parseProgress(JSON.stringify({ ...base, voxelExample: index, voxelCodes: {} }))
    expect(split.voxelReferenceId).toBe(id)
    expect(split.voxelLevelId).toBe(defaultVoxelId)
  })
  const voxelCodes = Object.fromEntries(voxelTargetIds.map(id => [id, id === 'voxel-house' ? '' : getVoxelLevel(id).exampleCode]))
  const voxelPassed = Object.fromEntries(voxelTargetIds.map(id => [id, true]))
  const saved = parseProgress(JSON.stringify({ ...base, voxelCodes, voxelPassed, voxelExample: 1, voxelReferenceId: 'voxel-house', voxelLevelId: 'voxel-cylinder', voxelCode: 'creation' }))
  expect(saved).toMatchObject({ voxelCodes, voxelPassed, voxelReferenceId: 'voxel-house', voxelLevelId: 'voxel-cylinder', voxelCode: 'creation', codes: base.codes })
  expect(parseProgress(JSON.stringify(saved))).toEqual(saved)
  for (const invalid of [
    { voxelReferenceId: 'missing' }, { voxelReferenceId: '__proto__' }, { voxelReferenceId: 3 },
    { voxelExample: 3 }, { voxelExample: -1 }, { voxelExample: 1.5 },
    { voxelCodes: { 'voxel-house': false } }, { voxelPassed: { 'voxel-cylinder': 'yes' } },
  ]) expect(() => parseProgress(JSON.stringify({ ...base, ...invalid }))).toThrow()
})

test('新增四关运行通关、七关进度、代码隔离、创作参考 ID 与刷新恢复', async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 768 })
  await page.addInitScript(({ key, value }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value))
  }, { key: STORAGE_KEY, value: { ...base, mode: '3d', voxelActivity: 'challenge', voxelCodes: {}, voxelCode: 'def voxel(x, y, z):\n    return 0\n' } })
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto('/')
  const nav = page.getByRole('navigation', { name: '三维关卡', exact: true })
  const run = page.getByRole('button', { name: '运行', exact: true })
  const score = page.getByTestId('voxel-score')
  const canvas = page.getByLabel('三维体素画布', { exact: true })
  await expect(nav.getByRole('button')).toHaveCount(7)
  await expect(page.getByLabel('已通关 0 / 7 关')).toBeVisible()
  for (const id of ['voxel-hollow-cube', 'voxel-cylinder', 'voxel-pyramid', 'voxel-house'] as const) {
    await nav.getByRole('button', { name: new RegExp('^' + getVoxelLevel(id).title) }).click()
    await expect(page.locator('.view-lines')).toContainText('return 0')
    await expect(score).toHaveCount(0)
    await expect(canvas).toHaveAttribute('data-voxels', '0')
    await page.getByRole('button', { name: '载入示例', exact: true }).click()
    await expect(run).toBeEnabled()
    await run.click()
    await expect(score).toContainText('100.0%')
    await expect(canvas).toHaveAttribute('data-voxels', String(counts[id]))
    await expect(page.getByRole('heading', { name: '目标图 · ' + getVoxelLevel(id).title })).toBeVisible()
  }
  await expect(page.getByLabel('已通关 4 / 7 关')).toBeVisible()
  await nav.getByRole('button', { name: /^空心立方体/ }).click()
  await expect(score).toContainText('100.0%')
  await expect(page.locator('.view-lines')).toContainText('max(abs(x), abs(y), abs(z)) == 4')
  await page.getByRole('button', { name: '自由创作', exact: true }).click()
  await page.getByRole('navigation', { name: '三维参考模型' }).getByRole('button', { name: '简单房屋', exact: true }).click()
  await expect(page.locator('.view-lines')).toContainText('return 0')
  await page.getByRole('button', { name: '载入示例', exact: true }).click()
  await run.click()
  await expect(canvas).toHaveAttribute('data-voxels', '470')
  await expect(score).toHaveCount(0)
  await page.getByRole('navigation', { name: '三维参考模型' }).getByRole('button', { name: '圆柱', exact: true }).click()
  await expect(canvas).toHaveAttribute('data-voxels', '470')
  await page.reload()
  await expect(page.getByRole('heading', { name: '参考图 · 圆柱' })).toBeVisible()
  await expect(page.locator('.view-lines')).toContainText('return 1')
  await expect(canvas).toHaveAttribute('data-voxels', '0')
  await page.getByRole('button', { name: '挑战', exact: true }).click()
  await expect(page.getByRole('heading', { name: '目标图 · 空心立方体' })).toBeVisible()
  await expect(page.getByLabel('已通关 4 / 7 关')).toBeVisible()
  const state = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY)
  expect(state.voxelCodes['voxel-house']).toBe(getVoxelLevel('voxel-house').exampleCode)
  expect(state.voxelCodes['voxel-cylinder']).toBe(getVoxelLevel('voxel-cylinder').exampleCode)
  expect(state.codes).toEqual(base.codes)
  expect(state.passed).toEqual(base.passed)
  expect(errors).toEqual([])
})
