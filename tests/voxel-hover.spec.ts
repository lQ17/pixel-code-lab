import { test, expect } from '@playwright/test'
import { enterChallenge3d, loadExample, runCode, toggleVoxelCutHandles } from './helpers'
import { rotatePoint } from '../src/renderers/voxelGeometry'

test('三维可见体素悬停、颜色、离开隐藏与剖切截面', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await enterChallenge3d(page, 'voxel-cube')
  await loadExample(page)
  await runCode(page)
  await expect(page.getByLabel('三维体素画布', { exact: true })).toHaveAttribute('data-voxels', '343')

  for (const name of ['三维参考图画布', '三维体素画布']) {
    const canvas = page.getByLabel(name, { exact: true })
    const box = (await canvas.boundingBox())!
    const [yaw, pitch, zoom] = (await canvas.getAttribute('data-view'))!.split(',').map(Number)
    const scale = (Math.min(box.width, box.height) / 34.2) * zoom
    const hover = async (x: number, y: number, z: number) => {
      const [a, b] = rotatePoint([x, y, z], { yaw, pitch, zoom })
      await page.mouse.move(
        box.x + box.width / 2 + a * scale,
        box.y + box.height / 2 - b * scale
      )
    }
    await hover(1, -3.5, 1)
    await expect(page.getByRole('tooltip')).toContainText('x: 1, y: -3, z: 1')
    await expect(page.getByRole('tooltip')).toContainText('橙')
    await expect(page.getByRole('tooltip').locator('.coordinate-swatch')).toHaveCSS(
      'background-color',
      'rgb(249, 115, 22)'
    )
    await page.mouse.move(box.x + 5, box.y + 5)
    await expect(page.getByRole('tooltip')).toHaveCount(0)
  }

  await toggleVoxelCutHandles(page)
  const handle = page.getByRole('slider', { name: 'X 轴剖切' }).first()
  await handle.focus()
  for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowLeft')
  const canvas = page.getByLabel('三维参考图画布')
  const box = (await canvas.boundingBox())!
  const scale = Math.min(box.width, box.height) / 34.2
  const [a, b] = rotatePoint([0.5, -2, 2], { yaw: -0.65, pitch: 0.45, zoom: 1 })
  await page.mouse.move(
    box.x + box.width / 2 + a * scale,
    box.y + box.height / 2 - b * scale
  )
  await expect(page.getByRole('tooltip')).toContainText('x: 0, y: -2, z: 2')
  await page.screenshot({ path: 'test-results/voxel-hover.png' })
  await canvas.focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tooltip')).toHaveCount(0)
})

