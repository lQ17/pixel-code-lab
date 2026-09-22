import { test, expect } from '@playwright/test'
import { directionalLight, cornerOcclusion } from '../src/renderers/voxelLighting'
import { enterChallenge3d, loadExample, runCode, openMenu } from './helpers'

test('角点 AO 保留局部差异、剖切恢复、平面不自遮挡', () => {
  const corners: [number, number, number][] = [[-.5,.5,-.5],[-.5,.5,.5],[.5,.5,.5],[.5,.5,-.5]]
  expect(directionalLight([0,1,0])).toBeGreaterThan(directionalLight([0,-1,0]) + .5)
  const wall = (x: number, y: number) => Number(x === 1 && y === 1)
  const ao = cornerOcclusion([0,0,0], [0,1,0], corners, wall)
  expect(ao[0]).toBe(0)
  expect(ao[2]).toBeGreaterThan(.5)
  expect(cornerOcclusion([0,0,0], [0,1,0], corners, (_x,y) => Number(y <= 0))).toEqual([0,0,0,0])
  expect(cornerOcclusion([0,0,0], [0,1,0], corners, (x,y) => x <= 0 ? wall(x,y) : 0)).toEqual([0,0,0,0])
})

test('光影双图同步，开关改变像素但不改变体素与成绩', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await enterChallenge3d(page, 'voxel-house')
  await loadExample(page)
  await runCode(page)
  await expect(page.getByTestId('voxel-score')).toContainText('100.0%')
  const views = page.locator('.voxel-viewport')
  const canvas = views.last().locator('canvas')
  const pixels = () => canvas.evaluate((el: HTMLCanvasElement) => el.toDataURL())
  await expect(views.first()).toHaveAttribute('data-lighting', 'true')
  const lit = await pixels()
  await page.screenshot({ path: 'test-results/voxel-lighting-on.png' })
  await openMenu(page, '视图')
  await page.getByRole('menuitemcheckbox', { name: '光影' }).click()
  for (const view of await views.all()) await expect(view).toHaveAttribute('data-lighting', 'false')
  expect(await pixels()).not.toBe(lit)
  await expect(canvas).toHaveAttribute('data-voxels', '470')
  await expect(page.getByTestId('voxel-score')).toContainText('100.0%')
  await page.screenshot({ path: 'test-results/voxel-lighting-off.png' })
  await openMenu(page, '视图')
  await page.getByRole('menuitemcheckbox', { name: '光影' }).click()
  expect(await pixels()).toBe(lit)
})

