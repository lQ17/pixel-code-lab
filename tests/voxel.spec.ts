import { test, expect } from '@playwright/test'
import {
  enterChallenge3d,
  enterChallenge2d,
  runCode,
  stopCode,
  loadExample,
  resetVoxelView,
} from './helpers'

test('三维示例、视角、错误恢复、独立存档和模式取消', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.setViewportSize({ width: 1440, height: 900 })
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))

  await enterChallenge3d(page, 'voxel-cube')
  const canvas = page.getByLabel('三维体素画布').last()
  const write = async (source: string) => {
    await page.evaluate(code => navigator.clipboard.writeText(code), source)
    await page.locator('.code-editor').click({ position: { x: 160, y: 50 } })
    await page.keyboard.press('ControlOrMeta+A')
    await page.keyboard.press('ControlOrMeta+V')
  }

  // 载入示例并运行
  await loadExample(page)
  await runCode(page)
  await expect(canvas).toHaveAttribute('data-voxels', '343')
  await page.screenshot({ path: 'test-results/voxel-cube.png', fullPage: true })

  // 视角旋转与菜单重置
  const before = await canvas.getAttribute('data-view')
  await canvas.hover()
  await page.mouse.down()
  await page.mouse.move(1100, 500, { steps: 8 })
  await page.mouse.up()
  await expect(canvas).not.toHaveAttribute('data-view', before!)
  await page.mouse.wheel(0, -200)
  await resetVoxelView(page)
  await expect(canvas).toHaveAttribute('data-view', before!)

  // 切换到球体关卡载入示例并运行
  page.once('dialog', d => d.accept())
  await page.getByRole('button', { name: '返回入口' }).click()
  await page.getByRole('button', { name: /球体/ }).click()
  await loadExample(page)
  await runCode(page)
  await expect(canvas).toHaveAttribute('data-voxels', '925')
  await page.screenshot({ path: 'test-results/voxel-sphere.png', fullPage: true })

  // 运行时异常行号提示与画布保留
  await write('def voxel(x, y, z):\n    return 1 / 0')
  await runCode(page)
  await expect(page.locator('.error[role=alert]')).toContainText('第 2 行')
  await expect(canvas).toHaveAttribute('data-voxels', '925')

  // 非法颜色类型校验
  for (const value of ['True', '1.0', 'None', '9']) {
    await write(`def voxel(x, y, z):\n    return ${value}`)
    await runCode(page)
    await expect(page.locator('.error[role=alert]')).toContainText('InvalidColor')
  }

  // 写入新代码并运行成功
  await write('def voxel(x, y, z):\n    return 4 if (x, y, z) == (1, 2, 3) else 0')
  await runCode(page)
  await expect(canvas).toHaveAttribute('data-voxels', '1')

  // 切换到 2D 像素关卡验证代码相互隔离
  await page.getByRole('button', { name: '返回入口' }).click()
  await page.getByRole('button', { name: '2D 像素', exact: true }).click()
  await page.getByRole('button', { name: /实心正方形/ }).click()
  await expect(page.locator('.view-lines')).toContainText('def pixel')

  // 切回 3D 体素球体关卡代码保留
  await page.getByRole('button', { name: '返回入口' }).click()
  await page.getByRole('button', { name: '3D 体素', exact: true }).click()
  await page.getByRole('button', { name: /球体/ }).click()
  await expect(page.locator('.view-lines')).toContainText('(1, 2, 3)')

  // 刷新后代码恢复，画布清空等待运行
  await page.reload()
  await expect(canvas).toBeVisible()
  await expect(page.locator('.view-lines')).toContainText('(1, 2, 3)')
  await expect(canvas).toHaveAttribute('data-voxels', '0')

  // 超时停止
  await write('while True:\n    pass')
  await runCode(page)
  await expect(page.locator('.error[role=alert]')).toContainText('Timeout')

  // 手动停止
  await runCode(page)
  await stopCode(page)
  await expect(page.locator('.error[role=alert]')).toContainText('本次运行已停止')

  // 离开工作台自动取消运行
  await runCode(page)
  await enterChallenge2d(page, 'square')
  await runCode(page)
  await expect(page.getByTestId('score')).toContainText('0.0%')
  expect(errors).toEqual([])
})

