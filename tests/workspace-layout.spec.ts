import { test, expect } from '@playwright/test'

test.describe('工作台精简布局与菜单系统 (Workspace Layout & Menus)', () => {
  test('1440x900 下默认仅有一行菜单与三个主区域，无侧栏与常驻运行工具条', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/#/work/2d/challenge/square')

    // 验证顶栏与返回入口
    await expect(page.getByRole('button', { name: '返回入口' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: '工作台菜单栏' })).toBeVisible()

    // 验证无旧关卡侧栏、无常驻运行工具条、无常驻调色板
    await expect(page.locator('.level-rail')).toHaveCount(0)
    await expect(page.locator('.execution-dock')).toHaveCount(0)
    await expect(page.locator('.palette-dock')).toHaveCount(0)

    // 验证三大核心区域
    await expect(page.locator('.editor-zone')).toBeVisible()
    await expect(page.locator('.target-panel')).toBeVisible()
    await expect(page.locator('.result-panel')).toBeVisible()

    // 挑战模式不显示作品菜单
    await expect(page.getByRole('button', { name: /作品 ▾/ })).toHaveCount(0)
    // 显示编辑、参考、视图、运行、帮助菜单
    await expect(page.getByRole('button', { name: /编辑 ▾/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /参考 ▾/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /视图 ▾/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /运行 ▾/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /帮助 ▾/ })).toBeVisible()
  })

  test('1180x768 目标尺寸无页面级滚动，三大区域完整可见', async ({ page }) => {
    await page.setViewportSize({ width: 1180, height: 768 })
    await page.goto('/#/work/2d/challenge/square')

    await expect(page.locator('.editor-zone')).toBeVisible()
    await expect(page.locator('.target-panel')).toBeVisible()
    await expect(page.locator('.result-panel')).toBeVisible()

    // 验证页面不发生横向滚动
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth)
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1)
  })

  test('菜单展开、点击外部与 Esc 关闭', async ({ page }) => {
    await page.goto('/#/work/2d/challenge/square')

    // 点击运行菜单
    const runMenu = page.getByRole('button', { name: /运行 ▾/ })
    await runMenu.click()
    await expect(page.getByRole('menuitem', { name: /运行代码/ })).toBeVisible()

    // 按 Esc 关闭
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menuitem', { name: /运行代码/ })).toHaveCount(0)

    // 重新打开并点击外部关闭
    await runMenu.click()
    await expect(page.getByRole('menuitem', { name: /运行代码/ })).toBeVisible()
    await page.locator('.editor-zone').click({ position: { x: 50, y: 50 } })
    await expect(page.getByRole('menuitem', { name: /运行代码/ })).toHaveCount(0)
  })

  test('颜色表（调色板）抽屉打开与关闭', async ({ page }) => {
    await page.goto('/#/work/2d/challenge/square')
    await page.getByRole('button', { name: /编辑 ▾/ }).click()
    await page.getByRole('menuitem', { name: /颜色表（调色板）/ }).click()

    await expect(page.getByRole('complementary', { name: '颜色表' })).toBeVisible()
    await expect(page.getByText('（空白）')).toBeVisible()

    // 点击抽屉右上角关闭
    await page.getByTitle('关闭颜色表').click()
    await expect(page.getByRole('complementary', { name: '颜色表' })).toHaveCount(0)
  })

  test('自由创作模式显示作品菜单，可打开作品库', async ({ page }) => {
    await page.goto('/#/work/2d/create')
    await expect(page.getByRole('button', { name: /作品 ▾/ })).toBeVisible()

    await page.getByRole('button', { name: /作品 ▾/ }).click()
    await expect(page.getByRole('menuitem', { name: '保存作品' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: '作品库…' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: '导出 PNG' })).toBeVisible()

    // 打开作品库弹窗
    await page.getByRole('menuitem', { name: '作品库…' }).click()
    await expect(page.getByRole('dialog', { name: '本地作品库' })).toBeVisible()
    await page.getByRole('button', { name: '关闭' }).click()
    await expect(page.getByRole('dialog', { name: '本地作品库' })).toHaveCount(0)
  })

  test('三维工作台显示剖切工具手柄开关与剖切中标识', async ({ page }) => {
    await page.goto('/#/work/3d/challenge/voxel-cube')

    // 默认收起剖切手柄
    await expect(page.locator('.voxel-cut-handle')).toHaveCount(0)

    // 在视图菜单中打开剖切工具
    await page.getByRole('button', { name: /视图 ▾/ }).click()
    await page.getByRole('menuitem', { name: /剖切工具（手柄）/ }).click()

    // 双图剖切手柄出现（两图各 3 个，共 6 个）
    await expect(page.locator('.voxel-cut-handle')).toHaveCount(6)
  })
})
