import SvgIcon from '@/components/SvgIcon'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/i18n'

/**
 * 仿钉钉模式边「+」浮层（React 版，移植自 mimic/vue/EdgeTooltip.vue）。
 *
 * 鼠标进入边时弹出，提供「审批节点 / 互斥 / 并行 / 包含网关」四个快捷加节点入口。
 * 点击后由 FlowDesigner 调 addBetweenNode / addGatewayNode 在边上插入节点。
 *
 * 与 Vue 版的差异：
 * - `computed` 样式 -> 每次渲染直接算（tooltipStyle 依赖 themeColors，随暗黑切换重建）；
 * - emit('option-click') / emit('close-tooltip') -> onOptionClick / onCloseTooltip 回调 props；
 * - `useDark()` -> `useTheme()`（React 版命名）。
 *
 * hover 期间通过 `window.isTooltipHovered` 标记，避免鼠标从边移到浮层途中被 hide:EdgeTooltip 误关。
 *
 * @author warm
 */
export interface EdgeTooltipProps {
  /** 浮层位置（画布坐标） */
  position?: { x: number; y: number }
  /** 关联的边 model */
  tooltipEdge?: Record<string, any>
  /** 点击某个快捷选项（item 上附带 tooltipEdge） */
  onOptionClick?: (item: any) => void
  /** 鼠标离开浮层，请求关闭 */
  onCloseTooltip?: () => void
}

export default function EdgeTooltip(props: EdgeTooltipProps) {
  const { position = { x: 0, y: 0 }, tooltipEdge = {}, onOptionClick, onCloseTooltip } = props

  const { themeColors } = useTheme()
  const { t } = useI18n()

  // 四个快捷入口：审批节点 + 三类网关（icon 对应 wf 图标集里的节点图标名）
  const options = [
    { icon: 'between', label: t('edgeTooltip.approval') },
    { icon: 'serial', label: t('sidebar.serial') },
    { icon: 'parallel', label: t('sidebar.parallel') },
    { icon: 'inclusive', label: t('sidebar.inclusive') },
  ]

  /** 浮层样式：跟随主题色（暗黑模式自动切换） */
  const tooltipStyle: React.CSSProperties = {
    top: `${position.y}px`,
    left: `${position.x + 20}px`,
    position: 'absolute',
    pointerEvents: 'auto',
    backgroundColor: themeColors.tooltipBg,
    border: `1px solid ${themeColors.tooltipBorder}`,
    borderRadius: '12px',
    boxShadow: themeColors.tooltipShadow,
    padding: '6px',
    fontSize: '13px',
    zIndex: 1000,
    color: themeColors.tooltipColor,
    display: 'flex',
    width: 'max-content',
  }

  const handleTooltipEnter = () => {
    window.isTooltipHovered = true
  }

  const handleTooltipLeave = () => {
    window.isTooltipHovered = false
    onCloseTooltip?.()
  }

  const handleClick = (item: any) => {
    // 附带当前边 model，供 FlowDesigner 定位插入位置
    onOptionClick?.({ ...item, tooltipEdge })
  }

  return (
    <div style={tooltipStyle} onMouseEnter={handleTooltipEnter} onMouseLeave={handleTooltipLeave}>
      <div className="tooltip-container">
        {options.map((item, index) => (
          <div key={index} className="tooltip-item" onClick={() => handleClick(item)}>
            <SvgIcon iconClass={item.icon} className="tooltip-icon" />
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
