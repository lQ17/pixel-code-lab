import type { PixelReferenceId } from '../engine/pixelCreation'
import { parseBlocks, type BlockNode, type BlocksDocument } from './model'
export function blocksExample(id: PixelReferenceId): BlocksDocument {
  let serial = 0
  const node = (type: string, fields?: BlockNode['fields'], children?: Record<string, BlockNode>): BlockNode => ({ type, id: `example-${++serial}`, ...(fields ? { fields } : {}), ...(children ? { inputs: Object.fromEntries(Object.entries(children).map(([key, block]) => [key, { block }])) } : {}) })
  const coord = (axis: string) => node('pixel_coord', { AXIS: axis })
  const num = (n: number) => node('pixel_integer', { NUM: n })
  const abs = (axis: string) => node('pixel_abs', undefined, { VALUE: coord(axis) })
  const math = (op: string, a: BlockNode, b: BlockNode) => node('pixel_math', { OP: op }, { A: a, B: b })
  const cmp = (op: string, a: BlockNode, b: BlockNode) => node('pixel_compare', { OP: op }, { A: a, B: b })
  const and = (a: BlockNode, b: BlockNode) => node('pixel_logic', { OP: 'and' }, { A: a, B: b })
  const ret = (value: BlockNode) => node('pixel_return', undefined, { COLOR: value })
  const color = (n: number) => node('pixel_color', { COLOR: String(n) })
  const when = (condition: BlockNode, body: BlockNode) => node('pixel_if', undefined, { CONDITION: condition, THEN: body })
  let body: BlockNode
  if (id === 'pixel-cross') {
    body = when(and(cmp('<=', abs('x'), num(1)), cmp('<=', abs('y'), num(7))), ret(color(3)))
    body.next = { block: when(and(cmp('<=', abs('y'), num(1)), cmp('<=', abs('x'), num(7))), ret(color(5))) }
  } else if (id === 'pixel-diamond') {
    const distance = () => math('+', abs('x'), abs('y'))
    body = when(cmp('<=', distance(), num(8)), ret(math('+', math('%', distance(), num(6)), num(1))))
  } else {
    body = when(and(and(cmp('>=', coord('y'), num(-1)), cmp('<=', coord('y'), num(7))), cmp('<=', math('*', num(2), abs('x')), math('-', num(7), coord('y')))), ret(color(4)))
    body.next = { block: when(and(cmp('<=', abs('x'), num(1)), and(cmp('>=', coord('y'), num(-6)), cmp('<', coord('y'), num(-1)))), ret(color(2))) }
  }
  const root = node('pixel_entry', undefined, { BODY: body }); root.x = 24; root.y = 24
  return parseBlocks({ version: 1, workspace: { blocks: { languageVersion: 0, blocks: [root] } } })
}
