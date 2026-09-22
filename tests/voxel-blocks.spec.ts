import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { loadPyodide } from 'pyodide'
import { compileBlocks, emptyBlocks, emptyVoxelBlocks, parseBlocks, type BlockNode, type BlocksDocument } from '../src/blocks/model'
import { voxelBlocksExample } from '../src/blocks/voxelExamples'
import { blocksExample } from '../src/blocks/examples'
import { voxelReference, voxelStarter, voxelTargetIds, getVoxelLevel, type VoxelLevelId } from '../src/engine/voxel'
import { exportProject, importProject, parseProject, type Project } from '../src/engine/projects'
import { parseProgress, STORAGE_KEY } from '../src/hooks/useProgress'
import { creationDraft } from '../src/hooks/useProjectLibrary'
import { runCode, loadExample, openProjectLibrary, switchEditorKind, switchReference, fitBlocks, toggleBlocksCode, copyToPythonProject, clickExportPng, expectExportPngDisabled, expectRunDisabled, toggleVoxelCutHandles } from './helpers'

const pythonDraft = 'def voxel(x, y, z):\n    return 7 if x == 1 and y == 2 and z == 3 else 0\n'
const base = {
  schemaVersion: 1, levelId: 'square', codes: { square: 'keep 2d' }, passed: { square: true }, introSeen: true,
  mode: '3d', voxelActivity: 'create', voxelCodes: {}, voxelCode: pythonDraft, voxelReferenceId: 'voxel-house',
  pixelEditor: 'blocks', pixelBlocks: { document: blocksExample('pixel-cross'), name: '二维草稿', referenceId: 'pixel-cross', projectId: null },
}
const draft = (document: BlocksDocument = emptyVoxelBlocks, referenceId: VoxelLevelId = 'voxel-cube') => ({ document, name: '三维积木', referenceId, projectId: null })
const blockProject = (id: VoxelLevelId = 'voxel-sphere'): Project => ({
  id: 'saved-block', name: '已有三维积木', referenceId: id, editor: 'blocks', blocks: voxelBlocksExample(id), code: compileBlocks(voxelBlocksExample(id)).code,
  createdAt: '2026-09-22T00:00:00.000Z', updatedAt: '2026-09-22T00:00:00.000Z',
})
const docOf = (body: BlockNode): BlocksDocument => ({ version: 2, mode: '3d', workspace: { blocks: { languageVersion: 0, blocks: [{ type: 'voxel_entry', id: 'root', inputs: { BODY: { block: body } } }] } } })
const number = (id: string, n: number): BlockNode => ({ type: 'pixel_integer', id, fields: { NUM: n } })
const remainderDoc = docOf({ type: 'pixel_return', id: 'error-return', inputs: { COLOR: { block: {
  type: 'pixel_math', id: 'mod', fields: { OP: '%' }, inputs: { A: { block: number('a', 1) }, B: { block: number('b', 2) } },
} } } })
const library = (page: Page) => page.getByRole('dialog', { name: '本地作品库' })
async function seed(page: Page, patch: Record<string, unknown> = {}, route = '/#/work/3d/create') {
  await page.addInitScript(({ key, value }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value))
  }, { key: STORAGE_KEY, value: { ...base, ...patch } })
  await page.goto(route)
  await expect(page.locator('.editor-zone')).toBeVisible()
}
async function saved(page: Page) {
  await expect(page.getByTestId('storage-status')).toHaveAttribute('data-save-state', 'saved')
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY)
}
async function loadBlocksExample(page: Page) {
  page.once('dialog', d => d.accept())
  await loadExample(page)
  await expect(page.locator('.blocks-warning')).toHaveCount(0)
}

test('七个三维积木示例经真实 Python 执行与目标逐格一致，Z 轴和错误行号正确', async () => {
  const python = await loadPyodide({ indexURL: resolve('node_modules/pyodide') })
  const execute = readFileSync(resolve('src/runners/execute.py'), 'utf8')
  const run = async (doc: BlocksDocument) => {
    python.globals.set('_source', compileBlocks(doc).code)
    python.globals.set('_radius', 8); python.globals.set('_mode', '3d')
    return JSON.parse(await python.runPythonAsync(execute))
  }
  expect(voxelTargetIds).toHaveLength(7)
  expect(compileBlocks(parseBlocks(emptyVoxelBlocks, '3d')).code).toBe(voxelStarter)
  for (const id of voxelTargetIds) {
    const doc = parseBlocks(voxelBlocksExample(id), '3d')
    const result = await run(doc)
    expect(result.error, id).toBeUndefined()
    expect(result.colors, id).toEqual(voxelReference(id))
  }
  const axisDoc = docOf({ type: 'pixel_return', id: 'ret', inputs: { COLOR: { block: {
    type: 'pixel_math', id: 'wrap', fields: { OP: '%' }, inputs: {
      A: { block: { type: 'voxel_coord', id: 'z', fields: { AXIS: 'z' } } }, B: { block: number('nine', 9) },
    },
  } } } })
  const zColors = (await run(axisDoc)).colors
  expect(zColors.slice(0, 289)).toEqual(Array(289).fill(1))
  expect(zColors.slice(8 * 289, 9 * 289)).toEqual(Array(289).fill(0))
  expect(zColors.slice(16 * 289)).toEqual(Array(289).fill(8))
  const bad = structuredClone(remainderDoc)
  bad.workspace.blocks.blocks[0].inputs!.BODY.block!.inputs!.COLOR.block!.inputs!.B.block!.fields!.NUM = 0
  const failed = await run(bad)
  expect(failed.error.kind).toBe('ZeroDivisionError')
  expect(compileBlocks(bad).lineBlocks[failed.error.line]).toBe('error-return')
})

test('二维旧结构不变，三维结构版本、跨维度积木、入口和资源限制严格校验', () => {
  expect(parseBlocks(emptyBlocks)).toEqual(emptyBlocks)
  expect(parseBlocks(emptyVoxelBlocks, '3d')).toEqual(emptyVoxelBlocks)
  expect(() => parseBlocks(emptyVoxelBlocks)).toThrow('维度')
  expect(() => parseBlocks(emptyBlocks, '3d')).toThrow('维度')
  for (const doc of [{ ...emptyVoxelBlocks, version: 99 }, { ...emptyVoxelBlocks, mode: '2d' }]) expect(() => parseBlocks(doc, '3d')).toThrow()
  for (const type of ['pixel_entry', 'pixel_coord', '__proto__', 'text']) expect(() => parseBlocks(docOf({ type, id: 'wrong' }), '3d')).toThrow()
  const missing = docOf({ type: 'pixel_return', id: 'ret' })
  expect(compileBlocks(parseBlocks(missing, '3d')).code).toBe('')
  const lots = structuredClone(emptyVoxelBlocks)
  for (let i = 0; i < 250; i++) lots.workspace.blocks.blocks.push(number(`n${i}`, i))
  expect(() => parseBlocks(lots, '3d')).toThrow('250')
  const root = structuredClone(emptyVoxelBlocks)
  root.workspace.blocks.blocks.push({ type: 'voxel_entry', id: 'second' })
  expect(() => parseBlocks(root, '3d')).toThrow('入口')
  let nested = number('leaf', 1)
  for (let i = 0; i < 40; i++) nested = { type: 'pixel_abs', id: `abs${i}`, inputs: { VALUE: { block: nested } } }
  expect(() => parseBlocks(docOf({ type: 'pixel_return', id: 'ret', inputs: { COLOR: { block: nested } } }), '3d')).toThrow('40')
})

test('三维作品 JSON 兼容旧 Python，结构重建代码、伪造预览与维度混用拒绝', () => {
  const project = { ...blockProject(), preview: voxelReference('voxel-sphere').join('') }
  const file = JSON.parse(exportProject(project))
  expect(file.version).toBe(2)
  expect(file.project.blocks).toMatchObject({ version: 2, mode: '3d' })
  expect(importProject(JSON.stringify(file), 'new')).toEqual({ ...project, id: 'new' })
  const forged = { ...file, project: { ...file.project, code: 'raise Exception("forged")' } }
  const imported = importProject(JSON.stringify(forged), 'new')
  expect(imported.code).toBe(project.code)
  expect(imported.preview).toBeUndefined()
  const old = { ...project, editor: undefined, blocks: undefined }
  expect(JSON.parse(exportProject(old)).version).toBe(1)
  expect(importProject(exportProject(old), 'old').code).toBe(old.code)
  for (const patch of [{ version: 1 }, { mode: '2d' }, { radius: 10 }, { language: 'cpp' }]) expect(() => importProject(JSON.stringify({ ...file, ...patch }), 'bad')).toThrow()
  expect(() => importProject(JSON.stringify(file), 'bad', '2d')).toThrow()
  expect(() => parseProject({ ...project, blocks: emptyBlocks })).toThrow()
  expect(() => parseProject({ ...project, referenceId: 'pixel-cross' }, '2d')).toThrow()
  const partial = { ...project, blocks: docOf({ type: 'pixel_return', id: 'unfinished' }) }
  const unfinished = parseProject(partial)
  expect(unfinished.code).toBe('')
  expect(unfinished.preview).toBeUndefined()
})

test('三维新存档字段逐关往返、旧代码保留、编辑关联与损坏字段严格校验', () => {
  const old = parseProgress(JSON.stringify(base))
  expect(old.voxelCode).toBe(pythonDraft)
  expect(old.voxelEditor).toBeUndefined()
  expect(creationDraft(old, '3d').editor).toBe('python')
  expect(old.pixelBlocks).toEqual(base.pixelBlocks)
  const project = blockProject()
  const value = { ...base, voxelEditor: 'blocks', voxelBlocks: { ...draft(project.blocks!, 'voxel-sphere'), projectId: project.id, name: project.name }, voxelProjects: [project], voxelChallengeEditors: { 'voxel-cube': 'blocks' }, voxelChallengeBlocks: { 'voxel-cube': emptyVoxelBlocks }, voxelCodes: { 'voxel-cube': '' }, voxelPassed: { 'voxel-cube': true } }
  const parsed = parseProgress(JSON.stringify(value))
  expect(parseProgress(JSON.stringify(parsed))).toEqual(parsed)
  expect(creationDraft(parsed, '3d').modified).toBe(false)
  expect(creationDraft(parsed, '3d', 'python').code).toBe(pythonDraft)
  expect(parsed.voxelCodes!['voxel-cube']).toBe('')
  for (const patch of [
    { voxelEditor: 'cpp' }, { voxelBlocks: [] }, { voxelBlocks: draft(emptyBlocks) },
    { voxelBlocks: { ...draft(), projectId: 'missing' } }, { voxelProjectId: project.id },
    { voxelChallengeEditors: [] }, { voxelChallengeEditors: { 'voxel-cube': 'js' } },
    { voxelChallengeBlocks: [] }, { voxelChallengeBlocks: { unknown: emptyVoxelBlocks } },
    { voxelChallengeBlocks: { 'voxel-cube': emptyBlocks } },
  ]) expect(() => parseProgress(JSON.stringify({ ...value, ...patch }))).toThrow()
})

test('七关默认 Python 和空积木，显式示例逐关通关、成绩共享且编辑结果隔离', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await seed(page, {}, '/#/work/3d/challenge/voxel-cube')
  for (const id of voxelTargetIds) {
    if (id !== 'voxel-cube') {
      await page.getByRole('button', { name: '返回入口' }).click()
      await page.getByRole('button', { name: new RegExp(getVoxelLevel(id).title) }).click()
    }
    await expect(page.locator('.view-lines')).toContainText('return 0')
    await switchEditorKind(page, '图形积木')
    await expect(page.locator('.voxel_entry')).toBeVisible()
    await expect(page.locator('.blocklyWorkspace .pixel_if')).toHaveCount(0)
    await expect(page.getByTestId('voxel-score')).toHaveCount(0)
    if (id === 'voxel-cube') {
      page.once('dialog', d => d.dismiss())
      await loadExample(page)
      await expect(page.locator('.blocklyWorkspace .pixel_if')).toHaveCount(0)
    }
    await loadBlocksExample(page)
    await runCode(page)
    await expect(page.getByTestId('voxel-score')).toContainText('100.0%')
    expect((await saved(page)).voxelPassed[id]).toBe(true)
    if (id === 'voxel-cube') {
      await switchEditorKind(page, 'Python 代码')
      await expect(page.getByTestId('voxel-score')).toHaveCount(0)
      await runCode(page)
      await expect(page.getByTestId('voxel-score')).toContainText('尚未匹配')
      await switchEditorKind(page, '图形积木')
      await expect(page.getByTestId('voxel-score')).toContainText('100.0%')
      await fitBlocks(page)
      await page.screenshot({ path: 'test-results/voxel-blocks-challenge-1440.png' })
    }
  }
  const state = await saved(page)
  expect(Object.keys(state.voxelPassed)).toEqual(voxelTargetIds)
  expect(state.passed).toEqual(base.passed)
  expect(state.voxelCode).toBe(pythonDraft)
  await page.reload()
  await expect(page.locator('.voxel_entry')).toBeVisible()
  await expect(page.getByTestId('voxel-score')).toHaveCount(0)
  await page.getByRole('button', { name: '返回入口' }).click()
  await expect(page.locator('.start-card.passed')).toHaveCount(7)
  await page.getByRole('button', { name: /STAGE 01 立方体/ }).click()
  await expect(page.locator('.voxel_entry')).toBeVisible()
  await runCode(page)
  await expect(page.getByTestId('voxel-score')).toContainText('100.0%')
})

test('三维创作参考与 Python 草稿隔离，作品/JSON/PNG/副本/刷新可用', async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 768 })
  await seed(page)
  await expect(page.locator('.view-lines')).toContainText('z == 3')
  await switchEditorKind(page, '图形积木')
  await expect(page.locator('.target-panel h2')).toContainText('立方体')
  await switchReference(page, '圆柱')
  await loadBlocksExample(page)
  await runCode(page)
  await expect(page.getByTestId('voxel-status')).toContainText('441 个体素')
  await expect(page.getByTestId('voxel-score')).toHaveCount(0)
  await toggleBlocksCode(page)
  await expect(page.getByLabel('积木生成的 Python', { exact: true })).toContainText('def voxel(x, y, z):')
  await page.getByTitle('关闭代码对照').click()
  await fitBlocks(page)
  await page.screenshot({ path: 'test-results/voxel-blocks-create-1180.png' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await toggleVoxelCutHandles(page)
  await page.getByRole('slider', { name: /X.*剖切/ }).first().focus()
  await page.keyboard.press('Home')
  const pngDownload = page.waitForEvent('download')
  await clickExportPng(page)
  const png = await readFile((await (await pngDownload).path())!)
  expect(png.subarray(1, 4).toString()).toBe('PNG')
  expect(png.readUInt32BE(16)).toBe(1024)
  expect(png.readUInt32BE(20)).toBe(1024)
  await openProjectLibrary(page)
  await page.getByLabel('当前作品名称').fill('圆柱积木')
  await library(page).getByRole('button', { name: '保存作品', exact: true }).click()
  let state = await saved(page)
  const originalId = state.voxelBlocks.projectId
  expect(state.voxelProjects[0].preview).toBe(voxelReference('voxel-cylinder').join(''))
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出当前作品', exact: true }).click()
  const file = await readFile((await (await download).path())!)
  expect(JSON.parse(file.toString()).version).toBe(2)
  await page.locator('input[type=file]').setInputFiles({ name: 'voxel-blocks.json', mimeType: 'application/json', buffer: file })
  await expect(library(page)).toContainText('作品已导入列表')
  expect((await saved(page)).voxelBlocks.projectId).toBe(originalId)
  await page.getByRole('button', { name: '另存为副本', exact: true }).click()
  state = await saved(page)
  expect(state.voxelProjects).toHaveLength(3)
  expect(state.voxelBlocks.projectId).not.toBe(originalId)
  await page.getByRole('button', { name: '关闭作品库' }).click()
  await copyToPythonProject(page)
  state = await saved(page)
  expect(state.voxelProjects).toHaveLength(4)
  expect(state.voxelProjects[3].editor).toBeUndefined()
  expect(state.voxelProjects[3].code).toBe(state.voxelProjects[0].code)
  await switchEditorKind(page, 'Python 代码')
  await expect(page.locator('.view-lines')).toContainText('z == 3')
  await expect(page.locator('.target-panel h2')).toContainText('简单房屋')
  await switchEditorKind(page, '图形积木')
  await expect(page.locator('.target-panel h2')).toContainText('圆柱')
  await switchReference(page, '球体')
  await expect(page.getByTestId('voxel-status')).toContainText('441 个体素')
  await page.reload()
  await expect(page.locator('.voxel_entry')).toBeVisible()
  expect((await saved(page)).voxelCode).toBe(pythonDraft)
  expect((await saved(page)).pixelBlocks).toEqual(base.pixelBlocks)
  await expectExportPngDisabled(page)
  await openProjectLibrary(page)
  await expect(page.getByRole('button', { name: '导出 PNG 圆柱积木', exact: true })).toBeEnabled()
})

test('三维跨编辑方式打开作品保护两侧草稿，取消和配额失败不切换，成功后可新建', async ({ page }) => {
  await seed(page, { voxelProjects: [blockProject()], voxelBlocks: draft(voxelBlocksExample('voxel-cube')) })
  await openProjectLibrary(page)
  page.once('dialog', d => d.dismiss())
  await page.getByRole('button', { name: '打开 已有三维积木', exact: true }).click()
  expect((await saved(page)).voxelEditor).toBeUndefined()
  const before = await saved(page)
  await page.evaluate(() => {
    const original = Storage.prototype.setItem
    Object.assign(window, { restoreStorage: () => { Storage.prototype.setItem = original } })
    Storage.prototype.setItem = function(key, value) { if (key === 'pixel-code-lab.progress') throw new DOMException('quota', 'QuotaExceededError'); original.call(this, key, value) }
  })
  page.once('dialog', d => d.accept())
  await page.getByRole('button', { name: '打开 已有三维积木', exact: true }).click()
  await expect(library(page).getByRole('alert')).toContainText('作品未保存')
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY)).toEqual(before)
  await expect(page.locator('.view-lines')).toContainText('z == 3')
  await page.evaluate(() => (window as unknown as { restoreStorage: () => void }).restoreStorage())
  page.once('dialog', d => d.accept())
  await page.getByRole('button', { name: '打开 已有三维积木', exact: true }).click()
  let state = await saved(page)
  expect(state.voxelEditor).toBe('blocks')
  expect(state.voxelProjects).toHaveLength(3)
  expect(state.voxelProjects.some((p: Project) => !p.editor && p.code === pythonDraft)).toBe(true)
  expect(state.voxelProjects.some((p: Project) => p.editor === 'blocks' && p.code === compileBlocks(voxelBlocksExample('voxel-cube')).code)).toBe(true)
  expect(state.voxelBlocks.projectId).toBe('saved-block')
  await page.getByRole('button', { name: '关闭作品库' }).click()
  await expect(page.locator('.voxel_entry')).toBeVisible()
  await expectExportPngDisabled(page)
  await runCode(page)
  await expect(page.getByTestId('voxel-status')).toContainText('925 个体素')
  await openProjectLibrary(page)
  await page.getByRole('button', { name: '新建草稿', exact: true }).click()
  state = await saved(page)
  expect(state.voxelBlocks.projectId).toBeNull()
  expect(compileBlocks(state.voxelBlocks.document).code).toBe(voxelStarter)
  expect(state.voxelCode).toBe(pythonDraft)
})

test('三维真实拖拽 Z 坐标、保存未完成结构、删除与撤销；二维坐标不出现 Z', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await seed(page, { voxelEditor: 'blocks' })
  await expect(page.locator('.voxel_entry')).toBeVisible()
  await page.locator('.blocklyToolboxCategory').filter({ hasText: '颜色' }).click()
  const geometry = await page.locator('.voxel_entry>path.blocklyPath').evaluate(el => {
    const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, scale: (el as SVGGraphicsElement).getScreenCTM()!.a }
  })
  const drag = async (selector: string, x: number, y: number) => {
    const box = (await page.locator(selector).boundingBox())!
    await page.mouse.move(box.x + 20, box.y + 10); await page.mouse.down()
    await page.mouse.move(box.x + 30, box.y + 10, { steps: 4 })
    await page.mouse.move(x + 20, y + 10, { steps: 25 }); await page.mouse.up()
  }
  await drag('.blocklyFlyout .pixel_return', geometry.x + 20 * geometry.scale, geometry.y + 30 * geometry.scale)
  await expect(page.locator('.blocks-warning')).toContainText('补齐')
  await expectRunDisabled(page)
  await openProjectLibrary(page)
  await page.getByLabel('当前作品名称').fill('未拼完的三维作品')
  await library(page).getByRole('button', { name: '保存作品', exact: true }).click()
  expect((await saved(page)).voxelProjects[0].code).toBe('')
  expect((await saved(page)).voxelProjects[0].preview).toBeUndefined()
  await page.getByRole('button', { name: '关闭作品库' }).click()
  await page.locator('.blocklyToolboxCategory').filter({ hasText: '坐标' }).click()
  const ret = (await page.locator('.blocklyWorkspace .pixel_return>path.blocklyPath').last().boundingBox())!
  await drag('.blocklyFlyout .voxel_coord', ret.x + ret.width - 8 * geometry.scale, ret.y)
  await page.locator('.blocklyWorkspace .voxel_coord .blocklyDropdownText').last().click()
  await page.getByRole('option', { name: 'z', exact: true }).click()
  await expect(page.locator('.blocks-warning')).toHaveCount(0)
  await toggleBlocksCode(page)
  await expect(page.getByLabel('积木生成的 Python', { exact: true })).toContainText('return z')
  await page.getByTitle('关闭代码对照').click()
  await runCode(page)
  // Return-value validation occurs after the call; the runner reports the definition,
  // while runtime exceptions below retain their actual statement line.
  await expect(page.locator('.error[role=alert]')).toContainText('InvalidColor · 第 1 行')
  await expect(page.locator('.error[role=alert]')).toContainText('行号指向函数定义')
  await expect(page.locator('.blocklyWorkspace .voxel_entry')).toHaveClass(/blocklyHighlighted/)
  await page.getByTitle('关闭输出面板').click()
  const path = page.locator('.blocklyWorkspace .voxel_coord>path.blocklyPath').last()
  const box = (await path.boundingBox())!
  await page.mouse.click(box.x + 2, box.y + box.height / 2)
  await page.keyboard.press('Delete')
  await expect(page.locator('.blocks-warning')).toContainText('补齐')
  await page.keyboard.press('ControlOrMeta+z')
  await expect(page.locator('.blocks-warning')).toHaveCount(0)
  await page.reload()
  await expect(page.locator('.blocklyWorkspace .voxel_coord .blocklyDropdownText')).toHaveText(/z/)
  await page.getByRole('button', { name: '返回入口' }).click()
  await page.getByRole('button', { name: '2D 像素', exact: true }).click()
  await page.getByRole('button', { name: '进入创作工作台 →' }).click()
  await page.locator('.blocklyWorkspace .pixel_coord .blocklyDropdownText').first().click()
  await expect(page.getByRole('option', { name: 'z', exact: true })).toHaveCount(0)
})

test('三维积木出错保留历史，错误高亮清除，失败不沿用预览', async ({ page }) => {
  await seed(page, { voxelEditor: 'blocks', voxelBlocks: draft(remainderDoc) })
  await runCode(page)
  await expect(page.getByTestId('voxel-status')).toContainText('4913 个体素')
  await page.locator('[data-id="b"] .blocklyText').last().click()
  await page.locator('.blocklyHtmlInput').fill('0')
  await page.locator('.blocklyHtmlInput').press('Enter')
  await runCode(page)
  await expect(page.locator('.error[role=alert]')).toContainText('ZeroDivisionError · 第 2 行')
  await expect(page.locator('[data-id="error-return"]')).toHaveClass(/blocklyHighlighted/)
  await expect(page.locator('.historical-banner')).toBeVisible()
  await expectExportPngDisabled(page)
  await openProjectLibrary(page)
  await library(page).getByRole('button', { name: '保存作品', exact: true }).click()
  expect((await saved(page)).voxelProjects[0].preview).toBeUndefined()
  await page.getByRole('button', { name: '关闭作品库' }).click()
  await page.getByTitle('关闭输出面板').click()
  await page.locator('[data-id="b"] .blocklyText').last().click()
  await page.locator('.blocklyHtmlInput').fill('2')
  await page.locator('.blocklyHtmlInput').press('Enter')
  await expect(page.locator('[data-id="error-return"]')).not.toHaveClass(/blocklyHighlighted/)
})

test('三维积木和 Python 切换取消旧运行，挑战与创作结果互不污染', async ({ page }) => {
  const loop = 'def voxel(x, y, z):\n    while True:\n        pass\n'
  await seed(page, { voxelEditor: 'blocks', voxelBlocks: draft(voxelBlocksExample('voxel-cube')), voxelCode: loop, voxelCodes: { 'voxel-cube': loop } })
  await runCode(page)
  await expect(page.getByTestId('voxel-status')).toContainText('343 个体素')
  await switchEditorKind(page, 'Python 代码')
  await runCode(page)
  await switchEditorKind(page, '图形积木')
  await expect(page.getByTestId('voxel-status')).toContainText('343 个体素')
  await runCode(page)
  await expect(page.getByTestId('voxel-status')).toContainText('343 个体素')
  await page.getByRole('button', { name: '返回入口' }).click()
  await page.getByRole('button', { name: '挑战模式', exact: true }).click()
  await page.getByRole('button', { name: /STAGE 01 立方体/ }).click()
  await runCode(page)
  await switchEditorKind(page, '图形积木')
  await expect(page.getByTestId('voxel-score')).toHaveCount(0)
  await loadBlocksExample(page)
  await runCode(page)
  await expect(page.getByTestId('voxel-score')).toContainText('100.0%')
  await switchEditorKind(page, 'Python 代码')
  await runCode(page)
  await page.getByRole('button', { name: '返回入口' }).click()
  await page.getByRole('button', { name: '自由创作', exact: true }).click()
  await page.getByRole('button', { name: '进入创作工作台 →' }).click()
  await expect(page.getByTestId('voxel-status')).toContainText('343 个体素')
  await expect(page.getByTestId('voxel-score')).toHaveCount(0)
  await expect(page.locator('.error[role=alert]')).toHaveCount(0)
  expect((await saved(page)).voxelCode).toBe(loop)
  expect((await saved(page)).voxelPassed).toEqual({ 'voxel-cube': true })
})

test('三维损坏积木存档原文保留，恢复前切换不会覆盖', async ({ page }) => {
  await seed(page, { voxelEditor: 'blocks', voxelBlocks: draft({ ...emptyVoxelBlocks, version: 99 } as unknown as BlocksDocument) })
  await expect(page.getByTestId('storage-status')).toContainText('原存档已保留')
  const raw = await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)
  await switchEditorKind(page, '图形积木')
  await expect(page.locator('.voxel_entry')).toBeVisible()
  expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBe(raw)
  await loadBlocksExample(page)
  await runCode(page)
  await expect(page.getByTestId('voxel-status')).toContainText('343 个体素')
  expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBe(raw)
})
