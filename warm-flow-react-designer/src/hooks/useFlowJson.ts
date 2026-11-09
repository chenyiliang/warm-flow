import { useCallback, useMemo, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'
import type { FlowDesignerInstance } from '@/designer/types'

/**
 * useFlowJson 返回值：流程 json 的只读视图 + 同步入口 + 可直接展开到 FlowDesigner 的事件集合。
 *
 * 与 Vue 版的差异：`json` / `dirty` 为 React state 值（非 `Ref`），读值直接用 `json`；
 * `data` 为 `useMemo` 派生值（非 `ComputedRef`）；`bind` 为可直接展开的 onXxx 回调集合。
 */
export interface UseFlowJsonReturn {
  /** 最近一次同步的可保存流程 json 字符串（随 ready / change / saved 自动刷新） */
  json: string
  /** json 解析后的对象（解析失败为 null） */
  data: any
  /** 当前是否有未保存的画布改动（随 dirty 事件同步） */
  dirty: boolean
  /** 手动从设计器拉取最新 json（返回拉取到的字符串） */
  sync: () => string
  /**
   * 事件监听集合，直接展开到设计器即自动驱动同步：
   * `<FlowDesigner ref={designerRef} {...flowJson.bind} />`
   * 包含 onReady / onChange / onSaved（刷新 json）与 onDirty（同步 dirty）。
   */
  bind: Record<string, (...args: any[]) => void>
}

/**
 * 流程 json 只读读取 Hook（React 版，移植自 Vue 的 composables/useFlowJson）。
 *
 * 设计取舍（与 Vue 版一致）：本 Hook 是**单向读**——把设计器当前 json 同步成
 * `json` / `data` state，便于实时预览、外部展示、脏检测；**不做反向写回画布**
 * （写入仍走 `initialJson` + key 重挂载，避免双向绑定的回环 / 脏检测取舍）。
 *
 * 用法：与 ref（或 useFlowDesigner 的 designerRef）配合，并把 `bind` 展开到设计器上。
 *
 * @example
 * ```tsx
 * import { FlowDesigner, useFlowDesigner, useFlowJson } from '@dromara/warm-flow-designer-react'
 * function Page() {
 *   const { designerRef } = useFlowDesigner()
 *   const { json, data, dirty, bind } = useFlowJson(designerRef)
 *   return (
 *     <>
 *       <FlowDesigner ref={designerRef} initialJson={initial} {...bind} />
 *       <pre>{json}</pre>
 *     </>
 *   )
 * }
 * ```
 *
 * @author warm
 */
export function useFlowJson(
  designerRef: MutableRefObject<FlowDesignerInstance | null>
): UseFlowJsonReturn {
  const [json, setJson] = useState<string>('')
  const [dirty, setDirty] = useState<boolean>(false)

  const data = useMemo<any>(() => {
    try {
      return json ? JSON.parse(json) : null
    } catch {
      return null
    }
  }, [json])

  /** 从设计器实例拉取最新 json 与 dirty 状态（实例未挂载时置空）。 */
  const sync = useCallback((): string => {
    const inst = designerRef.current
    const next = inst ? inst.getFlowJson() : ''
    setJson(next)
    if (inst) setDirty(inst.isDirty())
    return next
    // designerRef 为稳定引用，无需入依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 用 ref 持有最新 sync，保证 bind 回调引用稳定且不捕获旧闭包
  const syncRef = useRef(sync)
  syncRef.current = sync

  const bind = useMemo<Record<string, (...args: any[]) => void>>(
    () => ({
      // 画布就绪 / 变更 / 保存成功后刷新 json（与 dirty）
      onReady: () => syncRef.current(),
      onChange: () => syncRef.current(),
      onSaved: () => syncRef.current(),
      // 未保存状态翻转：同步 dirty；变干净时顺带刷新 json（反映已保存内容）
      onDirty: (d: boolean) => {
        setDirty(!!d)
        if (!d) syncRef.current()
      },
    }),
    []
  )

  return { json, data, dirty, sync, bind }
}
