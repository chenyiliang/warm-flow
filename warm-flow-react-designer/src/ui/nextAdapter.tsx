import { createElement, Children, isValidElement } from 'react'
import { createRoot } from 'react-dom/client'
import { Message, Notification, Dialog, Loading } from '@alifd/next'
import {
  Button, Input, NumberPicker, Select, Form, Table, Grid, Checkbox,
  TreeSelect, Tree, Tag, Radio, DatePicker, TimePicker, Switch,
  Pagination, Divider, Balloon, Icon, Card, Search, Drawer,
} from '@alifd/next'
import type { UiAdapter, UiFeedbackType, UiFeedbackOptions, UiLoadingHandle } from './uiAdapter'

const DEFAULT_TITLE = '系统提示'

function toOptions(content: string | UiFeedbackOptions): UiFeedbackOptions {
  return typeof content === 'string' ? { message: content } : { ...content }
}

/**
 * Tooltip 语义归一化垫片：把「设计器写法」翻译成 Fusion Balloon.Tooltip 的 API。
 *
 * **这是适配器必须吸收的 UI 库差异，而非组件层要感知的**：
 * - 设计器（沿用 Element Plus 语义）写法：`<WfTooltip title="提示"><WfButton/></WfTooltip>`
 *   —— children 是触发元素，`title`/`content` 是提示文案。
 * - Fusion Balloon.Tooltip 恰好**相反**：`trigger` prop 传触发元素，children 传提示内容。
 *
 * 垫片在此把两者对齐，使设计器组件代码跨 UI 库不用改。同时把 EP 的 placement
 * （'top'|'bottom'|'left'|'right' 及其变体）映射为 Fusion 的 align（'t'|'b'|'l'|'r' 等）。
 */
function TooltipShim(props: any) {
  const { title, content, placement, align, children, ...rest } = props
  // EP placement -> Fusion align（Fusion: 't' 表示气泡在触发元素上方）
  const fusionAlign =
    align ??
    (placement
      ? ({ top: 't', bottom: 'b', left: 'l', right: 'r' } as Record<string, string>)[
          String(placement).split('-')[0]
        ] ?? 'b'
      : 'b')
  // 提示文案：title 优先，其次 content（两种写法都支持）
  const tipContent = title ?? content
  return createElement(
    Balloon.Tooltip as any,
    {
      ...rest,
      align: fusionAlign,
      // children 作为触发元素传给 Fusion 的 trigger
      trigger: children,
      triggerType: 'hover',
    },
    tipContent
  )
}

/**
 * TreeSelect 语义归一化垫片：后端树数据字段 -> Fusion 期望的字段。
 *
 * 设计器统一用 `{ value, label, children }`（EP 用 data + props 映射，React 无此约定），
 * 而 Fusion TreeSelect 直接吃 `dataSource` 且要求 `{ label, value, children }`。
 * 后端分类 / 表单树是 `{ id, name, children }`，故此处递归改写字段名，
 * 让设计器组件只需传原始树数据 + `fieldNames` 声明映射。
 */
function mapTreeData(list: any[], fields?: { value?: string; label?: string; children?: string }): any[] {
  if (!Array.isArray(list)) return []
  const vk = fields?.value ?? 'id'
  const lk = fields?.label ?? 'name'
  const ck = fields?.children ?? 'children'
  return list.map((item) => {
    const children = item[ck]
    return {
      label: item[lk],
      value: item[vk],
      ...(Array.isArray(children) && children.length
        ? { children: mapTreeData(children, fields) }
        : null),
    }
  })
}

function TreeSelectShim(props: any) {
  const { dataSource, data, fieldNames, children: _children, ...rest } = props
  const raw = dataSource ?? data
  return createElement(TreeSelect as any, {
    ...rest,
    dataSource: mapTreeData(raw, fieldNames),
    // 后端树可能不含 value/label 之外的键，Fusion 需要 treeDefaultExpandAll 才有 EP 的展开体验
    treeDefaultExpandAll: rest.treeDefaultExpandAll ?? true,
  })
}

/**
 * Tree 语义归一化垫片：字段映射 + 点击事件对齐。
 *
 * Fusion Tree 的 `onSelect(selectedKeys, extra)` 与 EP 的 `node-click(data)` 形状不同，
 * 垫片把选中节点的**原始数据**回传给设计器统一的 `onNodeClick(data)`。
 */
function TreeShim(props: any) {
  const { dataSource, data, fieldNames, onNodeClick, ...rest } = props
  const raw = dataSource ?? data
  const ck = fieldNames?.children ?? 'children'
  const vk = fieldNames?.value ?? 'id'

  // 建 value -> 原始节点 索引，便于把 Fusion 回传的 key 还原成数据对象
  const index = new Map<any, any>()
  const walk = (list: any[]) => {
    if (!Array.isArray(list)) return
    list.forEach((item) => {
      index.set(item[vk], item)
      if (Array.isArray(item[ck])) walk(item[ck])
    })
  }
  walk(raw)

  return createElement(Tree as any, {
    ...rest,
    dataSource: mapTreeData(raw, fieldNames),
    defaultExpandAll: rest.defaultExpandAll ?? true,
    onSelect: (keys: any[], extra: any) => {
      rest.onSelect?.(keys, extra)
      if (!onNodeClick) return
      const key = Array.isArray(keys) ? keys[0] : keys
      // 优先用 Fusion extra 里的节点数据，回退到索引查找
      const node = extra?.node?.props ?? index.get(key) ?? { [vk]: key }
      onNodeClick(node)
    },
  })
}

/**
 * Table 语义归一化垫片：把「列子组件」写法翻译成 Fusion 的 `columns` 属性。
 *
 * **这是适配器必须吸收的 UI 库差异**（`createNeutralComponent` 注释里预警过的自省道坑）：
 * Fusion 的 `Table` 会**自省 children**，只认 `Table.Column` / `Table.ColumnGroup` 类型；
 * 中性包装组件 `<WfTableColumn>` 不被它识别，会告警
 * `Warning: Use <Table.Column/>, <Table.ColumnGroup/> as child.` 且**列不渲染**。
 *
 * 解法与 Vue 版 antdvAdapter 的 `AntTable` 同源：table 垫片收集 children 的 props，
 * 转成 Fusion 原生的 `columns` 数组（`title` / `dataIndex` / `cell` / `width` / `align`），
 * 由 Fusion 自己构造列——自省不再发生。`WfTableColumn` 自身不渲染（返回 null），
 * 仅作声明式配置载体，与 Vue 版 `AntTableColumn` 一致。
 *
 * 消费方（设计器组件）保持 JSX 声明式列写法，无需感知差异。
 */
function TableShim(props: any) {
  const { children, columns: columnsProp, onRowClick, emptyContent, ...rest } = props

  // 收集列子组件（WfTableColumn 渲染出的 React 元素）的配置
  const collected: any[] = []
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return
    const p: any = child.props ?? {}
    // 跳过 null（条件渲染的列，如「操作」列在 disabled 时为 null）
    collected.push({
      title: p.title,
      dataIndex: p.dataIndex,
      // Fusion 的单元格渲染签名是 (value, index, record)
      cell: typeof p.cell === 'function'
        ? (value: any, index: number, record: any) => p.cell(value, index, record)
        : p.cell,
      width: p.width,
      align: p.align,
      className: p.className,
    })
  })

  return createElement(Table as any, {
    ...rest,
    columns: columnsProp ?? collected,
    emptyContent,
    // Fusion 用 onRowClick(record, index, e)；设计器传 (record) 即可，这里透传不改编排
    onRowClick: onRowClick
      ? (record: any, index: number, e: any) => onRowClick(record, index, e)
      : undefined,
  })
}

/**
 * TableColumn 垫片：不渲染任何内容，仅作声明式配置载体被 TableShim 收集。
 * （对齐 Vue 版 antdvAdapter 的 AntTableColumn）
 */
function TableColumnShim() {
  return null
}

/**
 * Drawer 语义归一化垫片：React 惯用 `open` / `onClose`，Fusion Drawer 用 `visible` / `onClose`。
 * 同时把 EP 风格的 `size`（'37%' / '100%'）映射为 Fusion 的 `width`（rtl 方向即宽度）。
 */
function DrawerShim(props: any) {
  const { open, visible, size, width, direction, placement, onClose, ...rest } = props
  const isRtl = (direction ?? placement ?? 'right') === 'rtl' || (direction ?? placement ?? 'right') === 'right'
  return createElement(Drawer as any, {
    ...rest,
    visible: open ?? visible,
    placement: isRtl ? 'right' : (direction ?? placement ?? 'right'),
    width: width ?? (isRtl ? size : undefined),
    height: isRtl ? undefined : size,
    onClose: (reason: string, e: any) => onClose?.(reason, e),
  })
}

/**
 * DatePicker 语义归一化垫片：`type="daterange"` -> Fusion 的 DatePicker.RangePicker。
 *
 * Fusion 无 EP 那种「单组件 + type 切换」的写法，区间选择是独立子组件。
 */
function DatePickerShim(props: any) {
  const { type, ...rest } = props
  if (type === 'daterange' || type === 'range') {
    const RangePicker = (DatePicker as any).RangePicker ?? DatePicker
    return createElement(RangePicker, rest)
  }
  return createElement(DatePicker as any, rest)
}

/**
 * Form 语义归一化垫片：给设计器表单套上统一的视觉默认值。
 *
 * 设计规范（见根 warm-flow-ui/AGENTS.md §3）要求表单标签**右对齐**。各 UI 库表达同一件事的
 * prop 名不同——Fusion 是 `labelTextAlign="right"`（注意它的 `labelAlign` 是标签「位置」
 * top/left/inset，不是文字对齐），EP 是默认 `label-position` + CSS 对齐。
 *
 * 垫片在这里补 Fusion 的默认值，使设计器组件**不需要感知任何 UI 库专有 prop**
 * （组件层只写 `<WfForm disabled>`），符合「适配器吸收 UI 库差异」的分层原则。
 * 消费方显式传入的同名 prop 优先，不被覆盖。
 */
function FormShim(props: any) {
  const { labelTextAlign, ...rest } = props
  return createElement(Form as any, {
    labelTextAlign: labelTextAlign ?? 'right',
    ...rest,
  })
}

/**
 * 反馈级别 -> Fusion 反馈类型。
 *
 * Fusion 的 Message / Notification 用 `notice`（而非 `info`）表示普通提示，
 * 且不支持 `loading` 之外的 `info`，故此处做映射收敛。
 */
function toFusionType(type: UiFeedbackType): 'success' | 'warning' | 'error' | 'notice' {
  switch (type) {
    case 'success':
      return 'success'
    case 'warning':
      return 'warning'
    case 'error':
      return 'error'
    case 'info':
    default:
      return 'notice'
  }
}

/**
 * Fusion Design（@alifd/next）实现的 UI 适配器。
 *
 * 这是 React 版设计器的**参考适配器**，对齐 chipflow 前端的技术栈（React 19 + @alifd/next 1.27.x）。
 * 把统一的 uiAdapter 契约映射到 Fusion 的 Message / Notification / Dialog / Loading 静态命令式 API。
 *
 * 与 Vue 版适配器的实现差异：
 * - Fusion 的 `Dialog.alert` / `Dialog.confirm` 返回 `{ hide }` 句柄而非 Promise，
 *   这里手动包一层 Promise，用 `onOk` resolve、`onCancel` reject，以对齐 UiAdapter 契约
 *   （契约规定 confirm 确认 resolve、取消 reject）。
 * - Fusion 无独立的「全屏 loading 单例」，用 `Loading` 组件挂到 body 上的容器实现，
 *   `close()` 卸载该容器。
 * - **不提供 `clickOutside` / `loadingDirective`**：React 无自定义指令，点击外部由
 *   `hooks/useClickOutside` 原生实现。
 *
 * @author warm
 */
export const nextAdapter: UiAdapter = {
  name: 'next',

  message(type: UiFeedbackType, content) {
    const opts = toOptions(content)
    // Fusion Message.show 单例：content 承载正文，duration 单位毫秒
    Message.show({
      type: toFusionType(type),
      title: opts.title,
      content: opts.message,
      duration: opts.duration ?? 3000,
      align: 'tc tc',
    } as any)
  },

  notify(type: UiFeedbackType, content) {
    const opts = toOptions(content)
    Notification.open({
      type: toFusionType(type),
      title: opts.title ?? DEFAULT_TITLE,
      content: opts.message,
      duration: opts.duration ?? 4500,
    } as any)
  },

  alert(content: string, options = {}) {
    const { title = DEFAULT_TITLE, ...rest } = options
    return new Promise<void>((resolve) => {
      const handle = Dialog.alert({
        title,
        content,
        onOk: () => resolve(),
        afterClose: () => resolve(),
        ...rest,
      } as any)
      // afterClose 已兜底 resolve；保留 handle 引用便于外部调试
      void handle
    })
  },

  confirm(content: string, options = {}) {
    const { title = DEFAULT_TITLE, ...rest } = options
    return new Promise<void>((resolve, reject) => {
      const handle = Dialog.confirm({
        title,
        content,
        onOk: () => resolve(),
        onCancel: () => reject(new Error('cancel')),
        ...rest,
      } as any)
      void handle
    })
  },

  prompt(content: string, options = {}) {
    const { title = DEFAULT_TITLE, ...rest } = options
    return new Promise<{ value: string }>((resolve, reject) => {
      // Fusion 无内置 prompt，用受控 Input 挂进 Dialog 内容区实现
      let value = ''
      const handle = Dialog.show({
        title,
        content: (
          <Input
            style={{ width: '100%' }}
            defaultValue=""
            placeholder={content}
            onChange={(v: string) => {
              value = v
            }}
          />
        ) as any,
        onOk: () => resolve({ value }),
        onCancel: () => reject(new Error('cancel')),
        ...rest,
      } as any)
      void handle
    })
  },

  loading(options = {}) {
    // Fusion 无全屏 loading 单例：在 body 挂一个遮罩容器，用 createRoot 渲染 Loading，close() 时卸载并移除
    const container = document.createElement('div')
    container.className = 'wf-react-loading-mask'
    container.style.cssText =
      'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;' +
      'justify-content:center;background:' +
      (typeof options.background === 'string' ? options.background : 'rgba(0,0,0,0.4)')
    document.body.appendChild(container)

    const text = (options.text as string) ?? '加载中...'
    // react-dom 为 peerDependency（构建时 externalize），此处可直接 createRoot
    const root = createRoot(container)
    root.render(createElement(Loading, { visible: true, tip: text } as any))

    return {
      close() {
        // React 18：卸载放到下一个宏任务，避免在事件回调中同步卸载告警
        setTimeout(() => {
          try {
            root.unmount()
          } catch {
            // ignore
          }
          container.remove()
        }, 0)
      },
    } as UiLoadingHandle
  },

  /**
   * 中性组件注册表：语义名 -> Fusion 组件。
   *
   * 命名沿用 Vue 版 UiComponents 的语义键，使设计器组件层的 `<wf-*>` 解析逻辑跨框架一致。
   * Fusion 与 Element Plus 的组件对应关系：
   * - `input-number` -> NumberPicker（EP 为 ElInputNumber）
   * - `tooltip` -> Balloon.Tooltip（EP 为 ElTooltip）
   * - `col` / `row` -> Grid.Col / Grid.Row（EP 为 ElCol / ElRow）
   * - `icon` -> Icon（EP 为 ElIcon）
   * - `tree-select` -> TreeSelect（EP 为 ElTreeSelect）
   */
  components: {
    button: Button as any,
    input: Input as any,
    'input-number': NumberPicker as any,
    select: Select as any,
    // Fusion Select 用 Select.Option 而非独立 Option 组件
    option: (Select as any).Option,
    // 垫片：补 Fusion 的 labelTextAlign 默认值（右对齐标签），组件层无需感知此 prop
    form: FormShim as any,
    'form-item': Form.Item as any,
    // 垫片：Fusion Table 自省 children 只认 Table.Column，中性包装列不被识别（见 TableShim 注释）
    table: TableShim as any,
    'table-column': TableColumnShim as any,
    col: Grid.Col as any,
    row: Grid.Row as any,
    header: Card as any,
    checkbox: Checkbox as any,
    'checkbox-group': (Checkbox as any).Group,
    // 垫片：后端树字段 { id, name, children } -> Fusion { value, label, children }
    'tree-select': TreeSelectShim as any,
    // 垫片：字段映射 + 选中事件对齐为设计器统一的 onNodeClick(data)
    tree: TreeShim as any,
    tag: Tag as any,
    radio: Radio as any,
    'radio-group': (Radio as any).Group,
    dialog: Dialog as any,
    // 垫片：React 惯用 open/onClose + EP 风格 size -> Fusion visible/placement/width
    drawer: DrawerShim as any,
    // 垫片：type="daterange" -> Fusion DatePicker.RangePicker（Fusion 区间选择是独立子组件）
    'date-picker': DatePickerShim as any,
    'time-picker': TimePicker as any,
    switch: Switch as any,
    pagination: Pagination as any,
    divider: Divider as any,
    // 垫片：Fusion Balloon.Tooltip 的 trigger/children 语义与 EP 相反（见 TooltipShim 注释）
    tooltip: TooltipShim as any,
    icon: Icon as any,
    search: Search as any,
  },
}
