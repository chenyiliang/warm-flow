import { useRef } from 'react'
import { WfForm, WfFormItem, WfInput } from '@/ui/components'
import { useI18n } from '@/i18n'

/**
 * 结束节点属性面板（React 版，移植自 common/vue/end.vue）。
 *
 * 只有节点编码 + 节点名称两个字段（结束节点无办理人、无监听器）。
 *
 * 与 Vue 版的差异：
 * - Vue 版 `watch(() => form, ..., {deep:true})` 把整个 form emit 给父级；React 改为受控
 *   `onChange(nextForm)`，每次字段变更即回传（语义等价，父级负责写回 lf.setProperties）。
 * - Vue 版 `nodeNameChange()` 调 `proxy.$refs.nodeInput.focus()`——el-input 的 `@change` 在
 *   **失焦或回车**时触发，其意图是回车改名后把焦点留在输入框。React 版用 `onBlur` + ref 复现
 *   失焦路径；回车路径由 Fusion Input 自身的 blur 行为覆盖（差异极小，不影响数据）。
 *
 * @author warm
 */
export interface EndProps {
  /** 节点表单数据（受控） */
  value?: Record<string, any>
  /** 只读 */
  disabled?: boolean
  /** 表单值变更 */
  onChange?: (value: Record<string, any>) => void
  /** 自定义扩展点（透出 form / disabled） */
  nodeFormExtra?: (ctx: { form: Record<string, any>; disabled: boolean }) => React.ReactNode
}

export default function End(props: EndProps) {
  const { value = {}, disabled = false, onChange, nodeFormExtra } = props
  const { t } = useI18n()

  const nodeInputRef = useRef<any>(null)

  const setField = (key: string, v: any) => {
    onChange?.({ ...value, [key]: v })
  }

  /** 名称变更后重新聚焦（对齐 Vue 版 nodeNameChange） */
  const nodeNameChange = () => {
    nodeInputRef.current?.focus?.()
  }

  return (
    <div className="end-wrapper">
      <WfForm className="endForm" disabled={disabled}>
        <div className="base-settings-section">
          <div className="base-settings-content">
            <WfFormItem label={t('node.codeLabel')}>
              <WfInput
                value={value.nodeCode ?? ''}
                disabled={disabled}
                onChange={(v: any) =>
                  setField('nodeCode', typeof v === 'string' ? v : v?.target?.value ?? '')
                }
              />
            </WfFormItem>
            <WfFormItem label={t('node.nameLabel')}>
              <WfInput
                ref={nodeInputRef}
                value={value.nodeName ?? ''}
                disabled={disabled}
                onChange={(v: any) =>
                  setField('nodeName', typeof v === 'string' ? v : v?.target?.value ?? '')
                }
                onBlur={nodeNameChange}
              />
            </WfFormItem>
            {/* 自定义扩展点 */}
            {nodeFormExtra ? nodeFormExtra({ form: value, disabled }) : null}
          </div>
        </div>
      </WfForm>
    </div>
  )
}
