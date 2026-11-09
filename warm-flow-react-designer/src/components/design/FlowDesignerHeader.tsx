import SvgIcon from '@/components/SvgIcon'
import { WfButton, WfTooltip } from '@/ui/components'
import { useI18n } from '@/i18n'

/**
 * 流程设计器顶部导航（React 版，移植自 FlowDesignerHeader.vue）：
 * 流程名（左） + 步骤切换（中） + 保存（右）。
 *
 * 从 FlowDesigner 抽出的纯展示编排子组件，状态/逻辑仍由容器持有，经 props 入、回调出。
 *
 * 与 Vue 版的差异：三个具名插槽（header-left / header-center / header-actions）改为
 * render-prop（headerLeft / headerCenter / headerActions），透出同样的上下文参数；
 * 未传时渲染内置默认内容（保留默认回退语义）。
 *
 * @author warm
 */
export interface StepItem {
  title: string
  icon: string
}

export interface FlowDesignerHeaderProps {
  flowName?: string
  activeStep: number
  steps: StepItem[]
  disabled?: boolean
  onStepClick?: (index: number) => void
  onSave?: () => void
  /** 替换左侧（透出 flowName） */
  headerLeft?: (ctx: { flowName?: string }) => React.ReactNode
  /** 替换中间步骤区（透出 activeStep / steps / goToStep） */
  headerCenter?: (ctx: {
    activeStep: number
    steps: StepItem[]
    goToStep: (index: number) => void
  }) => React.ReactNode
  /** 替换右侧操作区（透出 save / disabled） */
  headerActions?: (ctx: { save: () => void; disabled: boolean }) => React.ReactNode
}

export default function FlowDesignerHeader(props: FlowDesignerHeaderProps) {
  const {
    flowName,
    activeStep,
    steps,
    disabled,
    onStepClick,
    onSave,
    headerLeft,
    headerCenter,
    headerActions,
  } = props

  const { t } = useI18n()

  const goToStep = (index: number) => onStepClick?.(index)
  const emitSave = () => onSave?.()

  return (
    <div className="design-header">
      {/* 左侧：流程名称 */}
      <div className="header-left">
        {headerLeft ? (
          headerLeft({ flowName })
        ) : (
          <div className="flow-name-wrapper">
            <WfTooltip title={flowName} placement="bottom">
              <div className="flow-name">
                <SvgIcon iconClass="flowName" style={{ marginRight: '5px' }} />
                {flowName || t('flowDesigner.untitled')}
              </div>
            </WfTooltip>
          </div>
        )}
      </div>

      {/* 中间：步骤切换 */}
      <div className="header-center">
        {headerCenter ? (
          headerCenter({ activeStep, steps, goToStep })
        ) : (
          <div className="steps-tabs">
            {steps.map((step, index) => (
              <div
                key={index}
                className={`step-tab${activeStep === index ? ' active' : ''}`}
                onClick={() => goToStep(index)}
              >
                <SvgIcon iconClass={step.icon} className="tab-icon" />
                <span className="tab-text">{step.title}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 右侧：保存按钮 */}
      <div className="header-right">
        {headerActions ? (
          headerActions({ save: emitSave, disabled: !!disabled })
        ) : !disabled ? (
          <WfButton className="save-btn" size="medium" onClick={emitSave}>
            <SvgIcon iconClass="save" className="save-icon" />
            <span>{t('common.save')}</span>
          </WfButton>
        ) : null}
      </div>
    </div>
  )
}
