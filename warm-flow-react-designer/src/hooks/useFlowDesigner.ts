import { useRef } from 'react'
import type { MutableRefObject } from 'react'
import type { FlowDesignerInstance } from '@/designer/types'

export type { FlowDesignerInstance }

/**
 * useFlowDesigner 返回值：React ref + 与 FlowDesignerInstance 同名的命令式方法（带空安全包装）。
 *
 * 与 Vue 版的差异：`designerRef` 为 React `MutableRefObject`（读 `.current`），
 * 而非 Vue 的 `Ref`（读 `.value`）。绑定方式为 `<FlowDesigner ref={designerRef} />`。
 */
export interface UseFlowDesignerReturn extends FlowDesignerInstance {
  /** 绑定到 `<FlowDesigner ref={designerRef} />` 的 React ref */
  designerRef: MutableRefObject<FlowDesignerInstance | null>
  /** 设计器是否已挂载（命令式 API 是否可用） */
  isReady: () => boolean
}

/**
 * 流程设计器命令式 API Hook（React 版，移植自 Vue 的 composables/useFlowDesigner）。
 *
 * 相比直接用 ref，本 Hook 额外提供：
 * - 空安全：组件尚未挂载时调用方法不会抛错，仅 warn 并返回安全默认值；
 * - 解构友好：`const { designerRef, save, getFlowJson } = useFlowDesigner()`；
 * - 类型完备：方法签名与 FlowDesignerInstance 完全一致。
 *
 * @example
 * ```tsx
 * import { FlowDesigner, useFlowDesigner } from '@dromara/warm-flow-designer-react'
 * function Page() {
 *   const { designerRef, save, getFlowJson } = useFlowDesigner()
 *   return (
 *     <>
 *       <FlowDesigner ref={designerRef} definitionId={id} />
 *       <button onClick={save}>保存</button>
 *     </>
 *   )
 * }
 * ```
 *
 * @author warm
 */
export function useFlowDesigner(): UseFlowDesignerReturn {
  const designerRef = useRef<FlowDesignerInstance | null>(null)

  /** 取实例，未挂载时 warn 并返回 null（调用方按需降级） */
  function ensure(method: string): FlowDesignerInstance | null {
    if (!designerRef.current) {
      console.warn(
        `[warm-flow-react] useFlowDesigner.${method}(): 设计器尚未挂载，调用被忽略。` +
          `请确认已将 designerRef 绑定到 <FlowDesigner ref={designerRef} /> 且组件已渲染。`
      )
      return null
    }
    return designerRef.current
  }

  return {
    designerRef,
    isReady: () => !!designerRef.current,
    save: async () => {
      await ensure('save')?.save()
    },
    validate: async () => (await ensure('validate')?.validate()) ?? false,
    getGraphData: () => ensure('getGraphData')?.getGraphData() ?? null,
    getFlowJson: () => ensure('getFlowJson')?.getFlowJson() ?? '',
    getFlowName: () => ensure('getFlowName')?.getFlowName() ?? '',
    getLogicFlow: () => ensure('getLogicFlow')?.getLogicFlow() ?? null,
    zoom: (z) => {
      ensure('zoom')?.zoom(z)
    },
    zoomIn: () => {
      ensure('zoomIn')?.zoomIn()
    },
    zoomOut: () => {
      ensure('zoomOut')?.zoomOut()
    },
    fitView: () => {
      ensure('fitView')?.fitView()
    },
    resetZoom: () => {
      ensure('resetZoom')?.resetZoom()
    },
    undo: () => {
      ensure('undo')?.undo()
    },
    redo: () => {
      ensure('redo')?.redo()
    },
    clear: () => {
      ensure('clear')?.clear()
    },
    downloadImage: () => {
      ensure('downloadImage')?.downloadImage()
    },
    downloadJson: () => {
      ensure('downloadJson')?.downloadJson()
    },
    isDirty: () => ensure('isDirty')?.isDirty() ?? false,
    resetDirty: () => {
      ensure('resetDirty')?.resetDirty()
    },
    validateStructure: () =>
      ensure('validateStructure')?.validateStructure() ?? {
        valid: false,
        errors: ['设计器尚未挂载'],
      },
  }
}
