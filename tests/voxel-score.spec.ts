import { test, expect } from '@playwright/test'
import { parseProgress } from '../src/hooks/useProgress'
import { voxelReference } from '../src/engine/voxel'
import { evaluate } from '../src/engine/evaluate'
import {
  enterChallenge3d,
  runCode,
  loadExample,
  toggleVoxelCutHandles,
  restoreVoxelCut,
} from './helpers'

test('三维判定严格检查内部、多画、漏画和错色；旧存档兼容', () => {
  const target = voxelReference('voxel-cube')
  for (const [index, value] of [[0, 1], [2456, 0], [2456, 5]]) {
    const result = [...target]
    result[index] = value
    expect(evaluate(target, result).passed).toBe(false)
  }
  expect(evaluate(target, target).passed).toBe(true)
  const old = { schemaVersion: 1, codes: {}, passed: { square: true }, levelId: 'square', introSeen: true, voxelCode: 'old code' }
  expect(parseProgress(JSON.stringify(old))).toMatchObject({ voxelCode: 'old code', passed: { square: true }, voxelPassed: {} })
  expect(() => parseProgress(JSON.stringify({ ...old, voxelPassed: { 'voxel-cube': 'yes' } }))).toThrow()
})

test('三维成绩、剖切无关、独立通关、失败保留、刷新恢复', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.setViewportSize({ width: 1440, height: 900 })
  await enterChallenge3d(page, 'voxel-cube')

  const score = page.getByTestId('voxel-score')
  const write = async (code: string) => {
    await page.evaluate(s => navigator.clipboard.writeText(s), code)
    await page.locator('.code-editor').click({ position: { x: 160, y: 50 } })
    await page.keyboard.press('ControlOrMeta+A')
    await page.keyboard.press('ControlOrMeta+V')
  }

  // 初始代码运行：匹配率 0.0%
  await runCode(page)
  await expect(score).toContainText('0.0%')

  // 载入示例并运行：100.0% 通关
  await loadExample(page)
  await runCode(page)
  await expect(score).toContainText('100.0%')

  // 剖切不影响分数判定
  await toggleVoxelCutHandles(page)
  const cut = page.getByRole('slider', { name: 'X 轴剖切' }).first()
  await cut.focus()
  await page.keyboard.press('Home')
  await runCode(page)
  await expect(score).toContainText('100.0%')

  // 故意写错代码：降低匹配率，但历史通关不受撤销
  await write('def voxel(x,y,z):\n    return 0')
  await runCode(page)
  await expect(score).toContainText('0.0%')

  // 发生异常：保留上次历史匹配率
  await write('def voxel(x,y,z):\n    return 1/0')
  await runCode(page)
  await expect(page.locator('.error[role=alert]')).toContainText('ZeroDivisionError')
  await expect(score).toContainText('历史匹配率')

  // 切换到球体关卡
  await page.getByRole('button', { name: '返回入口' }).click()
  await page.getByRole('button', { name: /球体/ }).click()
  await expect(score).toHaveCount(0)

  // 载入球体示例并运行通关
  await loadExample(page)
  await runCode(page)
  await expect(score).toContainText('100.0%')

  // 恢复完整模型
  await restoreVoxelCut(page)
  await page.screenshot({ path: 'test-results/voxel-scored.png' })

  // 刷新后在工作台中分数尚未计算，返回入口页核对通关标记
  await page.reload()
  await expect(score).toHaveCount(0)
  await page.getByRole('button', { name: '返回入口' }).click()

  // 入口页上立体方和球体显示通关，彩色阶梯未通关
  await expect(page.getByRole('button', { name: /STAGE 01\s+立方体/ })).toHaveClass(/passed/)
  await expect(page.getByRole('button', { name: /球体/ })).toHaveClass(/passed/)
  await expect(page.getByRole('button', { name: /彩色阶梯/ })).not.toHaveClass(/passed/)

  // 切换到 2D 像素关卡，实心正方形未通关
  await page.getByRole('button', { name: '2D 像素', exact: true }).click()
  await expect(page.getByRole('button', { name: /实心正方形/ })).not.toHaveClass(/passed/)
})

