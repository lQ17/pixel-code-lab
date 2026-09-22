import { expect, type Page } from '@playwright/test'

/**
 * 进入 2D 挑战工作台
 */
export async function enterChallenge2d(page: Page, levelId = 'square') {
  await page.goto(`/#/work/2d/challenge/${levelId}`)
  await expect(page.locator('.editor-zone')).toBeVisible()
  await expect(page.locator('.monaco-editor .view-lines')).toBeVisible()
}

/**
 * 进入 2D 自由创作工作台
 */
export async function enterCreate2d(page: Page) {
  await page.goto('/#/work/2d/create')
  await expect(page.locator('.editor-zone')).toBeVisible()
}

/**
 * 进入 3D 挑战工作台
 */
export async function enterChallenge3d(page: Page, levelId = 'voxel-cube') {
  await page.goto(`/#/work/3d/challenge/${levelId}`)
  await expect(page.locator('.editor-zone')).toBeVisible()
  await expect(page.locator('.monaco-editor .view-lines')).toBeVisible()
}

/**
 * 进入 3D 自由创作工作台
 */
export async function enterCreate3d(page: Page) {
  await page.goto('/#/work/3d/create')
  await expect(page.locator('.editor-zone')).toBeVisible()
}

/**
 * 打开指定的顶栏菜单
 */
export async function openMenu(page: Page, name: '作品' | '编辑' | '参考' | '视图' | '运行' | '帮助') {
  const trigger = page.getByRole('button', { name: new RegExp(`^${name}`) })
  await trigger.click()
  const dropdown = page.locator('.menu-dropdown')
  await expect(dropdown).toBeVisible()
  return dropdown
}

/**
 * 运行代码（通过菜单真实点击）
 */
export async function runCode(page: Page) {
  const trigger = page.getByRole('button', { name: /^运行/ })
  await trigger.click()
  const runItem = page.getByRole('menuitem', { name: /运行代码/ })
  await expect(runItem).toBeEnabled()
  await runItem.click()
  await expect(page.locator('.menu-dropdown')).toHaveCount(0)
}

/**
 * 停止运行（通过运行中菜单真实点击）
 */
export async function stopCode(page: Page) {
  const trigger = page.getByRole('button', { name: /^运行/ })
  await trigger.click()
  const stopItem = page.getByRole('menuitem', { name: /停止运行/ })
  await expect(stopItem).toBeVisible()
  await stopItem.click()
  await expect(page.locator('.menu-dropdown')).toHaveCount(0)
}

/**
 * 重试加载 Python
 */
export async function retryLoad(page: Page) {
  const trigger = page.getByRole('button', { name: /^运行/ })
  await trigger.click()
  const retryItem = page.getByRole('menuitem', { name: /重试加载 Python/ })
  await expect(retryItem).toBeVisible()
  await retryItem.click()
}

/**
 * 从当前工作台返回入口页并切换挑战关卡
 */
export async function switchChallengeLevel(page: Page, levelName: RegExp | string) {
  await page.getByRole('button', { name: '返回入口' }).click()
  await expect(page.getByRole('heading', { name: 'Pixel Code Lab' })).toBeVisible()
  await page.getByRole('button', { name: typeof levelName === 'string' ? new RegExp(levelName) : levelName }).click()
  await expect(page.locator('.editor-zone')).toBeVisible()
}

/**
 * 导出 PNG（仅自由创作作品菜单可用）
 */
export async function clickExportPng(page: Page) {
  await openMenu(page, '作品')
  const item = page.getByRole('menuitem', { name: '导出 PNG' })
  await expect(item).toBeEnabled()
  await item.click()
}

/**
 * 保存作品（从作品菜单调用）
 */
export async function clickSaveProject(page: Page) {
  await openMenu(page, '作品')
  const item = page.getByRole('menuitem', { name: '保存作品' })
  await expect(item).toBeEnabled()
  await item.click()
  await expect(page.locator('.menu-dropdown')).toHaveCount(0)
}

/**
 * 断言菜单中导出 PNG 按钮处于禁用状态
 */
export async function expectExportPngDisabled(page: Page) {
  await openMenu(page, '作品')
  const item = page.getByRole('menuitem', { name: '导出 PNG' })
  await expect(item).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(page.locator('.menu-dropdown')).toHaveCount(0)
}

/**
 * 打开作品库弹窗
 */
export async function openProjectLibrary(page: Page) {
  await openMenu(page, '作品')
  const item = page.getByRole('menuitem', { name: '作品库…' })
  await expect(item).toBeVisible()
  await item.click()
  await expect(page.getByRole('dialog', { name: '本地作品库' })).toBeVisible()
}

/**
 * 恢复初始代码/积木
 */
export async function restoreTemplate(page: Page) {
  await openMenu(page, '编辑')
  const item = page.getByRole('menuitem', { name: /恢复初始/ })
  await expect(item).toBeEnabled()
  await item.click()
}

/**
 * 载入示例
 */
export async function loadExample(page: Page) {
  await openMenu(page, '编辑')
  const item = page.getByRole('menuitem', { name: '载入示例' })
  await expect(item).toBeVisible()
  await item.click()
}

/**
 * 断言运行按钮处于禁用状态
 */
export async function expectRunDisabled(page: Page) {
  const trigger = page.getByRole('button', { name: /^运行/ })
  await trigger.click()
  const runItem = page.getByRole('menuitem', { name: /运行代码/ })
  await expect(runItem).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(page.locator('.menu-dropdown')).toHaveCount(0)
}

/**
 * 切换积木生成的 Python 代码浮层
 */
export async function toggleBlocksCode(page: Page) {
  await openMenu(page, '编辑')
  const item = page.getByRole('menuitem', { name: /查看生成的 Python 代码/ })
  await item.click()
}

/**
 * 适应积木工作区
 */
export async function fitBlocks(page: Page) {
  await openMenu(page, '视图')
  const item = page.getByRole('menuitem', { name: /适应积木工作区/ })
  await item.click()
}

/**
 * 复制为 Python 作品
 */
export async function copyToPythonProject(page: Page) {
  await openMenu(page, '编辑')
  const item = page.getByRole('menuitem', { name: /复制为 Python 作品/ })
  await item.click()
}

/**
 * 切换编辑方式（Python / 积木）
 */
export async function switchEditorKind(page: Page, kind: 'Python 代码' | '图形积木') {
  await openMenu(page, '编辑')
  const item = page.getByRole('menuitemradio', { name: new RegExp(kind) })
  await item.click()
}

/**
 * 切换参考项
 */
export async function switchReference(page: Page, refTitle: RegExp | string) {
  await openMenu(page, '参考')
  const pattern = typeof refTitle === 'string' ? new RegExp(`^(\\s*[✓ ]\\s*)?${refTitle}$`) : refTitle
  const item = page.getByRole('menuitemradio', { name: pattern })
  await item.click()
}

/**
 * 切换 3D 剖切工具（手柄）显隐
 */
export async function toggleVoxelCutHandles(page: Page) {
  await openMenu(page, '视图')
  const item = page.getByRole('menuitem', { name: /剖切工具/ })
  await item.click()
}

/**
 * 切换 3D 坐标辅助
 */
export async function toggleVoxelAxes(page: Page) {
  await openMenu(page, '视图')
  const item = page.getByRole('menuitem', { name: /坐标辅助/ })
  await item.click()
}

/**
 * 恢复 3D 完整模型
 */
export async function restoreVoxelCut(page: Page) {
  await openMenu(page, '视图')
  const item = page.getByRole('menuitem', { name: /恢复完整模型/ })
  await item.click()
}

/**
 * 重置 3D 视角
 */
export async function resetVoxelView(page: Page) {
  await openMenu(page, '视图')
  const item = page.getByRole('menuitem', { name: /重置视角/ })
  await item.click()
}

