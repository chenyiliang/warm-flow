import {
  forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState,
} from 'react'
import { WfDrawer } from '@/ui/components'
import Start from './Start'
import Between from './Between'
import Gateway from './Gateway'
import End from './End'
import Skip from './Skip'
import type { BetweenHandle } from './Between'
import type { SkipHandle } from './Skip'
import { useI18n } from '@/i18n'

/**
 * 节点 / 边属性抽屉（React 版，移植自 common/vue/propertySetting.vue）。
 *
 * 按当前选中元素的 type 分发到对应属性面板（start / between / serial|parallel|inclusive / end / skip），
 * 抽屉关闭前做表单校验，并把表单值实时写回 LogicFlow（`lf.setProperties` / `lf.updateText`）。
 *
 * 与 Vue 版的关键差异（本文件是移植中最需要注意语义的一处）：
 * - **12 个 `watch(form.xxx)` 收敛为 1 个同步 effect**：Vue 版对 nodeName / skipType /
 *   collaborativeWay / nodeRatio / permissionFlag / anyNodeSkip / listenerRows / formCustom /
 *   formPath / skipName / skipCondition / ext 各写一个 watch 分别调 setProperties；
 *   React 版在 form 变化时统一 diff 出「需要同步到画布的属性」一次性写回，减少重复调用。
 *   其中 nodeName / skipName 额外要 `lf.updateText`（改的是节点文本，不是 properties）。
 * - **抽屉开关**：Vue 版 `v-model="drawer"` + `defineExpose({show, handleClose})`；React 版
 *   同样用 forwardRef 暴露 show / handleClose，内部 open state 控制。
 * - **动态组件**：Vue `<component :is="componentType">` -> React 的 `PANEL_MAP[type]` 取组件后
 *   `createElement`，语义等价（serial / parallel / inclusive 共用 Gateway）。
 * - `destroy-on-close` -> 关闭时卸载面板（条件渲染），保证下次打开是干净实例。
 *
 * @author warm
 */
export interface PropertySettingProps {
  /** 当前选中的节点 / 边 model（null 表示未选中） */
  node?: Record<string, any> | null
  /** LogicFlow 实例 */
  lf?: any
  /** 只读 */
  disabled?: boolean
  /** 是否显示跳转条件（串行 / 包含网关的出边才显示） */
  skipConditionShow?: boolean
  /** 画布节点列表 */
  nodes?: any[]
  /** 画布边列表 */
  skips?: any[]
  /** 自定义表单路径树 */
  formPathList?: any[]
  /** 透传给属性面板的自定义扩展点（等价 Vue 的全插槽转发） */
  nodeFormExtra?: (ctx: { form: Record<string, any>; disabled: boolean }) => React.ReactNode
}

/** PropertySetting 通过 ref 暴露的契约（对齐 Vue defineExpose({ show, handleClose })） */
export interface PropertySettingHandle {
  /** 打开抽屉（可选传 skipConditionShow 覆盖 props） */
  show: (skipConditionShow?: boolean) => void
  /** 关闭抽屉（含校验；由 blank:click 或抽屉自身关闭按钮触发） */
  handleClose: () => Promise<void>
}

// 节点类型 -> 属性面板组件（三类网关共用 Gateway）
const PANEL_MAP: Record<string, any> = {
  start: Start,
  between: Between,
  serial: Gateway,
  parallel: Gateway,
  inclusive: Gateway,
  end: End,
  skip: Skip,
}

/**
 * 把 LogicFlow 节点 / 边 model 装配成属性面板的表单值。
 *
 * 逐行对齐 Vue 版 `watch(() => props.node)` 的两条分支（skip 边 / 普通节点），
 * 包括 skipCondition 的 `@@` / `|` 解析、nodeRatio 的类型与值拆分、
 * collaborativeWay 的兜底推断、listenerRows 的拆分。
 */
function buildForm(n: any, formPathList: any[]): Record<string, any> {
  if (!n) return {}

  if (n.type === 'skip') {
    const skipCondition = n.properties?.skipCondition
    let condition: string | undefined
    let conditionType: string | undefined
    let conditionValue = ''
    if (skipCondition) {
      const conditionSpl = skipCondition.split('@@')
      if (/^spel/.test(skipCondition) || /^default/.test(skipCondition) || /^snel/.test(skipCondition)) {
        conditionType = conditionSpl && conditionSpl.length > 0 ? conditionSpl[0] : ''
        conditionValue = conditionSpl && conditionSpl.length > 1 ? conditionSpl[1] : ''
      } else {
        conditionType = conditionSpl && conditionSpl.length > 0 ? conditionSpl[0] : ''
        const conditionOneSpl = (conditionSpl[1] ?? '').split('|')
        condition = conditionOneSpl && conditionOneSpl.length > 0 ? conditionOneSpl[0] : ''
        conditionValue = conditionOneSpl && conditionOneSpl.length > 1 ? conditionOneSpl[1] : ''
      }
    }
    return {
      nodeType: n.type,
      skipType: n.properties?.skipType,
      skipName: n.text instanceof Object ? n.text.value : n.text,
      skipCondition,
      condition,
      conditionType,
      conditionValue,
    }
  }

  // 普通节点
  const properties = { ...(n.properties ?? {}) }
  const nodeRatio = properties.nodeRatio || '0'
  // collaborativeWay 兜底推断（对齐 Vue 版：0->或签, 100->会签, 其它比例->票签）
  if (!properties.collaborativeWay) {
    properties.collaborativeWay =
      parseFloat(nodeRatio) === 0
        ? '1'
        : parseFloat(nodeRatio) === 100
          ? '3'
          : nodeRatio
            ? '2'
            : '1'
  }
  if (properties.collaborativeWay === '2' && !properties.nodeRatio) properties.nodeRatio = '50'

  // nodeRatio 拆成「策略类型 + 值」（passCount=xx / spel@@xx / 纯比例）
  let nodeRatioType = 'passRatio'
  let nodeRatioValue = ''
  if (nodeRatio) {
    if (/^passCount|rejectCount/.test(nodeRatio)) {
      const [type, val] = nodeRatio.split('=')
      nodeRatioType = type
      nodeRatioValue = val
    } else if (/^spel|default|snel/.test(nodeRatio)) {
      const [type, val] = nodeRatio.split('@@')
      nodeRatioType = type
      nodeRatioValue = val
    } else {
      nodeRatioValue = nodeRatio
    }
  }

  // formCustom 兜底（对齐 Vue 版：空 properties -> 'N'；有自定义表单树 -> 'Y'）
  properties.formCustom =
    JSON.stringify(n.properties ?? {}) === '{}'
      ? 'N'
      : properties.formCustom
        ? properties.formCustom
        : formPathList && formPathList.length > 0
          ? 'Y'
          : 'N'

  // 监听器拆行
  const listenerTypes = properties.listenerType ? properties.listenerType.split(',') : []
  const listenerPaths = properties.listenerPath ? properties.listenerPath.split('@@') : []
  properties.listenerRows =
    listenerTypes && listenerTypes.length > 0
      ? listenerTypes.map((type: string, index: number) => ({
          listenerType: type,
          listenerPath: listenerPaths[index],
        }))
      : [{}]

  return {
    nodeType: n.type,
    nodeCode: n.id,
    ext: properties.ext ? properties.ext : {},
    ...properties,
    nodeName: n.text instanceof Object ? n.text.value : n.text,
    nodeRatioType,
    nodeRatioValue,
  }
}

/** 监听器行数组 -> 后端字符串（逗号 / @@ 分隔） */
function serializeListenerRows(rows: any): { listenerType?: string; listenerPath?: string } {
  if (!Array.isArray(rows)) return {}
  return {
    listenerType: rows.map((e) => e?.listenerType ?? '').join(','),
    listenerPath: rows.map((e) => e?.listenerPath ?? '').join('@@'),
  }
}

const PropertySetting = forwardRef<PropertySettingHandle, PropertySettingProps>((props, ref) => {
  const {
    node = null,
    lf,
    disabled = false,
    skipConditionShow: skipConditionShowProp = true,
    nodes = [],
    skips = [],
    formPathList = [],
    nodeFormExtra,
  } = props

  const { t } = useI18n()

  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<Record<string, any>>({})
  const [skipConditionShow, setSkipConditionShow] = useState(skipConditionShowProp)

  // 抽屉打开时的防抖标记：防止 blank:click 立即把刚打开的抽屉关掉（对齐 Vue 版 lastOpenTime）
  const lastOpenTimeRef = useRef(0)
  // 当前正在编辑的元素 id（用于 setProperties / updateText / changeNodeId）
  const objIdRef = useRef<any>(undefined)
  // 面板 ref（校验用）
  const panelRef = useRef<any>(null)
  // 响应式窗口宽度：手机端抽屉全屏
  const [windowWidth, setWindowWidth] = useState(
    () => (typeof window !== 'undefined' ? window.innerWidth : 1024)
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    const onResize = () => setWindowWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // 抽屉宽度：手机端全屏，桌面端 37%（对齐 Vue 版 drawerSize）
  const drawerSize = windowWidth <= 768 ? '100%' : '37%'

  // 抽屉标题（按元素类型）
  const title = useMemo(() => {
    if (!node || !node.type) return t('property.titleBetween')
    switch (node.type) {
      case 'skip':
        return t('property.titleEdge')
      case 'serial':
        return t('property.titleSerial')
      case 'parallel':
        return t('property.titleParallel')
      case 'inclusive':
        return t('property.titleInclusive')
      case 'start':
        return t('property.titleStart')
      case 'end':
        return t('property.titleEnd')
      default:
        return t('property.titleBetween')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node?.type, t])

  // 当前类型对应的面板组件
  const Panel = node?.type ? PANEL_MAP[node.type] : undefined

  /**
   * 选中元素变化时装配表单（对齐 Vue 版 watch(() => props.node)）。
   * 用 node 的 id + 类型作为依赖键，避免每次父级重渲染都重置用户正在编辑的内容。
   */
  const nodeKey = node ? `${node.id ?? ''}|${node.type ?? ''}` : ''
  useEffect(() => {
    if (!node) return
    objIdRef.current = node.id
    setForm(buildForm(node, formPathList))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeKey])

  /**
   * 表单值变化 -> 写回 LogicFlow。
   *
   * 收敛 Vue 版的 12 个独立 watch：这里统一装配「要写进 properties 的字段」，
   * 一次 setProperties 完成；nodeName / skipName 另外走 updateText（改的是文本不是属性）。
   *
   * 首次装配（form 刚由 buildForm 填入）时也会触发一次，但写入的是相同值，
   * LogicFlow 幂等，无副作用；这也是 Vue 版 watch 的既有行为。
   */
  useEffect(() => {
    if (!lf || !objIdRef.current || !open) return
    const isSkip = node?.type === 'skip'

    const properties: Record<string, any> = {
      ext: form.ext ?? {},
      formCustom: form.formCustom ?? '',
      formPath: form.formPath,
      anyNodeSkip: form.anyNodeSkip,
      nodeRatio: form.nodeRatio,
      // permissionFlag 数组 -> 后端 @@ 分隔字符串（过滤空项，对齐 Vue 版）
      permissionFlag: Array.isArray(form.permissionFlag)
        ? form.permissionFlag.filter((e: any) => e).join('@@')
        : form.permissionFlag,
      ...serializeListenerRows(form.listenerRows),
    }
    if (isSkip) {
      properties.skipType = form.skipType
      properties.skipCondition = form.skipCondition
      properties.skipName = form.skipName
      // 节点文本：边名
      if (form.skipName != null) lf.updateText(objIdRef.current, form.skipName)
    } else {
      properties.collaborativeWay = form.collaborativeWay
      properties.nodeName = form.nodeName
      // 节点文本：节点名
      if (form.nodeName != null) lf.updateText(objIdRef.current, form.nodeName)
    }

    // 只写有定义的字段，避免把 undefined 覆盖进 properties
    const cleanProps: Record<string, any> = {}
    Object.keys(properties).forEach((k) => {
      if (properties[k] !== undefined) cleanProps[k] = properties[k]
    })
    lf.setProperties(objIdRef.current, cleanProps)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, open, node?.type])

  /** 打开抽屉 */
  const show = useCallback((conditionShow?: boolean) => {
    lastOpenTimeRef.current = Date.now()
    if (typeof conditionShow === 'boolean') setSkipConditionShow(conditionShow)
    if (window._markDrawerOpen) window._markDrawerOpen()
    setOpen(true)
  }, [])

  /** 真正关闭抽屉 + 处理节点编码改名（对齐 Vue 版 handleDrawer） */
  const closeDrawer = useCallback(() => {
    const nodeCode = form.nodeCode
    const objId = objIdRef.current
    if (nodeCode && objId && lf) {
      if (node?.type === 'skip') {
        if (!lf.getEdgeModelById(nodeCode)) lf.changeEdgeId(objId, nodeCode)
      } else {
        if (!lf.getNodeModelById(nodeCode)) lf.changeNodeId(objId, nodeCode)
      }
    }
    setOpen(false)
    // 延迟解除标志位（由 useLogicFlowCanvas 的 _markDrawerClosed 统一管理关闭后的画布适配）
    if (window._markDrawerClosed) window._markDrawerClosed()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.nodeCode, lf, node?.type])

  /** 关闭（含校验）：面板校验失败则不关闭 */
  const handleClose = useCallback(async () => {
    // 防抖：刚打开 200ms 内的 blank:click 不执行关闭
    if (Date.now() - lastOpenTimeRef.current < 200) return
    if (!open) return
    if (!disabled && typeof panelRef.current?.validate === 'function') {
      const valid = await panelRef.current.validate()
      if (!valid) return
    }
    closeDrawer()
  }, [open, disabled, closeDrawer])

  useImperativeHandle(ref, () => ({ show, handleClose }), [show, handleClose])

  /** 面板表单值变更：更新本地 form（写回画布由上方 effect 统一处理） */
  const handlePanelChange = useCallback((next: Record<string, any>) => {
    setForm(next)
  }, [])

  if (!Panel) return null

  return (
    <WfDrawer
      className="property-drawer-modern"
      title={title}
      open={open}
      visible={open}
      placement="right"
      direction="rtl"
      size={drawerSize}
      width={drawerSize}
      onClose={handleClose}
    >
      {open ? (
        <Panel
          ref={panelRef}
          value={form}
          disabled={disabled}
          skipConditionShow={skipConditionShow}
          nodes={nodes}
          skips={skips}
          formPathList={formPathList}
          onChange={handlePanelChange}
          nodeFormExtra={nodeFormExtra}
        />
      ) : null}
    </WfDrawer>
  )
})

PropertySetting.displayName = 'PropertySetting'

export default PropertySetting

// 类型 re-export，便于消费方标注面板 ref
export type { BetweenHandle, SkipHandle }
