import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { exportProject, importProject, maxProjectFileBytes, parseProjectLibrary, projectFilename, type VoxelProject } from '../src/engine/projects'
import { parseProgress, STORAGE_KEY } from '../src/hooks/useProgress'
import { creationDraft } from '../src/hooks/useVoxelLibrary'

const sourceA = 'def voxel(x, y, z):\n    return 4 if (x, y, z) == (1, 2, 3) else 0\n'
const sourceB = 'def voxel(x, y, z):\n    return 2 if (x, y, z) == (0, 0, 0) else 0\n'
const project: VoxelProject = { id: 'saved-model', name: '旧作品', code: sourceB, referenceId: 'voxel-cylinder', createdAt: '2026-09-21T00:00:00.000Z', updatedAt: '2026-09-21T00:01:00.000Z' }
const legacy = { schemaVersion: 1, codes: { square: 'keep 2d' }, passed: { square: true }, levelId: 'square', introSeen: true, mode: '3d', voxelActivity: 'create', voxelCodes: { 'voxel-house': 'keep challenge' }, voxelPassed: { 'voxel-house': true }, voxelCode: sourceA, voxelReferenceId: 'voxel-sphere' }

async function seed(page: Page, value: unknown = legacy) {
  await page.addInitScript(({ key, value }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value))
  }, { key: STORAGE_KEY, value })
  await page.goto('/')
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
const library = (page: Page) => page.getByRole('dialog', { name: '本地作品库' })
const selectFile = (page: Page, content: string | Buffer) => page.locator('input[type=file]').setInputFiles({ name: 'model.json', mimeType: 'application/json', buffer: typeof content === 'string' ? Buffer.from(content) : content })

test('作品协议往返、空代码、独立导入 ID 与严格格式校验', () => {
  const text = exportProject(project)
  expect(JSON.parse(text).project.id).toBeUndefined()
  expect(importProject(text, 'new-id')).toEqual({ ...project, id: 'new-id' })
  expect(importProject(exportProject({ ...project, code: '' }), 'empty').code).toBe('')
  expect(projectFilename('../a:b?')).toBe('pixel-code-lab-.._a_b_.json')
  const format = JSON.parse(text)
  for (const value of [null, [], {}, { ...format, version: 2 }, { ...format, mode: '2d' }, { ...format, language: 'cpp' }, { ...format, radius: 9 }]) {
    expect(() => importProject(JSON.stringify(value), 'id')).toThrow()
  }
  for (const patch of [{ name: ' ' }, { name: 'a'.repeat(81) }, { code: 2 }, { code: 'x'.repeat(200001) }, { referenceId: '__proto__' }, { updatedAt: 'invalid' }, { createdAt: '2026-02-30T00:00:00.000Z' }, { updatedAt: '2026-09-20T00:00:00.000Z' }]) {
    expect(() => importProject(JSON.stringify({ ...format, project: { ...format.project, ...patch } }), 'id')).toThrow()
  }
  expect(() => importProject('{broken', 'id')).toThrow()
  expect(() => importProject(' '.repeat(maxProjectFileBytes + 1), 'id')).toThrow('1 MB')
  expect(() => parseProjectLibrary([project, project])).toThrow('重复')
})

test('旧草稿完整保留、作品关联与草稿变更检测、损坏新字段拒绝', () => {
  const migrated = parseProgress(JSON.stringify(legacy))
  expect(migrated).toMatchObject({ voxelCode: sourceA, codes: legacy.codes, voxelCodes: legacy.voxelCodes, voxelProjects: [] })
  const progress = parseProgress(JSON.stringify({ ...legacy, voxelProjects: [project], voxelProjectId: project.id, voxelCode: project.code, voxelReferenceId: project.referenceId }))
  expect(creationDraft(progress).modified).toBe(false)
  expect(creationDraft({ ...progress, voxelCode: '' }).modified).toBe(true)
  expect(creationDraft({ ...progress, voxelDraftName: '修改名称' }).modified).toBe(true)
  expect(creationDraft({ ...progress, voxelReferenceId: 'voxel-house' }).modified).toBe(true)
  expect(parseProgress(JSON.stringify(progress))).toEqual(progress)
  for (const patch of [{ voxelProjects: null }, { voxelProjects: [project, project] }, { voxelProjectId: 'missing' }, { voxelDraftName: false }]) {
    expect(() => parseProgress(JSON.stringify({ ...legacy, ...patch }))).toThrow()
  }
})

test('命名保存、更新、另存副本、刷新恢复、运行画面与挑战隔离', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.setViewportSize({ width: 1180, height: 768 })
  await seed(page)
  const run = page.getByRole('button', { name: '运行', exact: true })
  const canvas = page.getByLabel('三维体素画布', { exact: true })
  await expect(run).toBeEnabled()
  await run.click()
  await expect(canvas).toHaveAttribute('data-voxels', '1')
  await page.getByRole('button', { name: '作品库', exact: true }).click()
  await page.getByLabel('当前作品名称').fill('我的模型')
  await library(page).getByRole('button', { name: '保存作品', exact: true }).click()
  let state = await saved(page)
  const original = state.voxelProjects[0]
  expect(original).toMatchObject({ name: '我的模型', code: sourceA, referenceId: 'voxel-sphere' })
  await page.getByRole('button', { name: '关闭作品库' }).click()
  await write(page, sourceB)
  await saved(page)
  await page.reload()
  await expect(page.locator('.view-lines')).toContainText('(0, 0, 0)')
  await expect(page.locator('.project-toolbar')).toContainText('待保存到作品库')
  await page.getByRole('button', { name: '保存作品', exact: true }).click()
  state = await saved(page)
  expect(state.voxelProjects).toHaveLength(1)
  expect(state.voxelProjects[0]).toMatchObject({ id: original.id, createdAt: original.createdAt, code: sourceB })
  await write(page, sourceA)
  await page.getByRole('navigation', { name: '三维参考模型' }).getByRole('button', { name: '圆柱', exact: true }).click()
  await page.getByRole('button', { name: '作品库', exact: true }).click()
  await page.getByLabel('当前作品名称').fill('模型副本')
  await page.getByRole('button', { name: '另存为副本' }).click()
  state = await saved(page)
  expect(state.voxelProjects).toHaveLength(2)
  expect(state.voxelProjects[0].code).toBe(sourceB)
  expect(state.voxelProjects[1]).toMatchObject({ name: '模型副本', code: sourceA, referenceId: 'voxel-cylinder' })
  expect(state.voxelProjectId).not.toBe(original.id)
  await page.getByRole('button', { name: '打开 我的模型', exact: true }).click()
  await page.getByRole('button', { name: '关闭作品库' }).click()
  await expect(canvas).toHaveAttribute('data-voxels', '0')
  await expect(page.locator('.view-lines')).toContainText('(0, 0, 0)')
  await expect(page.getByRole('heading', { name: '参考图 · 球体' })).toBeVisible()
  await page.reload()
  await expect(page.locator('.project-toolbar')).toContainText('我的模型')
  await expect(page.locator('.view-lines')).toContainText('(0, 0, 0)')
  await expect(run).toBeEnabled()
  await run.click()
  await expect(canvas).toHaveAttribute('data-voxels', '1')
  await expect(page.getByTestId('voxel-score')).toHaveCount(0)
  state = await saved(page)
  expect(state.codes).toEqual(legacy.codes)
  expect(state.passed).toEqual(legacy.passed)
  expect(state.voxelCodes).toEqual(legacy.voxelCodes)
  expect(state.voxelPassed).toEqual(legacy.voxelPassed)
  await page.getByRole('button', { name: '挑战', exact: true }).click()
  await expect(page.getByRole('button', { name: '作品库', exact: true })).toHaveCount(0)
})

test('打开与新建前取消保留原文、确认备份草稿、运行取消不污染新作品', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await seed(page, { ...legacy, voxelProjects: [project] })
  await page.getByRole('button', { name: '作品库', exact: true }).click()
  page.once('dialog', dialog => dialog.dismiss())
  await page.getByRole('button', { name: '打开 旧作品', exact: true }).click()
  expect((await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY)).voxelCode).toBe(sourceA)
  await expect(page.locator('.project-list li')).toHaveCount(1)
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: '打开 旧作品', exact: true }).click()
  let state = await saved(page)
  expect(state.voxelProjects).toHaveLength(2)
  expect(state.voxelProjects.find((item: VoxelProject) => item.id !== project.id).code).toBe(sourceA)
  expect(state.voxelCode).toBe(sourceB)
  await page.getByRole('button', { name: '关闭作品库' }).click()
  await write(page, 'while True:\n    pass')
  const run = page.getByRole('button', { name: '运行', exact: true })
  await expect(run).toBeEnabled()
  await run.click()
  await page.getByRole('button', { name: '作品库', exact: true }).click()
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: '新建草稿' }).click()
  state = await saved(page)
  expect(state.voxelProjectId).toBeNull()
  expect(state.voxelProjects).toHaveLength(3)
  expect(state.voxelProjects.find((item: VoxelProject) => item.name === '旧作品（草稿）').code).toContain('while True')
  await page.getByRole('button', { name: '关闭作品库' }).click()
  await expect(page.locator('.view-lines')).toContainText('return 0')
  await expect(run).toBeEnabled()
  await run.click()
  await expect(page.getByTestId('voxel-status')).toContainText('0 个体素')
  await expect(page.locator('.error[role=alert]')).toHaveCount(0)
  await page.reload()
  await expect(page.locator('.view-lines')).toContainText('return 0')
})

test('导出包含当前编辑、导入不替换草稿或执行、重复导入新增副本与无效文件拒绝', async ({ page }) => {
  await seed(page)
  await page.getByRole('button', { name: '作品库', exact: true }).click()
  await page.getByLabel('当前作品名称').fill('导出模型')
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出当前作品' }).click()
  const download = await downloading
  expect(download.suggestedFilename()).toBe('pixel-code-lab-导出模型.json')
  const file = await readFile((await download.path())!, 'utf8')
  expect(importProject(file, 'test')).toMatchObject({ name: '导出模型', code: sourceA })
  for (let i = 0; i < 2; i++) {
    await selectFile(page, file)
    await expect(library(page).getByRole('status')).toContainText('已导入')
    await expect(page.locator('.project-list li')).toHaveCount(i + 1)
  }
  const state = await saved(page)
  expect(state.voxelProjects.map((item: VoxelProject) => item.name)).toEqual(['导出模型', '导出模型（2）'])
  expect(state.voxelProjects[0].id).not.toBe(state.voxelProjects[1].id)
  expect(state.voxelCode).toBe(sourceA)
  expect(state.voxelProjectId).toBeUndefined()
  for (const file of ['{bad json', JSON.stringify({ version: 5 }), Buffer.alloc(maxProjectFileBytes + 1)]) {
    await selectFile(page, file)
    await expect(library(page).getByRole('alert')).toBeVisible()
    expect(await saved(page)).toEqual(state)
  }
  await page.getByRole('button', { name: '关闭作品库' }).click()
  await expect(page.getByTestId('voxel-status')).toHaveText('等待运行')
})

test('配额写入失败不切换、不替换原作品，恢复存储后可重新保存', async ({ page }) => {
  await seed(page, { ...legacy, voxelProjects: [project] })
  await page.getByRole('button', { name: '作品库', exact: true }).click()
  await page.getByLabel('当前作品名称').fill('空间不足时的作品')
  const before = await saved(page)
  await page.evaluate(() => {
    const original = Storage.prototype.setItem
    ;(window as unknown as { restoreStorage: () => void }).restoreStorage = () => { Storage.prototype.setItem = original }
    Storage.prototype.setItem = function (key, value) {
      if (key === 'pixel-code-lab.progress') throw new DOMException('full', 'QuotaExceededError')
      return original.call(this, key, value)
    }
  })
  await library(page).getByRole('button', { name: '保存作品', exact: true }).click()
  await expect(library(page).getByRole('alert')).toContainText('作品未保存')
  await expect(page.locator('.project-list li')).toHaveCount(1)
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: '打开 旧作品', exact: true }).click()
  await expect(library(page).getByRole('alert')).toContainText('作品未保存')
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY)).toEqual(before)
  await page.getByRole('button', { name: '关闭作品库' }).click()
  await expect(page.locator('.view-lines')).toContainText('(1, 2, 3)')
  await page.evaluate(() => (window as unknown as { restoreStorage: () => void }).restoreStorage())
  await page.getByRole('button', { name: '保存作品', exact: true }).click()
  expect((await saved(page)).voxelProjects).toHaveLength(2)
})

for (const failure of ['malformed-library', 'read-error'] as const) {
  test(`存档保护 ${failure}：拒绝作品写入、原文保留、仍可导出当前草稿`, async ({ page }) => {
    const raw = JSON.stringify({ ...legacy, voxelProjects: failure === 'malformed-library' ? [project, project] : [project] })
    await page.addInitScript(({ key, raw, failure }) => {
      localStorage.setItem(key, raw)
      const original = Storage.prototype.getItem
      ;(window as unknown as { readOriginal: () => string | null }).readOriginal = () => original.call(localStorage, key)
      if (failure === 'read-error') Storage.prototype.getItem = function (name) {
        if (name === key) throw new DOMException('read blocked', 'SecurityError')
        return original.call(this, name)
      }
    }, { key: STORAGE_KEY, raw, failure })
    await page.goto('/')
    await page.getByRole('button', { name: '开始挑战', exact: true }).click()
    await page.getByRole('button', { name: '3D 体素', exact: true }).click()
    await page.getByRole('button', { name: '作品库', exact: true }).click()
    await page.getByLabel('当前作品名称').fill('恢复前的草稿')
    await library(page).getByRole('button', { name: '保存作品', exact: true }).click()
    await expect(library(page).getByRole('alert')).toContainText('原存档未覆盖')
    await expect(page.locator('.project-list li')).toHaveCount(0)
    expect(await page.evaluate(() => (window as unknown as { readOriginal: () => string | null }).readOriginal())).toBe(raw)
    const downloading = page.waitForEvent('download')
    await page.getByRole('button', { name: '导出当前作品' }).click()
    const download = await downloading
    const content = await readFile((await download.path())!, 'utf8')
    expect(importProject(content, 'recovered').name).toBe('恢复前的草稿')
  })
}
