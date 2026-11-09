import SvgIcon from '@/components/SvgIcon'
import { WfButton, WfTooltip } from '@/ui/components'
import { useI18n } from '@/i18n'

/**
 * 流程设计器画布工具栏（React 版，移植自 FlowDesignerToolbar.vue）。
 *
 * 缩放（缩小 / 适应 / 放大）+ 撤销 / 重做 / 清空 + 下载（图片 / JSON）+ 只读态保存。
 * 从 FlowDesigner 抽出的纯展示编排子组件，画布操作仍由容器（useLogicFlowCanvas）持有，经 props 入、回调出。
 *
 * 与 Vue 版的差异：emit 事件改为具名回调 props（onZoomOut / onFitView ...）；
 * 具名插槽 `toolbar-extra` 改为 `toolbarExtra` render-prop（透出 lf / disabled）。
 *
 * @author warm
 */
export interface FlowDesignerToolbarProps {
  /** 当前步骤索引（仅 1=流程设计 时显示工具栏） */
  activeStep: number
  /** 仅画布模式（无基础信息页时，工具栏内提供保存按钮） */
  onlyDesignShow?: boolean
  /** 是否只读 */
  disabled?: boolean
  /** 底层 LogicFlow 实例（仅用于透出给 toolbarExtra） */
  lf?: any
  onZoomOut?: () => void
  onFitView?: () => void
  onZoomIn?: () => void
  onUndo?: () => void
  onRedo?: () => void
  onClear?: () => void
  onDownloadImage?: () => void
  onDownloadJson?: () => void
  onSave?: () => void
  /** 追加自定义工具栏按钮（等价 Vue 具名插槽 toolbar-extra，透出 lf / disabled） */
  toolbarExtra?: (ctx: { lf: any; disabled: boolean }) => React.ReactNode
}

export default function FlowDesignerToolbar(props: FlowDesignerToolbarProps) {
  const {
    activeStep,
    onlyDesignShow,
    disabled,
    lf,
    onZoomOut,
    onFitView,
    onZoomIn,
    onUndo,
    onRedo,
    onClear,
    onDownloadImage,
    onDownloadJson,
    onSave,
    toolbarExtra,
  } = props

  const { t } = useI18n()

  if (activeStep !== 1) {
    return <div className="design-toolbar" style={{ padding: '5px 0', textAlign: 'right' }} />
  }

  return (
    <div className="design-toolbar" style={{ padding: '5px 0', textAlign: 'right' }}>
      <div>
        <span className="toolbar-group">
          <WfTooltip title={t('flowDesigner.zoomOut')} align="b">
            <WfButton size="small" onClick={onZoomOut}>
              <SvgIcon iconClass="ep:zoom-out" />
            </WfButton>
          </WfTooltip>
          {/* 自适应：所有端均 fitView 显示全部节点（最大缩放 100%） */}
          <WfTooltip title={t('flowDesigner.fitView')} align="b">
            <WfButton size="small" onClick={onFitView}>
              <SvgIcon iconClass="ep:rank" />
            </WfButton>
          </WfTooltip>
          <WfTooltip title={t('flowDesigner.zoomIn')} align="b">
            <WfButton size="small" onClick={onZoomIn}>
              <SvgIcon iconClass="ep:zoom-in" />
            </WfButton>
          </WfTooltip>
        </span>
        <span className="toolbar-group">
          <WfTooltip title={t('flowDesigner.undo')} align="b">
            <WfButton size="small" onClick={onUndo}>
              <SvgIcon iconClass="ep:d-arrow-left" />
            </WfButton>
          </WfTooltip>
          <WfTooltip title={t('flowDesigner.redo')} align="b">
            <WfButton size="small" onClick={onRedo}>
              <SvgIcon iconClass="ep:d-arrow-right" />
            </WfButton>
          </WfTooltip>
          <WfTooltip title={t('flowDesigner.clear')} align="b">
            <WfButton size="small" onClick={onClear}>
              <SvgIcon iconClass="ep:delete" />
            </WfButton>
          </WfTooltip>
        </span>
        <span className="toolbar-group">
          <WfTooltip title={t('flowDesigner.downloadImage')} align="b">
            <WfButton size="small" onClick={onDownloadImage}>
              <SvgIcon iconClass="ep:picture" />
            </WfButton>
          </WfTooltip>
          <WfTooltip title={t('flowDesigner.downloadJson')} align="b">
            <WfButton size="small" onClick={onDownloadJson}>
              <SvgIcon iconClass="ep:download" />
            </WfButton>
          </WfTooltip>
        </span>
        {onlyDesignShow && !disabled ? (
          <span className="toolbar-group">
            <WfTooltip title={t('common.save')} align="b">
              <WfButton size="small" className="toolbar-save-btn" onClick={onSave}>
                <SvgIcon iconClass="save" style={{ width: '14px', height: '14px' }} />
              </WfButton>
            </WfTooltip>
          </span>
        ) : null}
        {/* toolbarExtra 追加自定义工具栏按钮（透出底层 lf / disabled） */}
        {toolbarExtra ? toolbarExtra({ lf, disabled: !!disabled }) : null}
      </div>
    </div>
  )
}
