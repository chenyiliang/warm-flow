import { useEffect, useRef, useState, useCallback } from 'react'
import { handlerFeedback } from '@/api/flow/definition'
import { useI18n } from '@/i18n'

/**
 * 仿钉钉模式的自定义节点卡片（React 版，移植自 mimic/vue/baseNode.vue）。
 *
 * 由 BaseNodeView（LogicFlow HtmlNode）通过 createRoot 渲染进画布节点 DOM。
 * 承载：节点名（可双击改名）、办理人展示、编辑 / 删除入口，并按「设计态 / 运行态 / 只读态」切换配色与可编辑性。
 *
 * 与 Vue 版的实现差异：
 * - **点击外部用原生事件监听**（`useEffect` + document mousedown）替代 Vue 的 `v-click-outside` 指令；
 * - `permissionFlag` 变化触发 `handlerFeedback` 用 `useEffect` 替代 Vue 的 `watch(..., {immediate})`；
 * - props 默认值在解构处给出（Vue 用 withDefaults）。
 * - 事件通过回调 props（onUpdateNodeName / onEditNode / onDeleteNode）上抛，等价 Vue 的 emit。
 *
 * 样式沿用 Vue 版的 scoped 规则（迁到本模块 index.scss），类名一致（base-node / top-section / bottom-section）。
 *
 * @author warm
 */
export interface BaseNodeProps {
  /** 节点文本（节点名） */
  text?: string
  /** 办理人权限标识（@@ 分隔） */
  permissionFlag?: string
  /** 实例进度图状态色（有值=运行态） */
  chartStatusColor?: any[]
  /** 节点状态 */
  status?: number | null
  /** 节点类型 */
  type?: string
  /** 填充色 */
  fill?: string
  /** 描边色 */
  stroke?: string
  /** 节点名变更后回调（等价 Vue emit('updateNodeName')） */
  onUpdateNodeName?: (nodeName: string) => void
  /** 点击编辑节点回调（等价 Vue emit('editNode')） */
  onEditNode?: () => void
  /** 删除节点回调（等价 Vue emit('deleteNode')） */
  onDeleteNode?: () => void
}

// 设计态头部按节点类型区分（开始=绿 / 结束=红 / 其余审批=蓝），不再全蓝
const DESIGN_HEADER_GRADIENT: Record<string, string> = {
  start: 'linear-gradient(135deg, #67c23a 0%, #5daf34 100%)',
  end: 'linear-gradient(135deg, #f56c6c 0%, #e85c5c 100%)',
}

export default function BaseNode(props: BaseNodeProps) {
  const {
    text = '',
    permissionFlag = '',
    chartStatusColor = [],
    status = null,
    type = '',
    fill = '',
    stroke = '',
    onUpdateNodeName,
    onEditNode,
    onDeleteNode,
  } = props

  const { t } = useI18n()

  const [showSpan, setShowSpan] = useState(true)
  const [nodeName, setNodeName] = useState<string>(text || t('baseNode.initiator'))
  const [handler, setHandler] = useState<string>(t('baseNode.everyone'))
  const [editingNodeName, setEditingNodeName] = useState(false)

  const topRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // 运行态（流程实例查看，chartStatusColor 有三原色）保留状态语义色；设计态走钉钉蓝卡片风格
  const isRuntime = !!(chartStatusColor && chartStatusColor.length > 0)
  // 设计器只读态（预览 / 已发布）：由 FlowDesigner 渲染前置位的全局标志判定
  const isReadonly = typeof window !== 'undefined' && !!window.__WF_DESIGNER_DISABLED__
  // 是否允许编辑节点（非运行态且非只读态）
  const canEdit = !isRuntime && !isReadonly

  // text 变化同步到本地 nodeName（对齐 Vue watch(props.text, {immediate})）
  useEffect(() => {
    if (text) setNodeName(text)
  }, [text])

  // permissionFlag 变化拉取办理人名（对齐 Vue watch(props.permissionFlag, {immediate})）
  useEffect(() => {
    if (permissionFlag) {
      handlerFeedback({ storageIds: permissionFlag.split('@@') })
        .then((response: any) => {
          if (response.code === 200 && response.data) {
            setHandler(response.data.map((item: any) => item.handlerName).join('、'))
          }
        })
        .catch(() => {})
    } else {
      setHandler(t('baseNode.everyone'))
    }
    // t 依赖 locale，随语言切换重建；permissionFlag 变化才重新请求
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permissionFlag])

  // 点击外部退出改名态（替代 Vue v-click-outside="handleLeave"）
  useEffect(() => {
    if (!editingNodeName) return
    const onDocMouseDown = (e: MouseEvent) => {
      if (topRef.current && !topRef.current.contains(e.target as Node)) {
        setEditingNodeName(false)
        setShowSpan(true)
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [editingNodeName])

  // 进入改名态后自动聚焦输入框
  useEffect(() => {
    if (editingNodeName && inputRef.current) {
      inputRef.current.focus()
    }
  }, [editingNodeName])

  const editNodeName = useCallback(() => {
    if (!canEdit) return
    setEditingNodeName(true)
    setShowSpan(false)
  }, [canEdit])

  const saveNodeName = useCallback(() => {
    if (!canEdit) return
    setEditingNodeName(false)
    setShowSpan(true)
    onUpdateNodeName?.(nodeName)
  }, [canEdit, nodeName, onUpdateNodeName])

  const baseNodeStyle: React.CSSProperties = isRuntime
    ? { border: (status === 1 ? '2px dashed ' : '1px solid ') + (stroke || 'rgb(166,178,189)') }
    : { background: 'var(--wf-bg-white, #fff)' }

  const topSectionStyle: React.CSSProperties = isRuntime
    ? { backgroundColor: stroke || 'rgb(166,178,189)' }
    : {
        background:
          DESIGN_HEADER_GRADIENT[type] || 'linear-gradient(135deg, #409eff 0%, #2b7de9 100%)',
      }

  return (
    <div style={baseNodeStyle} className="base-node">
      <div style={topSectionStyle} className="top-section" ref={topRef}>
        {showSpan ? (
          <span onClick={editNodeName}>
            {nodeName}
            {canEdit ? (
              <svg
                className="edit-icon"
                viewBox="0 0 1024 1024"
                version="1.1"
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
              >
                <path
                  d="M469.333333 128a42.666667 42.666667 0 0 1 0 85.333333H213.333333v597.333334h597.333334v-256l0.298666-4.992A42.666667 42.666667 0 0 1 896 554.666667v256a85.333333 85.333333 0 0 1-85.333333 85.333333H213.333333a85.333333 85.333333 0 0 1-85.333333-85.333333V213.333333a85.333333 85.333333 0 0 1 85.333333-85.333333z m414.72 12.501333a42.666667 42.666667 0 0 1 0 60.330667L491.861333 593.066667a42.666667 42.666667 0 0 1-60.330666-60.330667l392.192-392.192a42.666667 42.666667 0 0 1 60.330666 0z"
                  fill="#000000"
                />
              </svg>
            ) : null}
          </span>
        ) : null}
        {editingNodeName ? (
          <input
            ref={inputRef}
            value={nodeName}
            onChange={(e) => setNodeName(e.target.value)}
            onBlur={saveNodeName}
          />
        ) : null}
        {type === 'between' && canEdit ? (
          <span
            className="delete-btn"
            onClick={(e) => {
              e.stopPropagation()
              onDeleteNode?.()
            }}
          >
            ✕
          </span>
        ) : null}
      </div>
      <div className="bottom-section" onClick={() => onEditNode?.()} title={handler}>
        {handler}
      </div>
    </div>
  )
}
