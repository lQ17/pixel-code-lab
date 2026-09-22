import { test, expect, type Page } from '@playwright/test'
import { parseProgress, STORAGE_KEY } from '../src/hooks/useProgress'
import { voxelStarter } from '../src/engine/voxel'
import {
  enterChallenge3d,
  enterCreate3d,
  runCode,
  loadExample,
  restoreTemplate,
  switchReference,
} from './helpers'

const legacyCode = 'def voxel(x, y, z):\n    return 4 if (x, y, z) == (1, 2, 3) else 0\n'
const cubeCode = 'def voxel(x, y, z):\n    return 2 if x == 0 and y == 0 else 0\n'
const legacy = {
  schemaVersion: 1, codes: { square: 'def pixel(x, y):\n    return 0\n' },
  passed: { square: true }, levelId: 'square', introSeen: true, mode: '3d',
  voxelCode: legacyCode, voxelExample: 1, voxelPassed: { 'voxel-cube': true },
}

async function write(page: Page, source: string) {
  await page.evaluate(code => navigator.clipboard.writeText(code), source)
  await page.locator('.code-editor').click({ position: { x: 160, y: 50 } })
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.press('ControlOrMeta+V')
}

async function saved(page: Page) {
  await expect(page.getByTestId('storage-status')).toHaveAttribute('data-save-state', 'saved')
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY)
}

test('三维旧存档只迁移一次，新字段严格校验，空代码与已有分关代码保留', () => {
  const migrated = parseProgress(JSON.stringify(legacy))
  expect(migrated).toMatchObject({
    voxelCode: legacyCode, voxelLevelId: 'voxel-sphere',
    voxelCodes: { 'voxel-sphere': legacyCode }, voxelPassed: legacy.voxelPassed, passed: legacy.passed,
  })
  expect(parseProgress(JSON.stringify(migrated))).toEqual(migrated)
  expect(parseProgress(JSON.stringify({ ...legacy, voxelCode: '' })).voxelCodes).toEqual({ 'voxel-sphere': '' })
  expect(parseProgress(JSON.stringify({ ...legacy, voxelCodes: {} })).voxelCodes).toEqual({})
  expect(parseProgress(JSON.stringify({ ...legacy, voxelCodes: {} })).voxelLevelId).toBe('voxel-cube')
  expect(parseProgress(JSON.stringify({ ...legacy, voxelCodes: { 'voxel-sphere': '', 'voxel-cube': cubeCode } })).voxelCodes)
    .toEqual({ 'voxel-sphere': '', 'voxel-cube': cubeCode })
  for (const invalid of [
    { voxelActivity: 'unknown' }, { voxelLevelId: 'unknown' }, { voxelCodes: null },
    { voxelCodes: [] }, { voxelCodes: { 'voxel-cube': false } },
  ]) expect(() => parseProgress(JSON.stringify({ ...legacy, ...invalid }))).toThrow()
})

test('挑战与创作独立、切目标不覆盖、显式载入确认、旧存档迁移与刷新恢复', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript(({ key, value }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value))
  }, { key: STORAGE_KEY, value: legacy })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const dialogs: string[] = []
  let acceptDialog = false
  page.on('dialog', async dialog => {
    dialogs.push(dialog.message())
    if (acceptDialog) await dialog.accept()
    else await dialog.dismiss()
  })
  await page.goto('/')

  // 从入口页继续上次工作进入 3D 自由创作工作台
  await page.getByRole('button', { name: /继续上次工作/ }).click()
  const editor = page.locator('.view-lines')
  const canvas = page.getByLabel('三维体素画布').last()
  const score = page.getByTestId('voxel-score')

  await expect(editor).toContainText('(1, 2, 3)')
  await runCode(page)
  await expect(canvas).toHaveAttribute('data-voxels', '1')

  // 切参考到立方体
  await switchReference(page, '立方体')
  await expect(editor).toContainText('(1, 2, 3)')
  await expect(canvas).toHaveAttribute('data-voxels', '1')
  expect(dialogs).toEqual([])

  // 切参考到球体
  await switchReference(page, '球体')
  acceptDialog = true
  await loadExample(page)
  await runCode(page)
  await expect(canvas).toHaveAttribute('data-voxels', '925')
  await expect(score).toHaveCount(0)
  expect((await saved(page)).voxelPassed).toEqual({ 'voxel-cube': true })
  await page.screenshot({ path: 'test-results/voxel-creation-mode.png', fullPage: true })

  // 返回入口页切换到挑战模式球体关卡
  await page.getByRole('button', { name: '返回入口' }).click()
  await page.getByRole('button', { name: '挑战模式', exact: true }).click()
  await page.getByRole('button', { name: /球体/ }).click()

  await expect(editor).toContainText('(1, 2, 3)')
  await expect(page.getByRole('heading', { name: '目标图 · 球体' })).toBeVisible()
  await expect(canvas).toHaveAttribute('data-voxels', '0')

  // 切换到立方体关卡
  await page.getByRole('button', { name: '返回入口' }).click()
  await page.getByRole('button', { name: /STAGE 01\s+立方体/ }).click()
  await expect(editor).toContainText('return 0')
  await write(page, cubeCode)

  // 快速切回球体关卡验证输入无丢失
  await page.getByRole('button', { name: '返回入口' }).click()
  await page.getByRole('button', { name: /球体/ }).click()
  await expect(editor).toContainText('(1, 2, 3)')

  // 返回立方体关卡
  await page.getByRole('button', { name: '返回入口' }).click()
  await page.getByRole('button', { name: /STAGE 01\s+立方体/ }).click()
  await expect(editor).toContainText('x == 0 and y == 0')
  expect(dialogs).toHaveLength(1)

  // 拒绝载入示例
  acceptDialog = false
  await loadExample(page)
  await expect(editor).toContainText('x == 0 and y == 0')

  // 确认载入示例并运行
  acceptDialog = true
  await loadExample(page)
  await runCode(page)
  await expect(score).toContainText('100.0%')
  await page.screenshot({ path: 'test-results/voxel-challenge-mode.png', fullPage: true })
  await page.setViewportSize({ width: 1180, height: 768 })
  await page.screenshot({ path: 'test-results/voxel-challenge-laptop.png', fullPage: true })

  // 恢复初始代码
  await restoreTemplate(page)
  await expect(editor).toContainText('return 0')
  const state = await saved(page)
  expect(state.voxelCodes['voxel-cube']).toBe(voxelStarter)
  expect(state.voxelCodes['voxel-sphere']).toBe(legacyCode)
  expect(state.voxelCode).toContain('x*x + y*y + z*z')
  expect(state.passed).toEqual(legacy.passed)

  // 切换到球体关卡后刷新验证
  await page.getByRole('button', { name: '返回入口' }).click()
  await page.getByRole('button', { name: /球体/ }).click()
  await page.reload()
  await expect(editor).toContainText('(1, 2, 3)')
  await expect(score).toHaveCount(0)

  // 返回入口页切换到自由创作
  await page.getByRole('button', { name: '返回入口' }).click()
  await page.getByRole('button', { name: '自由创作', exact: true }).click()
  await page.getByRole('button', { name: /进入创作工作台/ }).click()
  await expect(editor).toContainText('x*x + y*y + z*z')
  await expect(page.getByRole('heading', { name: '参考图 · 球体' })).toBeVisible()

  await page.reload()
  await expect(editor).toContainText('x*x + y*y + z*z')
  expect(errors).toEqual([])
})

test('切玩法和切三维关卡取消运行，作品与成绩隔离且保留历史结果', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: STORAGE_KEY, value: { ...legacy, voxelCodes: {}, voxelActivity: 'challenge', voxelLevelId: 'voxel-cube' },
  })
  await enterChallenge3d(page, 'voxel-cube')
  const canvas = page.getByLabel('三维体素画布').last()
  const score = page.getByTestId('voxel-score')

  await loadExample(page)
  await runCode(page)
  await expect(score).toContainText('100.0%')

  // 运行死循环并离开工作台切到自由创作
  await write(page, 'while True:\n    pass')
  await runCode(page)
  await enterCreate3d(page)

  await expect(score).toHaveCount(0)
  await expect(canvas).toHaveAttribute('data-voxels', '0')
  await runCode(page)
  await expect(canvas).toHaveAttribute('data-voxels', '1')

  // 再次写死循环并运行，切回挑战模式立方体关卡
  await write(page, 'while True:\n    pass')
  await runCode(page)
  await enterChallenge3d(page, 'voxel-cube')

  // 运行已被取消，历史作品保留
  await expect(canvas).toHaveAttribute('data-voxels', '343')
  await expect(score).toContainText('历史匹配率')

  // 再次运行死循环切到球体关卡
  await runCode(page)
  await enterChallenge3d(page, 'voxel-sphere')

  await expect(canvas).toHaveAttribute('data-voxels', '0')
  await expect(score).toHaveCount(0)
  await runCode(page)
  await expect(score).toContainText('0.0%')
  await expect(page.locator('.error[role=alert]')).toHaveCount(0)

  // 切回立方体关卡
  await enterChallenge3d(page, 'voxel-cube')
  await expect(canvas).toHaveAttribute('data-voxels', '343')
  await expect(score).toContainText('100.0%')

  // 切回自由创作
  await enterCreate3d(page)
  await expect(canvas).toHaveAttribute('data-voxels', '1')
  await expect(score).toHaveCount(0)
  await expect(page.locator('.error[role=alert]')).toHaveCount(0)
})

