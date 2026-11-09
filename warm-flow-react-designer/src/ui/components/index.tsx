import { createNeutralComponent } from './createNeutralComponent'

/**
 * 中性组件语义名清单（对应 `el-*` / Fusion 组件后缀）。
 *
 * 导出为具名 React 组件 `WfButton` / `WfInput` ...，设计器内部一律使用这些中性组件，
 * 底层由当前 UI 适配器（如 nextAdapter）的 components 映射决定渲染目标。
 *
 * 与 Vue 版的差异：
 * - Vue 版通过 `registerWfComponents(app)` 把 `wf-*` 注册为**全局组件**（模板里写 `<wf-button>`）。
 * - React 无全局组件注册，改为导出**具名组件**（`<WfButton>`），由设计器组件按需 import。
 *   语义名清单与 Vue 版**逐一对齐**，保证适配器的 components 映射键跨框架一致。
 *
 * @author warm
 */
const NEUTRAL_KEYS = [
  'button', 'input', 'input-number', 'select', 'option', 'form', 'form-item',
  'table', 'table-column', 'col', 'row', 'header', 'checkbox', 'checkbox-group',
  'tree-select', 'tree', 'tag', 'radio', 'radio-group', 'dialog', 'drawer',
  'date-picker', 'time-picker', 'switch', 'pagination', 'divider', 'tooltip', 'icon',
] as const

function toPascalCase(kebab: string): string {
  return kebab
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('')
}

/**
 * 语义名 -> 中性 React 组件 映射（键为 `Wf<PascalCase>`，如 WfButton / WfInputNumber）。
 */
export const wfComponents: Record<string, React.ComponentType<any>> = NEUTRAL_KEYS.reduce(
  (acc, key) => {
    const name = `Wf${toPascalCase(key)}`
    acc[name] = createNeutralComponent(name, key)
    return acc
  },
  {} as Record<string, React.ComponentType<any>>
)

// —— 具名导出常用中性组件（设计器组件直接 import 使用）——
export const WfButton = wfComponents.WfButton
export const WfInput = wfComponents.WfInput
export const WfInputNumber = wfComponents.WfInputNumber
export const WfSelect = wfComponents.WfSelect
export const WfOption = wfComponents.WfOption
export const WfForm = wfComponents.WfForm
export const WfFormItem = wfComponents.WfFormItem
export const WfTable = wfComponents.WfTable
export const WfTableColumn = wfComponents.WfTableColumn
export const WfCol = wfComponents.WfCol
export const WfRow = wfComponents.WfRow
export const WfHeader = wfComponents.WfHeader
export const WfCheckbox = wfComponents.WfCheckbox
export const WfCheckboxGroup = wfComponents.WfCheckboxGroup
export const WfTreeSelect = wfComponents.WfTreeSelect
export const WfTree = wfComponents.WfTree
export const WfTag = wfComponents.WfTag
export const WfRadio = wfComponents.WfRadio
export const WfRadioGroup = wfComponents.WfRadioGroup
export const WfDialog = wfComponents.WfDialog
export const WfDrawer = wfComponents.WfDrawer
export const WfDatePicker = wfComponents.WfDatePicker
export const WfTimePicker = wfComponents.WfTimePicker
export const WfSwitch = wfComponents.WfSwitch
export const WfPagination = wfComponents.WfPagination
export const WfDivider = wfComponents.WfDivider
export const WfTooltip = wfComponents.WfTooltip
export const WfIcon = wfComponents.WfIcon
