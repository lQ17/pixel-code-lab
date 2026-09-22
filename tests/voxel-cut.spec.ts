import { test, expect } from '@playwright/test'
import {
  enterChallenge3d,
  loadExample,
  runCode,
  toggleVoxelCutHandles,
  toggleVoxelAxes,
  restoreVoxelCut,
} from './helpers'

test('轴拖动剖切、截面、组合裁切及恢复不改变源数据', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await enterChallenge3d(page, 'voxel-cube')
  await loadExample(page)
  await runCode(page)

  const canvas = page.getByLabel('三维体素画布').last()
  const viewport = page.locator('.voxel-viewport').last()
  await expect(canvas).toHaveAttribute('data-voxels', '343')
  const view = await canvas.getAttribute('data-view')

  await toggleVoxelCutHandles(page)

  const handle = page.getByRole('slider', { name: 'X 轴剖切' }).last()
  const h = (await handle.boundingBox())!
  const c = (await canvas.boundingBox())!
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2)
  await page.mouse.down()
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2, { steps: 10 })
  await page.mouse.up()
  await expect(handle).toHaveAttribute('aria-valuenow', '0')
  await expect(viewport).toHaveAttribute('data-visible-voxels', '196')
  await expect(canvas).toHaveAttribute('data-view', view!)
  await expect(canvas).toHaveAttribute('data-voxels', '343')

  const y = page.getByRole('slider', { name: 'Y 轴剖切' }).last()
  await y.focus()
  for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowLeft')
  await expect(viewport).toHaveAttribute('data-visible-voxels', '112')
  await page.screenshot({ path: 'test-results/voxel-cut.png' })

  await toggleVoxelAxes(page)
  await expect(viewport).toHaveAttribute('data-visible-voxels', '112')

  await restoreVoxelCut(page)
  await expect(viewport).toHaveAttribute('data-visible-voxels', '343')

  await toggleVoxelAxes(page)
  const z = page.getByRole('slider', { name: 'Z 轴剖切' }).last()
  await z.focus()
  await page.keyboard.press('Home')
  await expect(viewport).toHaveAttribute('data-visible-voxels', '0')
  await page.keyboard.press('End')
  await expect(viewport).toHaveAttribute('data-visible-voxels', '343')
})

