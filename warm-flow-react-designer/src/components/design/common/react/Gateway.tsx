import { WfForm, WfFormItem, WfInput } from '@/ui/components'
import { useI18n } from '@/i18n'

/**
 * 网关节点属性面板（React 版，移植自 common/vue/gateway.vue）。
 *
 * 互斥 / 并行 / 包含三类网关共用本面板，只有节点编码一个可编辑字段
 * （网关无办理人、无监听器、无形态差异）。
 *
 * 与 Vue 版的差异：
 * - Vue 版 `const form = ref(props.modelValue)` **直接引用**父级传入的对象，故子组件内改 form
 *   等于改父级对象（隐式共享）。React 不能这样做（props 应视为只读），改为受控：
 *   内部维护 state 镜像 + `onChange` 回传父级。
 * - Vue 版的 `defineExpose` 未暴露 validate（网关只有 nodeCode，无必填规则），React 版同样不暴露，
 *   PropertySetting 侧用可选链调用（`ref.current?.validate?.()`），缺失即视为校验通过。
 * - 具名插槽 `node-form-extra` -> render-prop `nodeFormExtra`（透出 form / disabled）。
 *
 * @author warm
 */
export interface GatewayProps {
  /** 节点表单数据（受控） */
  value?: Record<string, any>
  /** 只读 */
  disabled?: boolean
  /** 表单值变更（等价 Vue v-model 的 update） */
  onChange?: (value: Record<string, any>) => void
  /** 自定义扩展点：消费方注入额外表单项（透出 form / disabled） */
  nodeFormExtra?: (ctx: { form: Record<string, any>; disabled: boolean }) => React.ReactNode
}

export default function Gateway(props: GatewayProps) {
  const { value = {}, disabled = false, onChange, nodeFormExtra } = props
  const { t } = useI18n()

  const setField = (key: string, v: any) => {
    onChange?.({ ...value, [key]: v })
  }

  return (
    <div className="gateway-wrapper">
      {/* labelAlign 不显式设置：Fusion 默认即「标签在左」，与 EP 默认 label-position 视觉一致；
          设计规范的「标签右对齐」指文字对齐，Fusion 用 labelTextAlign，由各 UI 适配器按需处理 */}
      <WfForm className="gatewayForm" disabled={disabled}>
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
            {/* 自定义扩展点 */}
            {nodeFormExtra ? nodeFormExtra({ form: value, disabled }) : null}
          </div>
        </div>
      </WfForm>
    </div>
  )
}
