import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { parseProgress, STORAGE_KEY } from '../src/hooks/useProgress'
import { exportProject, importProject, type Project } from '../src/engine/projects'
import { pixelReference, pixelReferenceIds } from '../src/engine/pixelCreation'

const code = 'move_origin(2, 3)\ndef pixel(x, y):\n    if x == 0 and y == 0:\n        return 7\n    if x == 1 and y == 0:\n        return 8\n    return 0\n'
const base = { schemaVersion: 1, codes: { square: 'challenge preserved' }, passed: { circle: true }, levelId: 'square', introSeen: true, mode: '2d', pixelActivity: 'create', pixelCode: code, voxelCode: '3d draft', voxelCodes: { 'voxel-house': '3d challenge' }, voxelPassed: { 'voxel-house': true } }
const project: Project = { id: 'pixel-old', name: '像素作品', code, referenceId: 'pixel-tree', createdAt: '2026-09-21T00:00:00.000Z', updatedAt: '2026-09-21T00:00:00.000Z' }
async function seed(page: Page, value: unknown = base) {
  await page.addInitScript(({ key, value }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value))
  }, { key: STORAGE_KEY, value })
  await page.goto('/')
}
async function state(page: Page) {
  await expect(page.getByTestId('storage-status')).toHaveAttribute('data-save-state', 'saved')
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY)
}
async function write(page: Page, text: string) {
  await page.evaluate(code => navigator.clipboard.writeText(code), text)
  await page.locator('.code-editor').click({ position: { x: 160, y: 50 } })
  await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.press('ControlOrMeta+V')
}
const dialog = (page: Page) => page.getByRole('dialog', { name: '本地作品库' })
async function run(page: Page) {
  await expect(page.getByRole('button', { name: '运行', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: '运行', exact: true }).click()
  await expect(page.getByRole('button', { name: '导出 PNG', exact: true })).toBeEnabled()
}
async function png(page: Page, click: () => Promise<unknown>) {
  const wait = page.waitForEvent('download'); await click()
  const download = await wait
  expect(download.suggestedFilename()).toMatch(/\.png$/)
  const bytes = await readFile((await download.path())!)
  expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
  return bytes.toString('base64')
}

test('二维协议与旧存档兼容，维度和缩略图严格校验', () => {
  const withPreview = { ...project, preview: '0'.repeat(441) }
  expect(importProject(exportProject(withPreview, '2d'), 'new', '2d')).toEqual({ ...withPreview, id: 'new' })
  expect(() => importProject(exportProject(project, '2d'), 'new')).toThrow()
  for (const patch of [{ preview: '1' }, { preview: '9'.repeat(441) }, { referenceId: 'voxel-cube' }]) {
    expect(() => exportProject({ ...project, ...patch }, '2d')).toThrow()
  }
  const value = parseProgress(JSON.stringify({ ...base, pixelProjects: [project], pixelProjectId: project.id }))
  expect(parseProgress(JSON.stringify(value))).toEqual(value)
  expect(value.voxelCode).toBe('3d draft')
  expect(value.codes).toEqual(base.codes)
  for (const patch of [{ pixelProjects: [project, project] }, { pixelProjectId: 'missing' }, { pixelReferenceId: 'square' }, { pixelActivity: 'bad' }, { pixelCode: 1 }]) {
    expect(() => parseProgress(JSON.stringify({ ...base, ...patch }))).toThrow()
  }
})

test('二维创作、原点、缩略图、透明 PNG、刷新与挑战三维隔离', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.setViewportSize({ width: 1440, height: 900 })
  await seed(page)
  await expect(page.getByRole('heading', { name: '像素创作实验室' })).toBeVisible()
  await expect(page.getByTestId('score')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '导出 PNG', exact: true })).toBeDisabled()
  await run(page)
  await expect(page.getByLabel('学生作品画布')).toHaveAttribute('data-origin', '2,3')
  await expect(page.getByLabel('目标图画布')).toHaveAttribute('data-origin', '2,3')
  const data = await png(page, () => page.getByRole('button', { name: '导出 PNG', exact: true }).click())
  const image = await page.evaluate(async data => {
    const img = new Image(); img.src = 'data:image/png;base64,' + data; await img.decode()
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height
    const ctx = c.getContext('2d')!; ctx.drawImage(img, 0, 0)
    const at = (x: number, y: number) => [...ctx.getImageData(x, y, 1, 1).data]
    return { width: img.width, height: img.height, blank: at(0, 0), white: at(500, 300), black: at(540, 300) }
  }, data)
  expect(image).toEqual({ width: 840, height: 840, blank: [0, 0, 0, 0], white: [255, 255, 255, 255], black: [23, 32, 51, 255] })
  await page.getByRole('button', { name: '作品库', exact: true }).click()
  await page.getByLabel('当前作品名称').fill('双色像素')
  await dialog(page).getByRole('button', { name: '保存作品', exact: true }).click()
  let saved = await state(page)
  expect(saved.pixelProjects[0].preview).toHaveLength(441)
  expect(saved.pixelProjects[0].preview[7 * 21 + 12]).toBe('7')
  await expect(page.getByAltText('双色像素的预览')).toBeVisible()
  await page.screenshot({ path: 'test-results/pixel-library-1440.png' })
  const storedPng = await png(page, () => page.getByRole('button', { name: '导出 PNG 双色像素', exact: true }).click())
  expect(storedPng).toBe(data)
  await page.getByRole('button', { name: '关闭作品库' }).click()
  await page.screenshot({ path: 'test-results/pixel-create-1440.png' })
  await page.setViewportSize({ width: 1180, height: 768 })
  await page.screenshot({ path: 'test-results/pixel-create-1180.png' })
  await write(page, 'def pixel(x, y):\n    return 1\n')
  await expect(page.getByRole('button', { name: '导出 PNG', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '保存作品', exact: true }).click()
  saved = await state(page)
  expect(saved.pixelProjects[0].preview).toBeUndefined()
  await page.reload()
  await expect(page.locator('.view-lines')).toContainText('return 1')
  await page.getByRole('group', { name: '二维玩法' }).getByRole('button', { name: '挑战', exact: true }).click()
  await expect(page.locator('.view-lines')).toContainText('challenge preserved')
  await expect(page.getByRole('button', { name: '载入示例' })).toHaveCount(0)
  await page.getByRole('button', { name: '3D 体素', exact: true }).click()
  await expect(page.locator('.view-lines')).toContainText('3d draft')
  saved = await state(page)
  expect(saved.codes).toEqual(base.codes); expect(saved.passed).toEqual(base.passed)
  expect(saved.voxelCodes).toEqual(base.voxelCodes); expect(saved.voxelPassed).toEqual(base.voxelPassed)
})

test('二维参考只改上图，示例与 Python 结果一致，草稿备份和导入导出', async ({ page }) => {
  await seed(page, { ...base, pixelProjects: [project] })
  await page.getByRole('button', { name: '作品库', exact: true }).click()
  page.once('dialog', d => d.dismiss())
  await page.getByRole('button', { name: '打开 像素作品', exact: true }).click()
  expect((await state(page)).pixelProjectId).toBeUndefined()
  page.once('dialog', d => d.accept())
  await page.getByRole('button', { name: '打开 像素作品', exact: true }).click()
  expect((await state(page)).pixelProjects).toHaveLength(2)
  await page.getByRole('button', { name: '关闭作品库' }).click()
  for (const id of pixelReferenceIds) {
    const titles = { 'pixel-cross': '彩色十字', 'pixel-diamond': '菱形花纹', 'pixel-tree': '像素小树' }
    await page.getByRole('navigation', { name: '二维参考图' }).getByRole('button', { name: titles[id], exact: true }).click()
    page.once('dialog', d => d.accept())
    await page.getByRole('button', { name: '载入示例', exact: true }).click()
    await run(page)
    await page.getByRole('button', { name: '保存作品', exact: true }).click()
    expect((await state(page)).pixelProjects.find((p: Project) => p.id === project.id).preview).toBe(pixelReference(id).join(''))
  }
  await page.getByRole('button', { name: '作品库', exact: true }).click()
  const wait = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出当前作品', exact: true }).click()
  const file = await readFile((await (await wait).path())!)
  expect(JSON.parse(file.toString()).mode).toBe('2d')
  const before = await state(page)
  await page.locator('input[type=file]').setInputFiles({ name: 'art.json', mimeType: 'application/json', buffer: file })
  await expect(dialog(page)).toContainText('作品已导入列表')
  const after = await state(page)
  expect(after.pixelProjects).toHaveLength(before.pixelProjects.length + 1)
  expect(after.pixelProjectId).toBe(before.pixelProjectId)
  expect(after.pixelProjects.at(-1).id).not.toBe(project.id)
  expect(after.pixelProjects.at(-1).preview).toBe(before.pixelProjects[0].preview)
  await page.locator('input[type=file]').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(file.toString().replace('"mode": "2d"', '"mode": "3d"')) })
  await expect(dialog(page).getByRole('alert')).toBeVisible()
  expect(await state(page)).toEqual(after)
})

test('三维完整缩略图与 PNG 不受剖切、旋转和参考影响，旧作品可补预览', async ({ page }) => {
  const voxel: Project = { ...project, id: 'old-voxel', referenceId: 'voxel-cube', code: 'def voxel(x, y, z):\n    return 4 if abs(x) <= 3 and abs(y) <= 3 and abs(z) <= 3 else 0\n' }
  await seed(page, { ...base, mode: '3d', voxelCode: voxel.code, voxelProjects: [voxel], voxelProjectId: voxel.id })
  await page.getByRole('button', { name: '作品库', exact: true }).click()
  await expect(page.getByText('待生成预览', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '导出 PNG 像素作品', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '关闭作品库' }).click()
  await run(page)
  const full = await png(page, () => page.getByRole('button', { name: '导出 PNG', exact: true }).click())
  await page.getByLabel('三维体素画布', { exact: true }).press('ArrowLeft')
  const handle = page.getByRole('slider').first()
  await handle.press('Home')
  const cut = await png(page, () => page.getByRole('button', { name: '导出 PNG', exact: true }).click())
  expect(cut).toBe(full)
  await page.getByRole('button', { name: '保存作品', exact: true }).click()
  const saved = await state(page)
  expect(saved.voxelProjects[0].preview).toHaveLength(4913)
  expect(saved.voxelProjects[0].preview.split('').filter((c: string) => c !== '0')).toHaveLength(343)
  await page.getByRole('button', { name: '作品库', exact: true }).click()
  await expect(page.getByAltText('像素作品的预览')).toBeVisible()
  await page.screenshot({ path: 'test-results/voxel-library.png' })
  await page.reload()
  await page.getByRole('button', { name: '作品库', exact: true }).click()
  expect(await png(page, () => page.getByRole('button', { name: '导出 PNG 像素作品', exact: true }).click())).toBe(full)
})


test('二维另存副本隔离，配额失败保护，切玩法取消旧运行', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await seed(page, { ...base, pixelProjects: [project], pixelProjectId: project.id, pixelReferenceId: project.referenceId })
  await page.getByRole('button', { name: '作品库', exact: true }).click()
  await page.getByLabel('当前作品名称').fill('副本')
  await page.getByRole('button', { name: '另存为副本', exact: true }).click()
  let saved = await state(page)
  expect(saved.pixelProjects).toHaveLength(2)
  expect(saved.pixelProjectId).not.toBe(project.id)
  expect(saved.pixelProjects[0]).toEqual(project)
  await page.getByRole('button', { name: '关闭作品库' }).click()
  await write(page, 'def pixel(x, y):\n    return 6\n')
  const before = await state(page)
  await page.evaluate(() => {
    const original = Storage.prototype.setItem
    Object.assign(window, { restoreTestStorage: () => { Storage.prototype.setItem = original } })
    Storage.prototype.setItem = function(key, value) {
      if (key === 'pixel-code-lab.progress') throw new DOMException('quota', 'QuotaExceededError')
      original.call(this, key, value)
    }
  })
  await page.getByRole('button', { name: '作品库', exact: true }).click()
  page.once('dialog', d => d.accept())
  await page.getByRole('button', { name: '新建草稿', exact: true }).click()
  await expect(dialog(page).getByRole('alert')).toContainText('作品未保存')
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY)).toEqual(before)
  await expect(page.locator('.view-lines')).toContainText('return 6')
  await page.evaluate(() => (window as unknown as { restoreTestStorage: () => void }).restoreTestStorage())
  await dialog(page).getByRole('button', { name: '保存作品', exact: true }).click()
  saved = await state(page)
  expect(saved.pixelProjects[0]).toEqual(project)
  expect(saved.pixelProjects[1].code).toContain('return 6')
  await page.getByRole('button', { name: '关闭作品库' }).click()
  await write(page, 'while True:\n    pass\ndef pixel(x, y):\n    return 1\n')
  const runButton = page.getByRole('button', { name: '运行', exact: true })
  await expect(runButton).toBeEnabled(); await runButton.click()
  await page.getByRole('group', { name: '二维玩法' }).getByRole('button', { name: '挑战', exact: true }).click()
  await expect(runButton).toBeEnabled()
  await expect(page.locator('.view-lines')).toContainText('challenge preserved')
  await expect(page.getByTestId('score')).toHaveCount(0)
  await expect(page.locator('.error')).toHaveCount(0)
  await page.getByRole('group', { name: '二维玩法' }).getByRole('button', { name: '自由创作', exact: true }).click()
  await expect(page.locator('.view-lines')).toContainText('while True')
  await expect(page.getByRole('button', { name: '导出 PNG', exact: true })).toBeDisabled()
})

test('二维错误保留历史作品，不为新代码伪造缩略图', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await seed(page, { ...base, pixelProjects: [project], pixelProjectId: project.id })
  await run(page)
  await page.getByRole('button', { name: '保存作品', exact: true }).click()
  const previous = (await state(page)).pixelProjects[0].preview
  await write(page, 'def pixel(x, y):\n    return True\n')
  await page.getByRole('button', { name: '运行', exact: true }).click()
  await expect(page.locator('.error[role=alert]')).toBeVisible()
  await expect(page.getByText('当前显示上次成功运行的作品，请重新运行更新。')).toBeVisible()
  await expect(page.getByRole('button', { name: '导出 PNG', exact: true })).toBeDisabled()
  expect((await state(page)).pixelProjects[0].preview).toBe(previous)
  await page.getByRole('button', { name: '保存作品', exact: true }).click()
  expect((await state(page)).pixelProjects[0].preview).toBeUndefined()
  await page.getByRole('button', { name: '作品库', exact: true }).click()
  await expect(page.getByText('待生成预览', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '导出 PNG 像素作品', exact: true })).toBeDisabled()
})
