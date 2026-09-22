import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { loadPyodide } from 'pyodide'
import { compileBlocks, emptyBlocks, parseBlocks, type BlockNode, type BlocksDocument } from '../src/blocks/model'
import { blocksExample } from '../src/blocks/examples'
import { pixelReference, pixelReferenceIds } from '../src/engine/pixelCreation'
import { exportProject, importProject, type Project } from '../src/engine/projects'
import { parseProgress, STORAGE_KEY } from '../src/hooks/useProgress'
import {
  runCode,
  loadExample,
  openProjectLibrary,
  switchEditorKind,
  toggleBlocksCode,
  fitBlocks,
  copyToPythonProject,
  clickExportPng,
  expectExportPngDisabled,
  expectRunDisabled,
} from './helpers'

const base = { schemaVersion: 1, codes: { square: 'challenge unchanged' }, passed: { circle: true }, levelId: 'square', introSeen: true, mode: '2d', pixelActivity: 'create', pixelCode: 'def pixel(x, y):\n    return 5\n', pixelEditor: 'blocks', voxelCode: '3d unchanged' }
const makeDraft = (document: BlocksDocument) => ({ document, name: '积木作品', referenceId: 'pixel-cross', projectId: null })
const savedBlock: Project = { id: 'blocks-saved', name: '已有积木', code: compileBlocks(blocksExample('pixel-cross')).code, referenceId: 'pixel-cross', editor: 'blocks', blocks: blocksExample('pixel-cross'), createdAt: '2026-09-22T00:00:00.000Z', updatedAt: '2026-09-22T00:00:00.000Z' }

async function seed(page: Page, patch: Record<string, unknown> = {}) {
  await page.addInitScript(({ value, key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value)) }, { value: { ...base, ...patch }, key: STORAGE_KEY })
  await page.goto('/#/work/2d/create')
  await expect(page.locator('.editor-zone')).toBeVisible()
}
async function state(page: Page) {
  await expect(page.getByTestId('storage-status')).toHaveAttribute('data-save-state', 'saved')
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY)
}
const library = (page: Page) => page.getByRole('dialog', { name: '本地作品库' })
const documentOf = (body: BlockNode): BlocksDocument => ({ version: 1, workspace: { blocks: { languageVersion: 0, blocks: [{ type: 'pixel_entry', id: 'root', inputs: { BODY: { block: body } } }] } } })

test('积木结构白名单、连接类型、版本、限额与不完整输入校验', () => {
  expect(parseBlocks(emptyBlocks)).toEqual(emptyBlocks)
  expect(compileBlocks(emptyBlocks).code).toBe('def pixel(x, y):\n    return 0\n')
  const missing = documentOf({ type: 'pixel_return', id: 'return' })
  expect(compileBlocks(parseBlocks(missing)).issues[0].id).toBe('return')
  expect(compileBlocks(parseBlocks(missing)).code).toBe('')
  const detached = structuredClone(emptyBlocks)
  detached.workspace.blocks.blocks.push({ type: 'pixel_integer', id: 'unused', fields: { NUM: 7 } })
  expect(compileBlocks(parseBlocks(detached)).issues[0].message).toContain('游离')
  const wrong = documentOf({ type: 'pixel_return', id: 'r', inputs: { COLOR: { block: { type: 'pixel_not', id: 'bool' } } } })
  expect(() => parseBlocks(wrong)).toThrow('类型')
  for (const type of ['__proto__', 'text', 'procedures_defreturn', 'pixel_entry']) expect(() => parseBlocks(documentOf({ type, id: 'bad' }))).toThrow()
  expect(() => parseBlocks({ ...emptyBlocks, version: 2 })).toThrow('版本')
  expect(() => parseBlocks({ ...emptyBlocks, workspace: { ...emptyBlocks.workspace, variables: [] } })).toThrow()
  expect(() => parseBlocks(documentOf({ type: 'pixel_return', id: 'r', inputs: { COLOR: { block: { type: 'pixel_integer', id: 'i', fields: { NUM: 1.5 } } } } }))).toThrow('整数')
  const lots = structuredClone(emptyBlocks)
  for (let i = 0; i < 250; i++) lots.workspace.blocks.blocks.push({ type: 'pixel_integer', id: 'n' + i, fields: { NUM: i } })
  expect(() => parseBlocks(lots)).toThrow('250')
})

test('积木生成 Python 经真实执行器验证，负数取余、优先级与错误行号', async () => {
  const python = await loadPyodide({ indexURL: resolve('node_modules/pyodide') })
  const execute = readFileSync(resolve('src/runners/execute.py'), 'utf8')
  const run = async (source: string) => {
    python.globals.set('_source', source); python.globals.set('_radius', 10); python.globals.set('_mode', '2d')
    return JSON.parse(await python.runPythonAsync(execute))
  }
  for (const id of pixelReferenceIds) {
    const result = await run(compileBlocks(parseBlocks(blocksExample(id))).code)
    expect(result.error).toBeUndefined(); expect(result.colors).toEqual(pixelReference(id))
  }
  const n = (id: string, value: number): BlockNode => ({ type: 'pixel_integer', id, fields: { NUM: value } })
  const math = (id: string, op: string, a: BlockNode, b: BlockNode): BlockNode => ({ type: 'pixel_math', id, fields: { OP: op }, inputs: { A: { block: a }, B: { block: b } } })
  const compiled = compileBlocks(parseBlocks(documentOf({ type: 'pixel_return', id: 'ret', inputs: { COLOR: { block: math('times', '*', math('sum', '+', n('one', 1), n('two', 2)), math('mod', '%', n('negative', -5), n('three', 3))) } } })))
  expect((await run(compiled.code)).colors).toEqual(Array(441).fill(3))
  const bad = compileBlocks(parseBlocks(documentOf({ type: 'pixel_return', id: 'bad-return', inputs: { COLOR: { block: math('zero', '%', n('a', 1), n('b', 0)) } } })))
  const failed = await run(bad.code)
  expect(failed.error.kind).toBe('ZeroDivisionError')
  expect(bad.lineBlocks[failed.error.line]).toBe('bad-return')
})

test('积木文件重新生成代码，旧 Python 兼容，损坏新存档拒绝', () => {
  const file = JSON.parse(exportProject(savedBlock, '2d'))
  expect(file.version).toBe(2)
  expect(importProject(JSON.stringify(file), 'new', '2d')).toEqual({ ...savedBlock, id: 'new' })
  const forged = { ...file, project: { ...file.project, code: 'raise Exception("not executed")', preview: '1'.repeat(441) } }
  const imported = importProject(JSON.stringify(forged), 'new', '2d')
  expect(imported.code).toBe(savedBlock.code); expect(imported.preview).toBeUndefined()
  expect(() => importProject(JSON.stringify({ ...file, version: 1 }), 'new', '2d')).toThrow()
  const legacy = { ...savedBlock, editor: undefined, blocks: undefined }
  expect(JSON.parse(exportProject(legacy, '2d')).version).toBe(1)
  const parsed = parseProgress(JSON.stringify({ ...base, pixelProjects: [savedBlock], pixelBlocks: { ...makeDraft(savedBlock.blocks!), projectId: savedBlock.id } }))
  expect(parseProgress(JSON.stringify(parsed))).toEqual(parsed)
  expect(() => parseProgress(JSON.stringify({ ...base, pixelBlocks: { ...makeDraft(emptyBlocks), document: { version: 99 } } }))).toThrow()
  expect(() => parseProgress(JSON.stringify({ ...base, pixelProjects: [savedBlock], pixelProjectId: savedBlock.id }))).toThrow()
})

test('积木示例运行、存档刷新、Python 草稿隔离、作品预览与文件往返', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
  await page.setViewportSize({ width: 1440, height: 900 })
  await seed(page)
  await expect(page.locator('.blocklySvg').first()).toBeVisible()
  page.once('dialog', d => d.accept())
  await loadExample(page)
  await expect(page.locator('.blocks-warning')).toHaveCount(0)
  await toggleBlocksCode(page)
  await expect(page.getByLabel('积木生成的 Python', { exact: true })).toContainText('abs(x)')
  await runCode(page)
  await clickExportPng(page)
  await fitBlocks(page)
  await page.screenshot({ path: 'test-results/blocks-1440.png' })
  await openProjectLibrary(page)
  await page.getByLabel('当前作品名称').fill('十字积木')
  await library(page).getByRole('button', { name: '保存作品', exact: true }).click()
  let saved = await state(page)
  expect(saved.pixelProjects[0].editor).toBe('blocks')
  expect(saved.pixelProjects[0].preview).toBe(pixelReference('pixel-cross').join(''))
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出当前作品', exact: true }).click()
  const file = await readFile((await (await pending).path())!)
  expect(JSON.parse(file.toString()).version).toBe(2)
  await page.locator('input[type=file]').setInputFiles({ name: 'blocks.json', mimeType: 'application/json', buffer: file })
  await expect(library(page)).toContainText('作品已导入列表')
  expect((await state(page)).pixelProjects).toHaveLength(2)
  await page.getByRole('button', { name: '关闭作品库' }).click()
  await copyToPythonProject(page)
  saved = await state(page)
  expect(saved.pixelProjects).toHaveLength(3)
  expect(saved.pixelProjects[2].editor).toBeUndefined()
  expect(saved.pixelProjects[2].code).toBe(saved.pixelProjects[0].code)
  expect(saved.pixelCode).toBe(base.pixelCode)
  await switchEditorKind(page, 'Python 代码')
  await expect(page.locator('.view-lines')).toContainText('return 5')
  await switchEditorKind(page, '图形积木')
  await page.reload()
  await expect(page.locator('.blocklySvg').first()).toBeVisible()
  await expect(page.locator('.blocks-warning')).toHaveCount(0)
  expect((await state(page)).pixelBlocks.document).toEqual(saved.pixelBlocks.document)
  await page.setViewportSize({ width: 1180, height: 768 })
  await fitBlocks(page)
  await page.screenshot({ path: 'test-results/blocks-1180.png' })
  expect(errors).toEqual([])
})

test('切换作品同时保护积木和手写草稿，取消与失败不替换', async ({ page }) => {
  await seed(page, { pixelEditor: 'python', pixelProjects: [savedBlock], pixelBlocks: makeDraft(blocksExample('pixel-tree')) })
  await openProjectLibrary(page)
  page.once('dialog', d => d.dismiss())
  await page.getByRole('button', { name: '打开 已有积木', exact: true }).click()
  expect((await state(page)).pixelEditor).toBe('python')
  page.once('dialog', d => d.accept())
  await page.getByRole('button', { name: '打开 已有积木', exact: true }).click()
  const saved = await state(page)
  expect(saved.pixelProjects).toHaveLength(3)
  expect(saved.pixelProjects.some((p: Project) => p.editor !== 'blocks' && p.code === base.pixelCode)).toBe(true)
  expect(saved.pixelProjects.some((p: Project) => p.editor === 'blocks' && p.code === compileBlocks(blocksExample('pixel-tree')).code)).toBe(true)
  expect(saved.pixelCode).toBe(base.pixelCode)
  expect(saved.pixelBlocks.projectId).toBe(savedBlock.id)
  await page.getByRole('button', { name: '关闭作品库' }).click()
  await expect(page.locator('.blocklySvg').first()).toBeVisible()
  await expectExportPngDisabled(page)
})

test('真实拖拽连接、颜色下拉、删除输入、撤销与刷新恢复', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await seed(page)
  const category = page.locator('.blocklyToolboxCategory').filter({ hasText: '颜色' })
  await category.click()
  const geometry = await page.locator('.pixel_entry>path.blocklyPath').evaluate(el => {
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
  await category.click()
  const ret = (await page.locator('.blocklyWorkspace .pixel_return>path.blocklyPath').last().boundingBox())!
  await drag('.blocklyFlyout .pixel_color', ret.x + ret.width - 8 * geometry.scale, ret.y)
  await expect(page.locator('.blocks-warning')).toHaveCount(0)
  const field = page.locator('.blocklyWorkspace .pixel_color .blocklyDropdownText').last()
  await field.click()
  await page.getByRole('option', { name: /7.*白/ }).click()
  await runCode(page)
  await clickExportPng(page)
  await openProjectLibrary(page)
  await page.getByLabel('当前作品名称').fill('拖拽白色')
  await library(page).getByRole('button', { name: '保存作品', exact: true }).click()
  expect((await state(page)).pixelProjects[0].preview).toBe('7'.repeat(441))
  await page.getByRole('button', { name: '关闭作品库' }).click()
  await page.reload()
  await expect(page.locator('.blocklyWorkspace .pixel_color').last()).toBeVisible()
  await expect(page.locator('.blocks-warning')).toHaveCount(0)
  const colorPath = page.locator('.blocklyWorkspace .pixel_color>path.blocklyPath').last()
  const bounds = (await colorPath.boundingBox())!
  await page.mouse.click(bounds.x + 2, bounds.y + bounds.height / 2)
  await page.keyboard.press('Delete')
  await expect(page.locator('.blocks-warning')).toContainText('补齐')
  await page.keyboard.press('ControlOrMeta+z')
  await expect(page.locator('.blocks-warning')).toHaveCount(0)
  await page.screenshot({ path: 'test-results/blocks-drag.png' })
})

test('积木运行错误保留历史且定位生成代码，配额失败不切换草稿', async ({ page }) => {
  const bad = documentOf({ type: 'pixel_return', id: 'error-return', inputs: { COLOR: { block: { type: 'pixel_math', id: 'mod', fields: { OP: '%' }, inputs: { A: { block: { type: 'pixel_integer', id: 'a', fields: { NUM: 1 } } }, B: { block: { type: 'pixel_integer', id: 'b', fields: { NUM: 2 } } } } } } } })
  await seed(page, { pixelBlocks: makeDraft(bad) })
  await expect(page.locator('.blocklySvg').first()).toBeVisible()
  await runCode(page)
  await clickExportPng(page)
  await page.locator('[data-id="b"] .blocklyText').last().click()
  await page.locator('.blocklyHtmlInput').fill('0')
  await page.locator('.blocklyHtmlInput').press('Enter')
  await runCode(page)
  await expect(page.locator('.error[role=alert]')).toContainText('ZeroDivisionError')
  await expect(page.locator('.error[role=alert]')).toContainText('第 2 行')
  await expectExportPngDisabled(page)
  const before = await state(page)
  await page.evaluate(() => {
    const original = Storage.prototype.setItem
    Object.assign(window, { restoreStorage: () => { Storage.prototype.setItem = original } })
    Storage.prototype.setItem = function(key, value) { if (key === 'pixel-code-lab.progress') throw new DOMException('quota', 'QuotaExceededError'); original.call(this, key, value) }
  })
  await openProjectLibrary(page)
  page.once('dialog', d => d.accept())
  await page.getByRole('button', { name: '新建草稿', exact: true }).click()
  await expect(library(page).getByRole('alert')).toContainText('作品未保存')
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY)).toEqual(before)
  await page.evaluate(() => (window as unknown as { restoreStorage: () => void }).restoreStorage())
  await library(page).getByRole('button', { name: '保存作品', exact: true }).click()
  const saved = await state(page)
  expect(saved.pixelProjects[0].blocks).toEqual(before.pixelBlocks.document)
  expect(saved.pixelProjects[0].preview).toBeUndefined()
})

test('切换编辑方式取消旧运行并保留独立草稿和成功作品', async ({ page }) => {
  const looping = 'def pixel(x, y):\n    while True:\n        pass\n'
  await seed(page, { pixelCode: looping, pixelBlocks: makeDraft(blocksExample('pixel-cross')) })
  await runCode(page)
  await clickExportPng(page)
  await switchEditorKind(page, 'Python 代码')
  await expectExportPngDisabled(page)
  await runCode(page)
  await switchEditorKind(page, '图形积木')
  await clickExportPng(page)
  await expect(page.locator('.error[role=alert]')).toHaveCount(0)
  expect((await state(page)).pixelCode).toBe(looping)
  expect(compileBlocks((await state(page)).pixelBlocks.document).code).toBe(compileBlocks(blocksExample('pixel-cross')).code)
})

