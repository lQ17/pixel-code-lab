import * as Blockly from 'blockly/core'
import * as Zh from 'blockly/msg/zh-hans'
import { colorNames } from '../engine/levels'
Blockly.setLocale(Object.fromEntries(Object.entries(Zh).filter((entry): entry is [string, string] => typeof entry[1] === 'string')))
const number = (name: string) => ({ type: 'input_value', name, check: 'Number' })
const condition = (name: string) => ({ type: 'input_value', name, check: 'Boolean' })
const statement = (name: string) => ({ type: 'input_statement', name, check: 'Statement' })
const dropdown = (name: string, options: string[][]) => ({ type: 'field_dropdown', name, options })
const statementShape = { previousStatement: 'Statement', nextStatement: 'Statement', colour: 165 }
Blockly.common.defineBlocksWithJsonArray([
  { type: 'pixel_entry', message0: '决定像素颜色（x，y）', message1: '%1', args1: [statement('BODY')], colour: 195, tooltip: '系统遍历每个坐标，执行里面的规则；没有返回颜色时为空白。' },
  { type: 'pixel_return', message0: '返回颜色 %1', args0: [number('COLOR')], ...statementShape, colour: 30 },
  { type: 'pixel_if', message0: '如果 %1 %2', args0: [condition('CONDITION'), statement('THEN')], ...statementShape },
  { type: 'pixel_if_else', message0: '如果 %1 %2 否则 %3', args0: [condition('CONDITION'), statement('THEN'), statement('ELSE')], ...statementShape },
  { type: 'pixel_coord', message0: '坐标 %1', args0: [dropdown('AXIS', [['x', 'x'], ['y', 'y']])], output: 'Number', colour: 195 },
  { type: 'pixel_integer', message0: '%1', args0: [{ type: 'field_number', name: 'NUM', value: 0, min: -1000000, max: 1000000, precision: 1 }], output: 'Number', colour: 230 },
  { type: 'pixel_color', message0: '%1', args0: [dropdown('COLOR', colorNames.map((name, index) => [`${index} · ${index === 0 ? '空白' : name}`, String(index)]))], output: 'Number', colour: 30 },
  { type: 'pixel_math', message0: '%1 %2 %3', args0: [number('A'), dropdown('OP', [['＋', '+'], ['－', '-'], ['×', '*'], ['取余', '%']]), number('B')], inputsInline: true, output: 'Number', colour: 230 },
  { type: 'pixel_abs', message0: '绝对值 %1', args0: [number('VALUE')], output: 'Number', colour: 230 },
  { type: 'pixel_compare', message0: '%1 %2 %3', args0: [number('A'), dropdown('OP', [['＝', '=='], ['≠', '!='], ['＜', '<'], ['≤', '<='], ['＞', '>'], ['≥', '>=']]), number('B')], inputsInline: true, output: 'Boolean', colour: 165 },
  { type: 'pixel_logic', message0: '%1 %2 %3', args0: [condition('A'), dropdown('OP', [['并且', 'and'], ['或者', 'or']]), condition('B')], inputsInline: false, output: 'Boolean', colour: 165 },
  { type: 'pixel_not', message0: '非 %1', args0: [condition('VALUE')], output: 'Boolean', colour: 165 },
])
// Context menus can create comments, disabled blocks and mutable structures outside this prototype.
for (const type of Object.keys(Blockly.Blocks).filter(type => type.startsWith('pixel_'))) {
  const original = Blockly.Blocks[type].init
  Blockly.Blocks[type].init = function(this: Blockly.Block) {
    original.call(this)
    this.contextMenu = false
    if (type === 'pixel_entry') { this.setDeletable(false); this.isDuplicatable = () => false }
  }
}
const item = (type: string) => ({ kind: 'block', type })
export const toolbox = { kind: 'categoryToolbox', contents: [
  { kind: 'category', name: '颜色', colour: '30', contents: [item('pixel_return'), item('pixel_color')] },
  { kind: 'category', name: '坐标', colour: '195', contents: [item('pixel_coord')] },
  { kind: 'category', name: '数字', colour: '230', contents: [item('pixel_integer'), item('pixel_math'), item('pixel_abs')] },
  { kind: 'category', name: '判断', colour: '165', contents: [item('pixel_if'), item('pixel_if_else'), item('pixel_compare'), item('pixel_logic'), item('pixel_not')] },
] }
export const theme = Blockly.Theme.defineTheme('pixel-terminal', {
  name: 'pixel-terminal', base: Blockly.Themes.Classic,
  componentStyles: { workspaceBackgroundColour: '#0c1620', toolboxBackgroundColour: '#142433', toolboxForegroundColour: '#c5d9e5', flyoutBackgroundColour: '#1b3040', flyoutForegroundColour: '#dce9f4', flyoutOpacity: 1, scrollbarColour: '#5b899c', insertionMarkerColour: '#ffffff', insertionMarkerOpacity: .5 },
  fontStyle: { family: 'Microsoft YaHei, sans-serif', size: 12 },
})
export { Blockly }
