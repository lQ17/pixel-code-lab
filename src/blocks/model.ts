// A bounded subset of Blockly JSON. No Blockly runtime is needed to validate or compile saves.
export type EditorKind = 'python' | 'blocks'
export type BlockNode = { type: string; id: string; x?: number; y?: number; fields?: Record<string, string | number>; inputs?: Record<string, { block?: BlockNode; shadow?: BlockNode }>; next?: { block: BlockNode } }
export type BlocksDocument = { version: 1; workspace: { blocks: { languageVersion: 0; blocks: BlockNode[] } } }
export const maxBlocks = 250
export const maxBlocksBytes = 250_000

type Definition = { kind: 'root' | 'statement' | 'Number' | 'Boolean'; fields?: Record<string, readonly string[] | 'integer'>; inputs?: Record<string, 'statement' | 'Number' | 'Boolean'> }
export const definitions: Record<string, Definition> = {
  pixel_entry: { kind: 'root', inputs: { BODY: 'statement' } },
  pixel_return: { kind: 'statement', inputs: { COLOR: 'Number' } },
  pixel_if: { kind: 'statement', inputs: { CONDITION: 'Boolean', THEN: 'statement' } },
  pixel_if_else: { kind: 'statement', inputs: { CONDITION: 'Boolean', THEN: 'statement', ELSE: 'statement' } },
  pixel_coord: { kind: 'Number', fields: { AXIS: ['x', 'y'] } },
  pixel_integer: { kind: 'Number', fields: { NUM: 'integer' } },
  pixel_color: { kind: 'Number', fields: { COLOR: ['0', '1', '2', '3', '4', '5', '6', '7', '8'] } },
  pixel_math: { kind: 'Number', fields: { OP: ['+', '-', '*', '%'] }, inputs: { A: 'Number', B: 'Number' } },
  pixel_abs: { kind: 'Number', inputs: { VALUE: 'Number' } },
  pixel_compare: { kind: 'Boolean', fields: { OP: ['==', '!=', '<', '<=', '>', '>='] }, inputs: { A: 'Number', B: 'Number' } },
  pixel_logic: { kind: 'Boolean', fields: { OP: ['and', 'or'] }, inputs: { A: 'Boolean', B: 'Boolean' } },
  pixel_not: { kind: 'Boolean', inputs: { VALUE: 'Boolean' } },
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('积木数据格式无效。')
  return value as Record<string, unknown>
}
function keys(data: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(data).some(key => !allowed.includes(key))) throw new Error('积木包含不支持的字段。')
}
export function parseBlocks(value: unknown): BlocksDocument {
  if (new TextEncoder().encode(JSON.stringify(value)).length > maxBlocksBytes) throw new Error('积木数据不能超过 250 KB。')
  const doc = object(value); keys(doc, ['version', 'workspace'])
  if (doc.version !== 1) throw new Error('不支持此积木版本。')
  const workspace = object(doc.workspace); keys(workspace, ['blocks'])
  const blocks = object(workspace.blocks); keys(blocks, ['languageVersion', 'blocks'])
  if (blocks.languageVersion !== 0 || !Array.isArray(blocks.blocks)) throw new Error('积木工作区无效。')
  let count = 0, roots = 0
  const ids = new Set<string>()
  function parse(value: unknown, depth: number, expected?: string, shadow = false): BlockNode {
    if (++count > maxBlocks || depth > 40) throw new Error('积木最多 250 块，嵌套最多 40 层。')
    const raw = object(value)
    keys(raw, ['type', 'id', 'x', 'y', 'fields', 'inputs', 'next', 'deletable', 'movable', 'editable', 'collapsed', 'enabled', 'disabledReasons', 'inline'])
    if (typeof raw.type !== 'string' || !Object.hasOwn(definitions, raw.type)) throw new Error('包含不支持的积木类型。')
    const def = definitions[raw.type]
    if (expected && def.kind !== expected) throw new Error('积木连接类型不匹配。')
    if (shadow && !['pixel_integer', 'pixel_color'].includes(raw.type)) throw new Error('不支持此默认输入积木。')
    if (def.kind === 'root') { if (depth !== 0 || ++roots > 1) throw new Error('只能保留一个像素入口。') }
    if (typeof raw.id !== 'string' || !raw.id || raw.id.length > 128 || ids.has(raw.id)) throw new Error('积木标识无效或重复。')
    ids.add(raw.id)
    if (raw.enabled === false || (raw.disabledReasons !== undefined && (!Array.isArray(raw.disabledReasons) || raw.disabledReasons.length))) throw new Error('原型不支持禁用积木。')
    const node: BlockNode = { type: raw.type, id: raw.id }
    for (const pos of ['x', 'y'] as const) {
      if (raw[pos] !== undefined) {
        if (typeof raw[pos] !== 'number' || !Number.isFinite(raw[pos]) || Math.abs(raw[pos]) > 100_000) throw new Error('积木位置无效。')
        node[pos] = raw[pos]
      }
    }
    const fields = raw.fields === undefined ? {} : object(raw.fields)
    keys(fields, Object.keys(def.fields ?? {}))
    if (def.fields) {
      node.fields = {}
      for (const [key, rule] of Object.entries(def.fields)) {
        const field = fields[key]
        if (rule === 'integer') {
          if (typeof field !== 'number' || !Number.isSafeInteger(field) || Math.abs(field) > 1_000_000) throw new Error('整数范围为 -1000000～1000000。')
        } else if (typeof field !== 'string' || !rule.includes(field)) throw new Error('积木选项无效。')
        node.fields[key] = field as string | number
      }
    }
    const inputs = raw.inputs === undefined ? {} : object(raw.inputs)
    keys(inputs, Object.keys(def.inputs ?? {}))
    if (Object.keys(inputs).length) node.inputs = {}
    for (const [key, input] of Object.entries(inputs)) {
      const connection = object(input); keys(connection, ['block', 'shadow'])
      const parsed: { block?: BlockNode; shadow?: BlockNode } = {}
      if (connection.block !== undefined) parsed.block = parse(connection.block, depth + 1, def.inputs![key])
      if (connection.shadow !== undefined) parsed.shadow = parse(connection.shadow, depth + 1, def.inputs![key], true)
      node.inputs![key] = parsed
    }
    if (raw.next !== undefined) {
      if (def.kind !== 'statement') throw new Error('此积木不能连接后续语句。')
      const next = object(raw.next); keys(next, ['block'])
      node.next = { block: parse(next.block, depth + 1, 'statement') }
    }
    return node
  }
  const nodes = blocks.blocks.map(node => parse(node, 0))
  if (roots !== 1) throw new Error('缺少像素入口，原工作区已保留。')
  return { version: 1, workspace: { blocks: { languageVersion: 0, blocks: nodes } } }
}
export const emptyBlocks: BlocksDocument = { version: 1, workspace: { blocks: { languageVersion: 0, blocks: [{ type: 'pixel_entry', id: 'pixel-entry', x: 24, y: 24 }] } } }
export type Compilation = { code: string; lineBlocks: Record<number, string>; issues: { id: string; message: string }[] }
export function compileBlocks(document: BlocksDocument): Compilation {
  const nodes = document.workspace.blocks.blocks
  const issues: Compilation['issues'] = []
  const lineBlocks: Record<number, string> = {}
  const lines: string[] = []
  const emit = (line: string, block: BlockNode) => { lines.push(line); lineBlocks[lines.length] = block.id }
  const child = (block: BlockNode, name: string) => block.inputs?.[name]?.block ?? block.inputs?.[name]?.shadow
  const exprInput = (block: BlockNode, name: string): string => {
    const value = child(block, name)
    if (!value) { issues.push({ id: block.id, message: '请补齐积木的输入。' }); return '0' }
    return expression(value)
  }
  function expression(b: BlockNode): string {
    switch (b.type) {
      case 'pixel_coord': return String(b.fields!.AXIS)
      case 'pixel_integer': return String(b.fields!.NUM)
      case 'pixel_color': return String(b.fields!.COLOR)
      case 'pixel_abs': return `abs(${exprInput(b, 'VALUE')})`
      case 'pixel_not': return `(not ${exprInput(b, 'VALUE')})`
      case 'pixel_math': case 'pixel_compare': case 'pixel_logic': return `(${exprInput(b, 'A')} ${b.fields!.OP} ${exprInput(b, 'B')})`
      default: issues.push({ id: b.id, message: '此处需要表达式。' }); return '0'
    }
  }
  function statements(first: BlockNode | undefined, indent: number) {
    let b = first
    while (b) {
      const pad = '    '.repeat(indent)
      if (b.type === 'pixel_return') emit(`${pad}return ${exprInput(b, 'COLOR')}`, b)
      else if (b.type === 'pixel_if' || b.type === 'pixel_if_else') {
        emit(`${pad}if ${exprInput(b, 'CONDITION')}:`, b)
        const body = child(b, 'THEN')
        if (body) statements(body, indent + 1); else emit(`${pad}    pass`, b)
        if (b.type === 'pixel_if_else') {
          emit(`${pad}else:`, b)
          const other = child(b, 'ELSE')
          if (other) statements(other, indent + 1); else emit(`${pad}    pass`, b)
        }
      }
      b = b.next?.block
    }
  }
  const root = nodes.find(b => b.type === 'pixel_entry')!
  for (const node of nodes) if (node !== root) issues.push({ id: node.id, message: '请连接游离积木，或将不用的积木删除。' })
  emit('def pixel(x, y):', root)
  statements(child(root, 'BODY'), 1)
  emit('    return 0', root)
  return { code: issues.length ? '' : lines.join('\n') + '\n', lineBlocks, issues }
}
