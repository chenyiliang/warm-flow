import { useMemo } from 'react'
import {
  startIcon, betweenIcon, endIcon,
  serialIcon, parallelIcon, inclusiveIcon,
} from '@/components/design/classics/js/sidebarIcons'
import type { PaletteNode } from '@/designer/types'
import { useI18n } from '@/i18n'

/**
 * 经典模式左侧拖拽面板（React 版，移植自 common/vue/DiagramSidebar.vue）。
 *
 * 浮动卡片，列出可拖入画布的节点：基础组（开始 / 中间 / 结束）+ 网关组（互斥 / 并行 / 包含）。
 * mousedown 时调用宿主传入的 onDragInNode，由容器转成 lf.dnd.startDrag。
 *
 * 与 Vue 版的差异：
 * - `computed` 默认节点列表 -> `useMemo`（依赖 t，随语言切换重建）；
 * - `v-html="item.icon"` -> `dangerouslySetInnerHTML`（图标为可信的内置 SVG 字符串，
 *   与 Vue 版 v-html 同等风险面；消费方自定义 paletteNodes 时同理需自担 icon 来源可信）；
 * - emit('dragInNode') -> onDragInNode 回调 prop。
 *
 * @author warm
 */
export interface DiagramSidebarProps {
  /** 基础节点组（不传用内置默认：开始 / 中间 / 结束；传 [] 隐藏该组） */
  flowNodes?: PaletteNode[]
  /** 网关节点组（不传用内置默认：互斥 / 并行 / 包含；传 [] 隐藏网关组） */
  gatewayNodes?: PaletteNode[]
  /** 拖拽开始（等价 Vue emit('dragInNode')） */
  onDragInNode?: (type: string, properties: Record<string, any>, text: any) => void
}

export default function DiagramSidebar(props: DiagramSidebarProps) {
  const { flowNodes, gatewayNodes, onDragInNode } = props
  const { t } = useI18n()

  const defaultFlowNodes = useMemo<PaletteNode[]>(
    () => [
      { type: 'start', text: t('sidebar.start'), label: t('sidebar.start'), icon: startIcon },
      {
        type: 'between',
        text: t('sidebar.between'),
        label: t('sidebar.between'),
        icon: betweenIcon,
        properties: { collaborativeWay: '1' },
      },
      { type: 'end', text: t('sidebar.end'), label: t('sidebar.end'), icon: endIcon },
    ],
    // t 随 locale 变化（useI18n 订阅），故语言切换会重建列表
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t]
  )

  const defaultGatewayNodes = useMemo<PaletteNode[]>(
    () => [
      { type: 'serial', text: '', label: t('sidebar.serial'), icon: serialIcon, properties: {} },
      { type: 'parallel', text: '', label: t('sidebar.parallel'), icon: parallelIcon, properties: {} },
      { type: 'inclusive', text: '', label: t('sidebar.inclusive'), icon: inclusiveIcon, properties: {} },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t]
  )

  // 传 [] 隐藏该组（?? 只在不传时回落默认，保留「显式传 [] 隐藏」语义）
  const effectiveFlowNodes = flowNodes ?? defaultFlowNodes
  const effectiveGatewayNodes = gatewayNodes ?? defaultGatewayNodes

  const handleDragInNode = (item: PaletteNode) => {
    onDragInNode?.(item.type, item.properties || {}, item.text || {})
  }

  const renderItem = (item: PaletteNode) => (
    <div
      key={item.type}
      className={`sidebar-item item-${item.type}`}
      onMouseDown={() => handleDragInNode(item)}
    >
      {item.icon ? (
        <div
          className="item-icon-wrap"
          dangerouslySetInnerHTML={{ __html: item.icon }}
        />
      ) : null}
      <span className="item-label">{item.label}</span>
    </div>
  )

  return (
    <div className="diagram-sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title">{t('sidebar.baseNodes')}</span>
      </div>
      <div className="sidebar-content">
        {/* 基础流程节点组 */}
        <div className="node-group">{effectiveFlowNodes.map(renderItem)}</div>

        {/* 分隔线（仅有网关节点时显示） */}
        {effectiveGatewayNodes.length ? <div className="sidebar-divider" /> : null}

        {/* 网关节点组标题（仅有网关节点时显示） */}
        {effectiveGatewayNodes.length ? (
          <div className="group-header">
            <span className="group-title">{t('sidebar.gatewayNodes')}</span>
          </div>
        ) : null}

        {/* 网关节点组 */}
        {effectiveGatewayNodes.length ? (
          <div className="node-group">{effectiveGatewayNodes.map(renderItem)}</div>
        ) : null}
      </div>
    </div>
  )
}
