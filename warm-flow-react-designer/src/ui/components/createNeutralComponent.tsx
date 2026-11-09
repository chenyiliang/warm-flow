import { forwardRef, type ComponentType } from 'react'
import { getUiAdapter } from '@/ui/uiAdapter'

/**
 * 中性透传组件工厂（React 版，移植自 Vue 的 ui/components/createNeutralComponent）。
 *
 * 按「语义名」生成一个包装组件，运行时渲染当前 UI 适配器注册的对应组件，
 * 实现「设计器视图与具体 UI 库解耦」。设计器内部一律写 `<WfButton>` / `<WfInput>`，
 * 底层落到 Fusion（nextAdapter）或任意其它适配器提供的实现。
 *
 * 与 Vue 版的实现差异：
 * - Vue 用 `defineComponent` + `h()` + `inheritAttrs:false` 显式 `v-bind="$attrs"` 透传 props/事件，
 *   并用 `expose(new Proxy(...))` 把模板 ref 的方法访问转发到内部真实组件实例。
 * - **React 天然透传**：props（含 v-model 对应的 value/onChange）随 `{...props}` 展开即透传，
 *   无需 attrs 特殊处理；children（默认插槽）与具名插槽（React 里同样是 props）自动传递。
 * - **ref 转发用 `forwardRef`** 直接落到内部组件，等价 Vue 的 expose Proxy，调用方
 *   `ref.current.xxx()` 用法无感。
 *
 * 注意：对「父组件按子组件类型自省」的耦合组件（如 Fusion Table 读取 Table.Column 定义），
 * 通用包装可能不被父组件识别，这类需单独验证或特殊处理，不可盲目套用（与 Vue 版同样的限制）。
 *
 * @author warm
 */
export function createNeutralComponent(name: string, registryKey: string): ComponentType<any> {
  const Neutral = forwardRef<any, any>((props, ref) => {
    const adapter = getUiAdapter()
    const Target = adapter.components?.[registryKey]
    if (!Target) {
      // 未注册该语义名：容错返回 null（调用方需容错），并给出一次开发期提示
      // 用 import.meta.env.DEV（Vite 原生）而非 process.env.NODE_ENV：库产物无需注入 process
      if (import.meta.env.DEV) {
        console.warn(
          `[warm-flow-react] UI 适配器 "${adapter.name}" 未提供中性组件 "${registryKey}"（<${name}> 不渲染）。`
        )
      }
      return null
    }
    return <Target {...props} ref={ref} />
  })
  // forwardRef 让消费方 ref 直达内部真实组件（对齐 Vue 版 expose Proxy 语义）
  Neutral.displayName = name
  return Neutral as unknown as ComponentType<any>
}
