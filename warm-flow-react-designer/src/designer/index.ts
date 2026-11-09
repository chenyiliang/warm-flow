import { registerIcons } from '@/icons'
// 库样式：构建期抽取为 dist-lib/warm-flow-designer-react.css（消费方 import '.../style'）
import '@/assets/styles/designer.scss'

// 注册离线图标集（ep:* / wf:*）。**必须显式调用**，不能只 `import '@/icons'`：
// 本包 sideEffects 只声明了 css，纯副作用 import 会被 Rollup tree-shake 掉，
// 导致图标数据进 bundle 却从未注册、所有 SvgIcon 渲染为空（详见 @/icons 注释）。
registerIcons()

import FlowDesigner from '@/components/design/FlowDesigner'
import SvgIcon from '@/components/SvgIcon'

import BaseInfo from '@/components/design/common/react/BaseInfo'
import DiagramSidebar from '@/components/design/common/react/DiagramSidebar'
import PropertySetting from '@/components/design/common/react/PropertySetting'
import SelectUser from '@/components/design/common/react/SelectUser'
import NodeExtList from '@/components/design/common/react/NodeExtList'

import {
  setupDataProvider,
  setDataProvider,
  getDataProvider,
  createHttpProvider,
  createMockProvider,
  isMockEnabled,
} from '@/data'
import type { DataProvider } from '@/data'

import { setUiAdapter, getUiAdapter, hasUiAdapter } from '@/ui/uiAdapter'
import type {
  UiAdapter, UiFeedbackType, UiFeedbackOptions, UiLoadingHandle, UiComponents,
} from '@/ui/uiAdapter'
import { setComponentSize, getComponentSize, useComponentSize } from '@/ui/designerOptions'
import type { ComponentSize } from '@/ui/designerOptions'

import { useFlowDesigner } from '@/hooks/useFlowDesigner'
import { useFlowJson } from '@/hooks/useFlowJson'
import { useTheme, lightColors, darkColors } from '@/hooks/useTheme'

import {
  setLocale, getLocale, useI18n, setMessages, translate,
} from '@/i18n'
import type { WfLocale, WfMessageTree, UseI18nReturn } from '@/i18n'

// 命令式反馈便捷封装（纯适配器契约代码，与 Vue 版 plugins/modal.ts 逐字相同）
import modal from '@/plugins/modal'
import cache from '@/plugins/cache'

import type {
  FlowDesignerProps,
  FlowDesignerInstance,
  FlowDesignerSavedPayload,
  FlowDesignerReadyPayload,
  FlowDesignerBeforeSavePayload,
  FlowDesignerChangePayload,
  FlowDesignerValidateErrorPayload,
  FlowDesignerNodeClickPayload,
  FlowStructureValidateResult,
  PaletteNode,
  FlowDesignerPaletteNodes,
} from '@/designer/types'
import type { UseFlowDesignerReturn } from '@/hooks/useFlowDesigner'
import type { UseFlowJsonReturn } from '@/hooks/useFlowJson'
import type { UseUserPickerReturn, SelectedHandlerItem } from '@/hooks/useUserPicker'
import type { PropertySettingHandle } from '@/components/design/common/react/PropertySetting'
import type { BaseInfoHandle } from '@/components/design/common/react/BaseInfo'
import type { NodeExtListHandle } from '@/components/design/common/react/NodeExtList'
import type { FlowDesignerReactProps } from '@/components/design/FlowDesigner'

/**
 * Warm-Flow 设计器 React 版「可复用层」统一出口（组件库 / npm 包入口）。
 *
 * 主入口 UI 库无关：不静态引入任何 UI 组件库，消费方须显式注册一个 UI 适配器后再渲染设计器：
 *
 * ```tsx
 * import { FlowDesigner, setUiAdapter, setDataProvider, createMockProvider } from '@dromara/warm-flow-designer-react'
 * import { nextAdapter } from '@dromara/warm-flow-designer-react/next'   // Fusion Design 适配器
 * import '@dromara/warm-flow-designer-react/style'
 *
 * setUiAdapter(nextAdapter)        // 选择 UI 库适配器，须在渲染 FlowDesigner 前调用
 * setDataProvider(myProvider)      // 可选：注入自定义后端 / mock，实现数据层与具体后端解耦
 *
 * <FlowDesigner definitionId={id} onSaved={onSaved} onClose={onClose} />
 * ```
 *
 * 与 Vue 版（@dromara/warm-flow-designer）入口的差异：
 * - **无 `WarmFlowDesigner` 插件 / `install()`**：React 没有 `app.use()` 与全局组件注册，
 *   中性组件改为具名导出（`src/ui/components`），图标在 `@/icons` 加载时即离线注册，零配置可用。
 *   故本入口默认导出为 FlowDesigner 组件本身（Vue 版默认导出为插件对象）。
 * - **无 `PropertySetting` 导出**：节点属性抽屉尚未移植（见 FlowDesigner.tsx 末尾待移植清单）。
 * - `useDark` -> `useTheme`（React 语义命名）；`useFlowDesigner` / `useFlowJson` 的 ref 由
 *   Vue 的 `Ref`（`.value`）改为 React 的 `MutableRefObject`（`.current`）。
 * - 事件由 Vue 的 `emit('saved')` 改为 React 的 `onSaved` 回调 prop；具名插槽改为 render-prop。
 *
 * 该入口对外只暴露这一稳定门面，内部目录结构调整不影响下游 import 路径。
 *
 * @author warm
 */
export {
  // 可复用画布组件（props 驱动）
  FlowDesigner,
  // 全局图标组件（图标集已在本模块加载时离线注册，单独导出便于按需使用）
  SvgIcon,
  // 数据层：注入 / 获取数据源、内置 http 与 mock 实现、mock 开关、按环境装配
  setupDataProvider,
  setDataProvider,
  getDataProvider,
  createHttpProvider,
  createMockProvider,
  isMockEnabled,
  // UI 适配层：注册 / 获取 UI 库适配器。主入口 UI 无关，消费方须显式注册一个适配器：
  //   Fusion Design 适配器 import 自 @dromara/warm-flow-designer-react/next
  setUiAdapter,
  getUiAdapter,
  hasUiAdapter,
  // 全局 UI 选项：设置 / 获取设计器组件尺寸（small / default / large）
  setComponentSize,
  getComponentSize,
  useComponentSize,
  // Hooks：命令式操控设计器（save / zoom / getFlowJson 等，空安全包装）
  useFlowDesigner,
  // Hooks：流程 json 只读视图（json / data / dirty + sync + handlers）
  useFlowJson,
  // Hooks：暗黑模式与主题颜色（isDark / themeColors / setCustomThemeColors 等）
  useTheme,
  // 国际化：切换 / 获取语言、Hook useI18n、扩展语言包 setMessages、独立翻译函数 translate
  setLocale,
  getLocale,
  useI18n,
  setMessages,
  translate,
  // 主题颜色常量（非响应式，供非 React 上下文使用）
  lightColors,
  darkColors,
  // 命令式反馈 / 缓存便捷封装（等价 Vue 版 $modal / $cache 全局属性；React 无全局注册，改具名导出）
  // 走当前 UI 适配器，未 setUiAdapter 时调用会抛错
  modal,
  cache,
  // 设计器可组合子组件（高级用法）：基础信息表单 / 节点属性面板 / 拖拽侧边栏 / 办理人选择器 / 扩展属性表单
  // 需先 setUiAdapter，依赖中性 wf-* 组件与图标集
  BaseInfo,
  PropertySetting,
  DiagramSidebar,
  SelectUser,
  NodeExtList,
}

export type {
  DataProvider,
  UiAdapter,
  UiFeedbackType,
  UiFeedbackOptions,
  UiLoadingHandle,
  UiComponents,
  ComponentSize,
  WfLocale,
  WfMessageTree,
  UseI18nReturn,
  UseFlowDesignerReturn,
  UseFlowJsonReturn,
  // FlowDesigner 相关公共类型：props / 命令式实例 / 事件 payload / 拖拽面板节点
  FlowDesignerProps,
  FlowDesignerReactProps,
  FlowDesignerInstance,
  FlowDesignerSavedPayload,
  FlowDesignerReadyPayload,
  FlowDesignerBeforeSavePayload,
  FlowDesignerChangePayload,
  FlowDesignerValidateErrorPayload,
  FlowDesignerNodeClickPayload,
  FlowStructureValidateResult,
  PaletteNode,
  FlowDesignerPaletteNodes,
  // 子组件的命令式契约（ref 标注用）与办理人选择类型
  PropertySettingHandle,
  BaseInfoHandle,
  NodeExtListHandle,
  SelectedHandlerItem,
  UseUserPickerReturn,
}

export default FlowDesigner
