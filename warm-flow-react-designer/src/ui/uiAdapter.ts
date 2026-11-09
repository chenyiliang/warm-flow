import type { ComponentType } from 'react'

/**
 * 反馈级别：消息 / 通知 / 弹框的语义类型。
 */
export type UiFeedbackType = 'info' | 'success' | 'warning' | 'error'

/**
 * loading 句柄：由 adapter.loading() 返回，调用方负责在合适时机 close()。
 */
export interface UiLoadingHandle {
  close(): void
}

/**
 * 命令式反馈选项（消息 / 通知 / 弹框 / loading 通用），不同 UI 库各取所需字段。
 */
export interface UiFeedbackOptions {
  title?: string
  message?: string
  duration?: number
  text?: string
  [key: string]: unknown
}

/**
 * 中性组件注册表：把设计器用到的 UI 组件按「语义名」映射到具体 UI 库的实现，
 * 供中性组件 Wf*（如 WfButton / WfInput）通过 `getUiAdapter().components?.xxx` 解析渲染目标。
 *
 * React 版：值为 React 组件类型（`ComponentType`），而非 Vue 的组件对象。
 */
export interface UiComponents {
  button?: ComponentType<any>
  input?: ComponentType<any>
  [name: string]: ComponentType<any> | undefined
}

/**
 * Warm-Flow 设计器「UI 适配器」契约（React 版）。
 *
 * 把设计器对具体 UI 库（Fusion Design / Ant Design / Arco …）的命令式 API（消息 / 通知 / 弹框 / loading）
 * 依赖收敛到这一层，实现「核心逻辑与 UI 库解耦、可按需切换 UI 库」。
 *
 * 与 Vue 版（@dromara/warm-flow-designer）的契约差异：
 * - `UiComponents` 值为 React 组件类型，不是 Vue 组件对象；
 * - **移除了 `clickOutside` / `loadingDirective` 两个「指令」字段**：Vue 的自定义指令在 React
 *   没有对应物，React 侧点击外部 / 区域 loading 由组件内 hook 原生实现（见 `hooks/useClickOutside`）。
 *
 * @author warm
 */
export interface UiAdapter {
  /** 适配器名称，便于调试 / 识别当前 UI 库 */
  name: string
  /** 轻量消息提示（toast） */
  message(type: UiFeedbackType, content: string | UiFeedbackOptions): void
  /** 通知（notification） */
  notify(type: UiFeedbackType, content: string | UiFeedbackOptions): void
  /** 信息弹框（alert），返回 Promise 便于等待关闭 */
  alert(content: string, options?: UiFeedbackOptions): Promise<unknown>
  /** 确认弹框（confirm），确认 resolve、取消 reject */
  confirm(content: string, options?: UiFeedbackOptions): Promise<unknown>
  /** 输入弹框（prompt），确认 resolve({ value }) */
  prompt(content: string, options?: UiFeedbackOptions): Promise<{ value: string }>
  /** 全屏 / 区域 loading，返回句柄，调用方 close() */
  loading(options?: UiFeedbackOptions): UiLoadingHandle
  /** 中性组件注册表：语义名 -> 具体 UI 库组件，供 Wf* 中性组件解析渲染目标 */
  components?: UiComponents
}

let currentAdapter: UiAdapter | null = null

/**
 * 注册当前 UI 适配器。消费方在渲染设计器前调用。
 *
 * React 版**无默认适配器**（与 Vue 版一致：主入口 UI 库无关），未注册时 `getUiAdapter()` 抛错。
 */
export function setUiAdapter(adapter: UiAdapter): void {
  currentAdapter = adapter
}

/**
 * 获取当前 UI 适配器。未注册时抛错，提示调用方先注册。
 */
export function getUiAdapter(): UiAdapter {
  if (!currentAdapter) {
    throw new Error(
      '[warm-flow-react] UI 适配器未注册：请先 setUiAdapter(nextAdapter) 或自定义适配器，' +
        '再渲染 FlowDesigner，否则中性组件 wf-* 无法解析到具体 UI 库实现。'
    )
  }
  return currentAdapter
}

/** 是否已注册 UI 适配器 */
export function hasUiAdapter(): boolean {
  return currentAdapter !== null
}
