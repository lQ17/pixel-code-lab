import { test, expect } from '@playwright/test'

test.describe('导航与路由 (Navigation & Routes)', () => {
  test('入口页图片按钮可加载并进入对应工作台', async ({ page }) => {
    await page.setViewportSize({ width: 1180, height: 768 })
    await page.addInitScript(() => localStorage.setItem('pixel-code-lab.progress', JSON.stringify({
      schemaVersion: 1, codes: {}, passed: { square: true }, levelId: 'square', introSeen: true,
    })))
    await page.goto('/#/start/challenge/2d')

    for (const selector of ['.resume-action-button img', '.challenge-art-button img']) {
      await expect.poll(() => page.locator(selector).evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1181)
    await page.screenshot({ path: 'test-results/start-challenge-1180.png' })

    await page.getByRole('button', { name: '开始挑战 →' }).click()
    await expect(page).toHaveURL(/#\/work\/2d\/challenge\/checkerboard/)
    await page.getByRole('button', { name: '返回入口' }).click()
    await page.getByRole('button', { name: '自由创作' }).click()
    await expect.poll(() => page.locator('.create-entrance-card img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
    await page.screenshot({ path: 'test-results/start-create-1180.png' })
    await page.getByRole('button', { name: '进入创作工作台 →' }).click()
    await expect(page).toHaveURL(/#\/work\/2d\/create/)
  })

  test('根地址首次访问显示入口页，关卡卡片全部开放', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Pixel Code Lab' })).toBeVisible()
    await expect(page.getByRole('button', { name: '挑战模式' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: '2D 像素' })).toHaveAttribute('aria-pressed', 'true')

    // 检查二维挑战卡片
    await expect(page.getByRole('button', { name: /实心正方形/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /双色棋盘/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /实心圆/ })).toBeVisible()
  })

  test('点击关卡卡片进入工作台，左上角返回入口', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /实心正方形/ }).click()
    await expect(page).toHaveURL(/#\/work\/2d\/challenge\/square/)
    await expect(page.getByRole('heading', { name: /2D 关卡 · 实心正方形/ })).toBeVisible()
    await expect(page.locator('.editor-zone')).toBeVisible()
    await expect(page.locator('.target-panel')).toBeVisible()
    await expect(page.locator('.result-panel')).toBeVisible()

    // 点击返回入口
    await page.getByRole('button', { name: '返回入口' }).click()
    await expect(page).toHaveURL(/#\/start\/challenge\/2d/)
    await expect(page.getByRole('heading', { name: 'Pixel Code Lab' })).toBeVisible()
  })

  test('三维挑战全部 7 关开放，点击可进入', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: '3D 体素' }).click()
    await expect(page).toHaveURL(/#\/start\/challenge\/3d/)

    // 验证 7 关均可见
    for (const title of ['STAGE 01 立方体', '空心立方体', '圆柱', '球体', '彩色阶梯', '金字塔', '简单房屋']) {
      await expect(page.getByRole('button', { name: new RegExp(title) })).toBeVisible()
    }

    // 点击简单房屋
    await page.getByRole('button', { name: /简单房屋/ }).click()
    await expect(page).toHaveURL(/#\/work\/3d\/challenge\/voxel-house/)
    await expect(page.getByRole('heading', { name: /3D 关卡 · 简单房屋/ })).toBeVisible()
  })

  test('自由创作入口与继续上次工作', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: '自由创作' }).click()
    await expect(page).toHaveURL(/#\/start\/create\/2d/)
    await expect(page.getByRole('button', { name: '进入创作工作台 →' })).toBeVisible()

    await page.getByRole('button', { name: '进入创作工作台 →' }).click()
    await expect(page).toHaveURL(/#\/work\/2d\/create/)

    // 返回入口
    await page.getByRole('button', { name: '返回入口' }).click()
    await expect(page.getByRole('button', { name: /继续上次工作/ })).toBeVisible()
    await page.getByRole('button', { name: /继续上次工作/ }).click()
    await expect(page).toHaveURL(/#\/work\/2d\/create/)
  })

  test('非法 URL 回退合法入口页', async ({ page }) => {
    await page.goto('/#/work/2d/challenge/invalid-level')
    // 应该回退到有效关卡或合法入口
    await expect(page).not.toHaveURL(/invalid-level/)

    await page.goto('/#/some/random/broken/path')
    await expect(page.getByRole('heading', { name: 'Pixel Code Lab' })).toBeVisible()
  })

  test('前进与后退可用，刷新恢复上下文', async ({ page }) => {
    await page.goto('/#/work/2d/challenge/checkerboard')
    await expect(page.getByRole('heading', { name: '2D 关卡 · 双色棋盘' })).toBeVisible()

    await page.getByRole('button', { name: '返回入口' }).click()
    await expect(page.getByRole('heading', { name: 'Pixel Code Lab' })).toBeVisible()

    // 浏览器后退
    await page.goBack()
    await expect(page).toHaveURL(/#\/work\/2d\/challenge\/checkerboard/)
    await expect(page.getByRole('heading', { name: '2D 关卡 · 双色棋盘' })).toBeVisible()

    // 刷新保持在同一关
    await page.reload()
    await expect(page).toHaveURL(/#\/work\/2d\/challenge\/checkerboard/)
    await expect(page.getByRole('heading', { name: '2D 关卡 · 双色棋盘' })).toBeVisible()
  })
})
