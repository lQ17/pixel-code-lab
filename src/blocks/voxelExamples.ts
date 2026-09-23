import type { VoxelLevelId } from '../engine/voxel'
import { parseBlocks, type BlockNode, type BlocksDocument } from './model'

// Explicit examples for the existing seven models; targets remain in the engine.
export function voxelBlocksExample(id: VoxelLevelId): BlocksDocument {
  let serial = 0
  const node = (type: string, fields?: BlockNode['fields'], children?: Record<string, BlockNode>): BlockNode => ({
    type, id: `voxel-example-${++serial}`, ...(fields ? { fields } : {}),
    ...(children ? { inputs: Object.fromEntries(Object.entries(children).map(([key, block]) => [key, { block }])) } : {}),
  })
  const coord = (axis: string) => node('voxel_coord', { AXIS: axis })
  const num = (n: number) => node('pixel_integer', { NUM: n })
  const abs = (axis: string) => node('pixel_abs', undefined, { VALUE: coord(axis) })
  const math = (op: string, a: BlockNode, b: BlockNode) => node('pixel_math', { OP: op }, { A: a, B: b })
  const cmp = (op: string, a: BlockNode, b: BlockNode) => node('pixel_compare', { OP: op }, { A: a, B: b })
  const logic = (op: string, a: BlockNode, b: BlockNode) => node('pixel_logic', { OP: op }, { A: a, B: b })
  const all = (...parts: BlockNode[]) => parts.reduce((a, b) => logic('and', a, b))
  const any = (...parts: BlockNode[]) => parts.reduce((a, b) => logic('or', a, b))
  const ret = (value: BlockNode) => node('pixel_return', undefined, { COLOR: value })
  const color = (n: number) => node('pixel_color', { COLOR: String(n) })
  const when = (condition: BlockNode, body: BlockNode) => node('pixel_if', undefined, { CONDITION: condition, THEN: body })
  const square = (axis: string) => math('*', coord(axis), coord(axis))
  const bounds = (axis: string, low: number, high: number) => all(cmp('>=', coord(axis), num(low)), cmp('<=', coord(axis), num(high)))
  let body: BlockNode
  switch (id) {
    case 'voxel-cube':
      body = when(all(...['x', 'y', 'z'].map(axis => cmp('<=', abs(axis), num(3)))), ret(color(2)))
      break
    case 'voxel-hollow-cube':
      body = when(all(
        ...['x', 'y', 'z'].map(axis => cmp('<=', abs(axis), num(4))),
        any(...['x', 'y', 'z'].map(axis => cmp('==', abs(axis), num(4)))),
      ), ret(color(6)))
      break
    case 'voxel-cylinder':
      body = when(all(cmp('<=', math('+', square('x'), square('y')), num(16)), cmp('<=', abs('z'), num(4))), ret(color(4)))
      break
    case 'voxel-sphere':
      body = when(cmp('<=', math('+', math('+', square('x'), square('y')), square('z')), num(36)), ret(color(5)))
      break
    case 'voxel-stairs':
      body = when(all(cmp('<=', abs('y'), num(2)), bounds('x', -5, 5), cmp('>=', coord('z'), num(-5)), cmp('<=', coord('z'), coord('x'))),
        ret(math('+', math('%', math('+', coord('x'), num(5)), num(6)), num(1))))
      break
    case 'voxel-pyramid':
      body = when(all(bounds('z', -5, 1), ...['x', 'y'].map(axis => cmp('<=', abs(axis), math('-', num(1), coord('z'))))), ret(color(3)))
      break
    case 'voxel-house': {
      body = when(all(bounds('z', 1, 5), cmp('<=', abs('y'), num(4)), cmp('<=', abs('x'), math('-', num(5), coord('z')))), ret(color(1)))
      const windows = when(all(cmp('==', coord('y'), num(-3)), any(
        all(cmp('<=', abs('x'), num(1)), cmp('<=', coord('z'), num(-2))),
        all(cmp('==', abs('x'), num(2)), cmp('==', coord('z'), num(-1))),
      )), ret(color(5)))
      windows.next = { block: ret(color(3)) }
      body.next = { block: when(all(cmp('<=', abs('x'), num(3)), cmp('<=', abs('y'), num(3)), bounds('z', -4, 0)), windows) }
      break
    }
  }
  const root = node('voxel_entry', undefined, { BODY: body })
  root.x = 24; root.y = 24
  return parseBlocks({ version: 2, mode: '3d', workspace: { blocks: { languageVersion: 0, blocks: [root] } } }, '3d')
}
