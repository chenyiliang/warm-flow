import { useSyncExternalStore } from 'react'

/**
 * 设计器全局 UI 选项（与具体 UI 库解耦的「风格」配置中心）。
 *
 * 目前承载「组件尺寸」全局设置：消费方一次性指定 small / default / large，
 * 设计器内所有中性组件 wf-*（按当前 UI 适配器渲染为 Fusion / 其它 UI 组件）默认即采用该尺寸，
 * 局部仍可用组件自身的 size 覆盖。
 *
 * 与 Vue 版的实现差异：
 * - Vue 版用模块级 `ref<ComponentSize>`，中性组件在 render 中读 `.value` 自动建依赖。
 * - React 版用「模块级变量 + 订阅者集合」，`useComponentSize()` 内部用 `useSyncExternalStore`
 *   订阅，`setComponentSize` 通知订阅者触发重渲染（与 i18n 的 locale 同一套订阅模式）。
 *   对外 `setComponentSize()` / `getComponentSize()` 签名保持一致。
 *
 * @author warm
 */

/** 组件尺寸：对齐 Element Plus / Fusion 取值（large / default / small）。 */
export type ComponentSize = 'large' | 'default' | 'small'

// 模块级当前尺寸 + 订阅者集合（替代 Vue 的 ref）
let componentSizeValue: ComponentSize = 'default'
const sizeListeners = new Set<() => void>()

function subscribeSize(listener: () => void): () => void {
  sizeListeners.add(listener)
  return () => {
    sizeListeners.delete(listener)
  }
}

function getSizeSnapshot(): ComponentSize {
  return componentSizeValue
}

/**
 * 设置设计器全局组件尺寸。须在渲染设计器前（或运行期任意时刻）调用。
 * 变更后所有 useComponentSize() 订阅者自动重渲染。
 */
export function setComponentSize(size: ComponentSize): void {
  if (size !== componentSizeValue) {
    componentSizeValue = size
    sizeListeners.forEach((fn) => fn())
  }
}

/** 获取当前设计器全局组件尺寸（非响应式快照）。 */
export function getComponentSize(): ComponentSize {
  return componentSizeValue
}

/**
 * React Hook：订阅当前全局组件尺寸，供中性组件在 render 中读取以保持响应式。
 * setComponentSize 后调用本 Hook 的组件自动重渲染。
 */
export function useComponentSize(): ComponentSize {
  return useSyncExternalStore(subscribeSize, getSizeSnapshot, getSizeSnapshot)
}
