import { test, expect, type Page } from '@playwright/test'
import { compileBlocks, emptyBlocks, parseBlocks, type BlockNode, type BlocksDocument } from '../src/blocks/model'
import { blocksExample } from '../src/blocks/examples'
import { parseProgress, STORAGE_KEY } from '../src/hooks/useProgress'
import { levels, starterCode } from '../src/engine/levels'
import { openMenu, runCode, switchEditorKind, switchChallengeLevel, toggleBlocksCode, expectRunDisabled } from './helpers'

// Answers are test fixtures only; the application never loads these into challenges.
function challengeDocument(id: string): BlocksDocument {
  let serial = 0
  const node = (type: string, fields?: BlockNode['fields'], children?: Record<string, BlockNode>): BlockNode => ({
    type, id: `test-${++serial}`, ...(fields ? { fields } : {}),
    ...(children ? { inputs: Object.fromEntries(Object.entries(children).map(([key, block]) => [key, { block }])) } : {}),
  })
  const coord = (axis: string) => node('pixel_coord', { AXIS: axis })
  const num = (n: number) => node('pixel_integer', { NUM: n })
  const abs = (axis: string) => node('pixel_abs', undefined, { VALUE: coord(axis) })
  const math = (op: string, a: BlockNode, b: BlockNode) => node('pixel_math', { OP: op }, { A: a, B: b })
  const cmp = (op: string, a: BlockNode, b: BlockNode) => node('pixel_compare', { OP: op }, { A: a, B: b })
  const ret = (n: number) => node('pixel_return', undefined, { COLOR: node('pixel_color', { COLOR: String(n) }) })
  const condition = id === 'square'
    ? node('pixel_logic', { OP: 'and' }, { A: cmp('<=', abs('x'), num(2)), B: cmp('<=', abs('y'), num(2)) })
    : id === 'checkerboard'
      ? cmp('==', math('%', math('+', coord('x'), coord('y')), num(2)), num(0))
      : cmp('<=', math('+', math('*', coord('x'), coord('x')), math('*', coord('y'), coord('y'))), num(64))
  const body = node(id === 'checkerboard' ? 'pixel_if_else' : 'pixel_if', undefined, {
    CONDITION: condition, THEN: ret(id === 'circle' ? 5 : 1), ...(id === 'checkerboard' ? { ELSE: ret(5) } : {}),
  })
  const root = node('pixel_entry', undefined, { BODY: body })
  root.x = 24; root.y = 24
  return parseBlocks({ version: 1, workspace: { blocks: { languageVersion: 0, blocks: [root] } } })
}
const base = {
  schemaVersion: 1, introSeen: true, levelId: 'square', codes: { square: starterCode }, passed: {},
  pixelEditor: 'blocks', pixelCode: 'def pixel(x, y):\n    return 7\n',
  pixelBlocks: { document: blocksExample('pixel-tree'), name: '独立创作', referenceId: 'pixel-tree', projectId: null },
}
async function seed(page: Page, patch: Record<string, unknown> = {}, id = 'square') {
  await page.addInitScript(({ value, key }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value))
  }, { value: { ...base, ...patch }, key: STORAGE_KEY })
  await page.goto(`/#/work/2d/challenge/${id}`)
  await expect(page.locator('.editor-zone')).toBeVisible()
}
async function saved(page: Page) {
  await expect(page.getByTestId('storage-status')).toHaveAttribute('data-save-state', 'saved')
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY)
}

test('挑战积木存档兼容旧数据，逐关恢复，非法新字段拒绝', () => {
  const legacy = parseProgress(JSON.stringify(base))
  expect(legacy.codes).toEqual(base.codes)
  expect(legacy.pixelBlocks).toEqual(base.pixelBlocks)
  expect(legacy.pixelChallengeBlocks).toEqual({})
  expect(legacy.pixelChallengeEditors).toEqual({})
  const value = { ...base, codes: { square: '' }, passed: { circle: true }, pixelChallengeEditors: { square: 'blocks' }, pixelChallengeBlocks: { square: challengeDocument('square'), checkerboard: emptyBlocks } }
  const parsed = parseProgress(JSON.stringify(value))
  expect(parsed.codes.square).toBe('')
  expect(parsed.passed.circle).toBe(true)
  expect(parseProgress(JSON.stringify(parsed))).toEqual(parsed)
  for (const patch of [
    { pixelChallengeEditors: [] }, { pixelChallengeEditors: { square: 'javascript' } },
    { pixelChallengeEditors: { unknown: 'javascript' } }, { pixelChallengeBlocks: [] },
    { pixelChallengeBlocks: { square: { version: 99 } } }, { pixelChallengeBlocks: { unknown: { version: 99 } } },
  ]) expect(() => parseProgress(JSON.stringify({ ...base, ...patch }))).toThrow()
  const unavailable = parseProgress(JSON.stringify({ ...base, codes: { 'unavailable-level': 'def pixel(x, y):\n    return 0' }, passed: { 'unavailable-level': true }, pixelChallengeEditors: { 'unavailable-level': 'blocks' }, pixelChallengeBlocks: { 'unavailable-level': emptyBlocks } }))
  expect(unavailable.codes['unavailable-level']).toContain('def pixel')
  expect(unavailable.passed['unavailable-level']).toBe(true)
})

for (const level of levels) {
  test(`${level.title}积木真实执行通关，共用历史记录，Python 与积木结果独立`, async ({ page }) => {
    const doc = challengeDocument(level.id)
    await seed(page, { codes: { [level.id]: starterCode }, pixelChallengeEditors: { [level.id]: 'blocks' }, pixelChallengeBlocks: { [level.id]: doc } }, level.id)
    await expect(page.locator('.blocklySvg').first()).toBeVisible()
    await openMenu(page, '编辑')
    await expect(page.getByRole('menuitem', { name: '载入示例' })).toHaveCount(0)
    await expect(page.getByRole('menuitem', { name: '复制为 Python 作品' })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await runCode(page)
    await expect(page.getByTestId('score')).toContainText('100.0%')
    await expect(page).toHaveURL(new RegExp(`/challenge/${level.id}$`))
    expect((await saved(page)).passed[level.id]).toBe(true)
    expect(Object.keys((await saved(page)).passed)).toEqual([level.id])

    await switchEditorKind(page, 'Python 代码')
    await expect(page.locator('.view-lines')).toContainText('return 0')
    await expect(page.getByTestId('score')).toHaveCount(0)
    await runCode(page)
    await expect(page.getByTestId('score')).toContainText('尚未匹配')
    await switchEditorKind(page, '图形积木')
    await expect(page.getByTestId('score')).toContainText('100.0%')
    await toggleBlocksCode(page)
    await expect(page.getByLabel('积木生成的 Python', { exact: true })).toHaveText(compileBlocks(doc).code)
    await page.getByTitle('关闭代码对照').click()
    await page.reload()
    await expect(page.locator('.blocklySvg').first()).toBeVisible()
    await expect(page.getByTestId('score')).toHaveCount(0)
    expect((await saved(page)).passed[level.id]).toBe(true)
    expect((await saved(page)).codes[level.id]).toBe(starterCode)
    expect((await saved(page)).pixelBlocks).toEqual(base.pixelBlocks)
    await page.getByRole('button', { name: '返回入口' }).click()
    await expect(page.locator('.start-card.passed')).toHaveCount(1)
  })
}

test('旧存档挑战默认 Python，真实拖拽积木，分关草稿与创作隔离、恢复和刷新', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await seed(page)
  await expect(page.locator('.view-lines')).toContainText('return 0')
  await switchEditorKind(page, '图形积木')
  await expect(page.locator('.blocklySvg').first()).toBeVisible()
  await expect(page.locator('.blocklyWorkspace .pixel_if')).toHaveCount(0)
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
  await runCode(page)
  await expect(page.getByTestId('score')).toContainText('尚未匹配')
  const squareDoc = (await saved(page)).pixelChallengeBlocks.square
  await page.screenshot({ path: 'test-results/challenge-blocks-1440.png' })

  await switchChallengeLevel(page, '双色棋盘')
  await expect(page.locator('.view-lines')).toBeVisible()
  await switchEditorKind(page, '图形积木')
  await expect(page.locator('.blocklyWorkspace .pixel_return')).toHaveCount(0)
  await switchChallengeLevel(page, '实心正方形')
  await expect(page.locator('.blocklyWorkspace .pixel_return')).toBeVisible()
  await expect(page.getByTestId('score')).toContainText('尚未匹配')
  await page.reload()
  await expect(page.locator('.blocklyWorkspace .pixel_return')).toBeVisible()
  await page.setViewportSize({ width: 1180, height: 768 })
  await page.screenshot({ path: 'test-results/challenge-blocks-1180.png' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

  await openMenu(page, '编辑')
  page.once('dialog', d => d.dismiss())
  await page.getByRole('menuitem', { name: '恢复初始积木…' }).click()
  expect((await saved(page)).pixelChallengeBlocks.square).toEqual(squareDoc)
  await openMenu(page, '编辑')
  page.once('dialog', d => d.accept())
  await page.getByRole('menuitem', { name: '恢复初始积木…' }).click()
  await expect(page.locator('.blocklyWorkspace .pixel_return')).toHaveCount(0)
  expect(compileBlocks((await saved(page)).pixelChallengeBlocks.square).code).toBe(starterCode)
  expect((await saved(page)).codes).toEqual(base.codes)
  await page.getByRole('button', { name: '返回入口' }).click()
  await page.getByRole('button', { name: '自由创作', exact: true }).click()
  await page.getByRole('button', { name: '进入创作工作台 →' }).click()
  await expect(page.locator('.blocklyWorkspace .pixel_if').first()).toBeVisible()
  expect((await saved(page)).pixelBlocks).toEqual(base.pixelBlocks)
})

test('挑战积木运行异常保留历史结果，并高亮真实出错语句', async ({ page }) => {
  const doc: BlocksDocument = { version: 1, workspace: { blocks: { languageVersion: 0, blocks: [{ type: 'pixel_entry', id: 'root', inputs: { BODY: { block: {
    type: 'pixel_return', id: 'error-return', inputs: { COLOR: { block: { type: 'pixel_math', id: 'mod', fields: { OP: '%' }, inputs: {
      A: { block: { type: 'pixel_integer', id: 'a', fields: { NUM: 1 } } }, B: { block: { type: 'pixel_integer', id: 'b', fields: { NUM: 2 } } },
    } } } },
  } } } }] } } }
  await seed(page, { pixelChallengeEditors: { square: 'blocks' }, pixelChallengeBlocks: { square: doc } })
  await runCode(page)
  const score = (await page.getByTestId('score').textContent())!
  await page.locator('[data-id="b"] .blocklyText').last().click()
  await page.locator('.blocklyHtmlInput').fill('0')
  await page.locator('.blocklyHtmlInput').press('Enter')
  await runCode(page)
  await expect(page.locator('.error[role=alert]')).toContainText('ZeroDivisionError · 第 2 行')
  await expect(page.locator('[data-id="error-return"]')).toHaveClass(/blocklyHighlighted/)
  await expect(page.getByTestId('score')).toHaveText(score)
  await expect(page.locator('.historical-banner')).toBeVisible()
  await page.getByTitle('关闭输出面板').click()
  await page.locator('[data-id="b"] .blocklyText').last().click()
  await page.locator('.blocklyHtmlInput').fill('2')
  await page.locator('.blocklyHtmlInput').press('Enter')
  await expect(page.locator('[data-id="error-return"]')).not.toHaveClass(/blocklyHighlighted/)
})

test('挑战切换编辑方式及关卡取消旧运行，成功作品与草稿保留', async ({ page }) => {
  const loop = 'def pixel(x, y):\n    while True:\n        pass\n'
  await seed(page, { codes: { square: loop }, pixelChallengeEditors: { square: 'blocks' }, pixelChallengeBlocks: { square: challengeDocument('square') } })
  await runCode(page)
  await expect(page.getByTestId('score')).toContainText('100.0%')
  await switchEditorKind(page, 'Python 代码')
  await runCode(page)
  await switchEditorKind(page, '图形积木')
  await expect(page.getByTestId('score')).toContainText('100.0%')
  await runCode(page)
  await expect(page.getByTestId('score')).toContainText('100.0%')
  await switchEditorKind(page, 'Python 代码')
  await runCode(page)
  await switchChallengeLevel(page, '双色棋盘')
  await runCode(page)
  await expect(page.getByTestId('score')).toContainText('尚未匹配')
  await expect(page.locator('.error[role=alert]')).toHaveCount(0)
  expect((await saved(page)).codes.square).toBe(loop)
  expect((await saved(page)).passed).toEqual({ square: true })
})

test('损坏挑战积木不覆盖旧存档；配额失败后可恢复保存当前草稿', async ({ page }) => {
  await seed(page, { pixelChallengeBlocks: { square: { version: 99 } } })
  const raw = await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)
  await expect(page.getByTestId('storage-status')).toContainText('原存档已保留')
  await switchEditorKind(page, '图形积木')
  expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBe(raw)
  await page.evaluate(key => localStorage.removeItem(key), STORAGE_KEY)
  // Replace the seed for a fresh independent context without discarding any real user's data.
  await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: STORAGE_KEY, value: base })
  await page.reload()
  await page.evaluate(() => {
    const original = Storage.prototype.setItem
    Object.assign(window, { restoreStorage: () => { Storage.prototype.setItem = original } })
    Storage.prototype.setItem = function(key, value) { if (key === 'pixel-code-lab.progress') throw new DOMException('quota', 'QuotaExceededError'); original.call(this, key, value) }
  })
  await switchEditorKind(page, '图形积木')
  await expect(page.getByTestId('storage-status')).toContainText('保存失败')
  await page.evaluate(() => (window as unknown as { restoreStorage: () => void }).restoreStorage())
  await page.getByRole('button', { name: '重试保存' }).click()
  expect((await saved(page)).pixelChallengeEditors.square).toBe('blocks')
  expect((await saved(page)).pixelBlocks).toEqual(base.pixelBlocks)
})
