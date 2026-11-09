import {
  forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState,
} from 'react'
import { getUiAdapter } from '@/ui/uiAdapter'
import { queryDef, saveJson } from '@/api/flow/definition'
import {
  getPreviousNodes, isClassics, isGateWay, json2LogicFlowJson, logicFlowJsonToWarmFlow,
} from '@/components/design/common/js/tool'
import {
  addBetweenNode, addGatewayNode, gatewayAddNode, removeNode,
} from '@/components/design/mimic/js/mimic'
import initClassicsData from '@/components/design/classics/initClassicsData.json'
import initMimicData from '@/components/design/mimic/initMimicData.json'
import FlowDesignerHeader from './FlowDesignerHeader'
import FlowDesignerToolbar from './FlowDesignerToolbar'
import DiagramSidebar from '@/components/design/common/react/DiagramSidebar'
import BaseInfo from '@/components/design/common/react/BaseInfo'
import type { BaseInfoHandle } from '@/components/design/common/react/BaseInfo'
import PropertySetting from '@/components/design/common/react/PropertySetting'
import type { PropertySettingHandle } from '@/components/design/common/react/PropertySetting'
import EdgeTooltip from '@/components/design/mimic/react/EdgeTooltip'
import { useLogicFlowCanvas } from '@/hooks/useLogicFlowCanvas'
import { useI18n } from '@/i18n'
import type {
  FlowDesignerProps, FlowDesignerInstance, FlowDesignerSavedPayload,
  FlowDesignerReadyPayload, FlowDesignerBeforeSavePayload, FlowDesignerChangePayload,
  FlowDesignerValidateErrorPayload, FlowDesignerNodeClickPayload, FlowStructureValidateResult,
} from '@/designer/types'

/**
 * 可复用流程设计器组件（React 版，移植自 Vue 的 components/design/FlowDesigner.vue）。
 *
 * 画布核心从「直接读 URL/appParams」改为「props 驱动」，宿主耦合（URL 主题、postMessage、关闭）
 * 由外层页面壳负责，组件本身可被业务方直接 import 使用。
 *
 * 与 Vue 版的实现差异（移植要点）：
 * - **响应式 state -> React state/ref**：渲染相关的（activeStep / loading / isEmpty / sidebarVisible /
 *   dirty / tooltip）用 `useState`；命令式读写、不想触发渲染的（logicJson / jsonString / nodes / skips /
 *   nodeClick / canvasReady / validateSource）用 `useRef` 盒子，与 useLogicFlowCanvas 的 MutableBox 对齐。
 * - **defineExpose -> forwardRef + useImperativeHandle**：暴露同名的 FlowDesignerInstance 命令式 API。
 * - **emit('xxx') -> onXxx 回调 props**（React 惯用），事件名与 payload 结构与 Vue 版一致。
 * - **具名插槽 -> render-prop**（headerLeft / sidebar / loading / empty / toolbarExtra）。
 * - `proxy.$nextTick` -> `requestAnimationFrame` / `setTimeout(0)`；`watch(activeStep)` -> `useEffect([activeStep])`。
 *
 * @author warm
 */
export interface FlowDesignerReactProps extends FlowDesignerProps {
  // —— 事件：Vue 的 emit -> React 的 onXxx 回调 ——
  /** 设计器请求关闭（保存成功后自动触发，宿主据此关闭弹窗 / 返回列表） */
  onClose?: () => void
  /** 保存成功：回传当前定义 id、后端返回数据与本次保存的流程 json */
  onSaved?: (payload: FlowDesignerSavedPayload) => void
  /** 画布初始化完成，透出底层 LogicFlow 实例 */
  onReady?: (payload: FlowDesignerReadyPayload) => void
  /** 保存提交前（同步），可改写 json 或取消本次保存 */
  onBeforeSave?: (payload: FlowDesignerBeforeSavePayload) => void
  /** 画布图数据变更（基于 LogicFlow history:change，初次渲染不触发），带惰性 getter */
  onChange?: (payload: FlowDesignerChangePayload) => void
  /** 未保存状态翻转 */
  onDirty?: (dirty: boolean) => void
  /** 基础信息表单校验未通过 */
  onValidateError?: (payload: FlowDesignerValidateErrorPayload) => void
  /** 画布节点被点击 */
  onNodeClick?: (payload: FlowDesignerNodeClickPayload) => void
  /** 受控 json 回写（配合 json prop，仅 json 受控时派发） */
  onJsonChange?: (json: string) => void
  // —— 插槽：Vue 具名插槽 -> render-prop ——
  /** 替换顶部导航左侧（透出 flowName） */
  headerLeft?: (ctx: { flowName?: string }) => React.ReactNode
  /** 替换顶部导航中间步骤区 */
  headerCenter?: (ctx: any) => React.ReactNode
  /** 替换顶部导航右侧操作区 */
  headerActions?: (ctx: { save: () => void; disabled: boolean }) => React.ReactNode
  /** 整体替换左侧拖拽面板（透出 dragInNode / lf / disabled） */
  sidebar?: (ctx: {
    dragInNode: (type: string, properties?: Record<string, any>, text?: string) => void
    lf: any
    disabled: boolean
  }) => React.ReactNode
  /** 追加自定义工具栏按钮（透出 lf / disabled） */
  toolbarExtra?: (ctx: { lf: any; disabled: boolean }) => React.ReactNode
  /**
   * 节点属性面板的自定义表单项扩展点（透出 { form, disabled }）。
   * 等价 Vue 版的 `#node-form-extra` 具名插槽——Vue 把全部插槽透传给 PropertySetting 再转给
   * start/between/end/gateway/skip 各面板；React 无「全部插槽」概念，收敛为这一个最常用的扩展点。
   */
  nodeFormExtra?: (ctx: { form: Record<string, any>; disabled: boolean }) => React.ReactNode
  /** 自定义加载态内容 */
  loadingSlot?: React.ReactNode
  /** 自定义空态内容 */
  emptySlot?: React.ReactNode
}

const FlowDesigner = forwardRef<FlowDesignerInstance, FlowDesignerReactProps>((props, ref) => {
  const {
    definitionId: definitionIdProp = null,
    initialJson = null,
    disabled: disabledProp = false,
    onlyDesignShow: onlyDesignShowProp = false,
    showGrid = false,
    paletteNodes,
    json: jsonProp,
    structureValidator,
    onClose, onSaved, onReady, onBeforeSave, onChange, onDirty,
    onValidateError, onNodeClick, onJsonChange,
    headerLeft, headerCenter, headerActions, sidebar, toolbarExtra,
    nodeFormExtra,
    loadingSlot, emptySlot,
  } = props

  const { t } = useI18n()

  // —— 渲染态（useState）——
  const [activeStep, setActiveStep] = useState(0)
  const [sidebarVisible, setSidebarVisible] = useState(false)
  const [loading, setLoading] = useState(false)
  const [isEmpty, setIsEmpty] = useState(false)
  const [disabledState, setDisabledState] = useState(disabledProp)
  const [tooltipVisible, setTooltipVisible] = useState(false)
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 })
  // lf 存一份 state 仅用于把实例透给 toolbarExtra / sidebar render-prop 渲染
  const [lfState, setLfState] = useState<any>(null)
  /**
   * 属性抽屉 / 边浮层要渲染的数据，用 state 镜像一份。
   *
   * 为什么 ref + state 双份：initEvent 里的 LogicFlow 回调要**同步读最新值**（用 ref，避免闭包陈旧），
   * 而 PropertySetting / EdgeTooltip 是 React 子组件，props 变化必须**触发重渲染**才生效（用 state）。
   * 故每个字段两份：回调里同时写 ref 与 state，读的地方各取所需。
   * （Vue 版只需一个 ref，因为 ref 本身即响应式——这是 React 移植的典型差异。）
   */
  const [nodeClickState, setNodeClickState] = useState<any>(null)
  const [nodesState, setNodesState] = useState<any[]>([])
  const [skipsState, setSkipsState] = useState<any[]>([])
  const [skipConditionShowState, setSkipConditionShowState] = useState(true)
  const [tooltipEdgeState, setTooltipEdgeState] = useState<any>({})
  const [formPathListState, setFormPathListState] = useState<any[]>([])
  /**
   * logicJson 变更计数器：仅用于「触发重渲染」，其值本身无意义。
   *
   * 为什么需要：logicJson 是 useRef 盒子（画布/命令式回调要读最新值，不能用 state，
   * 否则闭包捕获旧值），但**改 ref.current 不会触发 React 重渲染**——而 Vue 版 logicJson 是
   * `ref()`，写 `.value` 会自动重渲染。故头部流程名、基础信息表单初值、经典/仿钉钉判定
   * 这些「渲染期要读 logicJson」的地方，必须在 mutation 后 bump 本计数器来补上这次渲染。
   *
   * 只有「渲染期会读 logicJson」的 mutation 才需要 bump；纯命令式路径（getBaseInfo /
   * getFlowJson 装配 json）不 bump，避免无谓重渲染打断画布。
   */
  const [logicJsonTick, setLogicJsonTick] = useState(0)
  /** 触发一次「logicJson 已变，请重渲染」信号 */
  const bumpLogicJson = useCallback(() => setLogicJsonTick((n) => n + 1), [])

  // —— 命令式态（useRef 盒子，不触发渲染；与 useLogicFlowCanvas 的 MutableBox 对齐）——
  const definitionIdRef = useRef<string | null>(definitionIdProp)
  const logicJson = useRef<Record<string, any>>({})
  const jsonString = useRef<any>('')
  const disabledRef = useRef<boolean>(disabledProp)
  const onlyDesignShowRef = useRef<boolean>(onlyDesignShowProp)
  const skipConditionShow = useRef(true)
  const nodes = useRef<any[]>([])
  const skips = useRef<any[]>([])
  const categoryList = useRef<any[]>([])
  const formPathList = useRef<any[]>([])
  const nodeClick = useRef<any>(null)
  const tooltipEdge = useRef<any>({})
  const dirty = useRef(false)
  const canvasReady = useRef(false)
  const validateSource = useRef<'save' | 'step' | 'api'>('save')

  const containerRef = useRef<HTMLDivElement>(null)
  const baseInfoRef = useRef<BaseInfoHandle>(null)
  // 属性抽屉：initEvent 里命令式调 show() / handleClose()
  const propertySettingRef = useRef<PropertySettingHandle>(null)

  // disabled / onlyDesignShow 同时维护 state（渲染）与 ref（回调读最新值）
  useEffect(() => {
    disabledRef.current = disabledState
  }, [disabledState])

  // 受控模式（传了 json prop）：仅此时回写 onJsonChange，避免未使用的消费方承担序列化开销
  const isJsonControlled = useCallback(() => jsonProp !== undefined, [jsonProp])

  // props 存盒子，供 useLogicFlowCanvas 的命令式回调读取最新值
  const propsRef = useRef<any>(props)
  propsRef.current = props

  // 事件回调存盒子：避免 initEvent / markDirty 等闭包捕获旧回调（等价 Vue 的 emit 稳定引用）
  const eventsRef = useRef({
    onClose, onSaved, onReady, onBeforeSave, onChange, onDirty,
    onValidateError, onNodeClick, onJsonChange,
  })
  eventsRef.current = {
    onClose, onSaved, onReady, onBeforeSave, onChange, onDirty,
    onValidateError, onNodeClick, onJsonChange,
  }

  /** 画布内容变更：仅在画布就绪后计数，首次翻转 onDirty(true)，每次变更 onChange(...) 带惰性 getter。 */
  const markDirty = useCallback(() => {
    if (!canvasReady.current) return
    if (!dirty.current) {
      dirty.current = true
      eventsRef.current.onDirty?.(true)
    }
    eventsRef.current.onChange?.({
      dirty: true,
      getJson: getFlowJson,
      getGraphData: () => (lfRef.current ? lfRef.current.getGraphData() : null),
    })
    // 受控 json 回写：变更后同步最新 json 给宿主
    if (isJsonControlled()) {
      eventsRef.current.onJsonChange?.(getFlowJson())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isJsonControlled])

  /** 复位为「干净 / 已保存」基线：若此前为 dirty 则 onDirty(false)。 */
  const markPristine = useCallback(() => {
    if (dirty.current) {
      dirty.current = false
      eventsRef.current.onDirty?.(false)
    }
  }, [])

  /** BaseInfo 校验失败回调：透出来源 + 无效字段。 */
  const handleBaseInfoValidateError = useCallback((fields?: Record<string, any>) => {
    eventsRef.current.onValidateError?.({ source: validateSource.current, fields })
  }, [])

  /**
   * LogicFlow 画布生命周期（实例 / 视口 / IO / resize / 触摸桥接 / 暗黑）抽到 useLogicFlowCanvas。
   * 组件保留向导、基础信息表单、属性面板编排与画布事件桥接（initEvent），通过 ref 盒子 + 回调注入。
   */
  const {
    lfRef, initLogicFlow, zoomViewport, undoOrRedo, clear, downLoad, downJson,
    fitViewAll, fitViewIfMobile, handleDragInNode, getGraphData, isDark,
  } = useLogicFlowCanvas({
    propsRef,
    containerRef: containerRef as any,
    logicJson,
    disabled: disabledRef,
    getBaseInfo,
    bindEvents: initEvent,
    onReady: (lfInstance) => {
      setLfState(lfInstance)
      // LogicFlow 完全初始化后，再显示自定义拖拽侧边栏（避免 DOM 操作冲突）
      if (isClassics(logicJson.current.modelValue)) {
        setSidebarVisible(true)
      }
      // 画布渲染完成：以当前内容为「干净」基线，并在下一 tick 开放变更追踪
      // （跳过初始渲染同步触发的 history:change，避免一打开就被标记为 dirty）
      markPristine()
      requestAnimationFrame(() => {
        canvasReady.current = true
      })
      // 透出底层 LogicFlow 实例：消费方可据此做高级定制
      eventsRef.current.onReady?.({ lf: lfInstance })
    },
  })

  /** 透出节点点击事件（经典 / 仿钉钉双模式共用），node 为 LogicFlow 节点 data。 */
  function emitNodeClick(node: any) {
    if (!node) return
    eventsRef.current.onNodeClick?.({
      id: node.id, type: node.type, data: node, lf: lfRef.current,
    })
  }

  /**
   * 边「+」浮层点击某个快捷选项：在该边上插入审批节点或网关。
   * 对齐 Vue 版 handleOptionClick：between -> addBetweenNode，其余 icon 即网关类型 -> addGatewayNode。
   * 插入后收起浮层，并在移动端自适应画布确保新节点可见。
   */
  function handleOptionClick(item: any) {
    if (item.icon === 'between') {
      addBetweenNode(lfRef.current, item.tooltipEdge)
    } else {
      addGatewayNode(lfRef.current, item.tooltipEdge, item.icon)
    }
    setTooltipVisible(false)
    // 移动端/平板端：新增节点后自适应画布（Vue 版用 proxy.$nextTick，React 用 rAF）
    requestAnimationFrame(() => fitViewIfMobile())
  }

  /** 收集基础信息表单到 logicJson（下载 JSON / 保存前调用）。 */
  function getBaseInfo() {
    if (onlyDesignShowRef.current) return
    const baseInfoData = baseInfoRef.current?.getFormData()
    if (baseInfoData) {
      logicJson.current = { ...logicJson.current, ...baseInfoData }
    }
  }

  /**
   * 画布事件桥接（initEvent）：把 LogicFlow eventCenter 的事件接到属性面板 / tooltip / 宿主回调。
   * 逻辑与 Vue 版逐条对应；proxy.$nextTick 换成 setTimeout(0)。
   */
  function initEvent() {
    const { eventCenter } = lfRef.current.graphModel

    // 画布图数据变更的统一信号：标记未保存 + 透出 change / dirty
    eventCenter.on('history:change', markDirty)

    /** 收集当前图数据到 nodes / skips（票签退回节点候选、边属性面板要用） */
    const collectGraphData = () => {
      const graphData = lfRef.current.getGraphData()
      nodes.current = graphData['nodes']
      skips.current = graphData['edges']
      setNodesState(graphData['nodes'])
      setSkipsState(graphData['edges'])
    }

    /** 打开属性抽屉（Vue 版用 proxy.$nextTick 后调 show()，React 用 setTimeout 等 state 落地） */
    const openPropertySetting = (conditionShow?: boolean) => {
      if (typeof conditionShow === 'boolean') {
        skipConditionShow.current = conditionShow
        setSkipConditionShowState(conditionShow)
      }
      setTimeout(() => propertySettingRef.current?.show(conditionShow), 0)
    }

    if (!isClassics(logicJson.current.modelValue)) {
      // 更新节点名称
      eventCenter.on('update:nodeName', (data: any) => {
        if (disabledRef.current) return
        lfRef.current.updateText(data.id, data.nodeName)
        lfRef.current.setProperties(data.id, { nodeName: data.nodeName })
      })

      // 网关节点单击事件
      eventCenter.on('node:click', (args: any) => {
        nodeClick.current = args.data
        setNodeClickState(args.data)
        emitNodeClick(args.data)
        // 只读态不响应网关「加节点」
        if (isGateWay(nodeClick.current.type) && !disabledRef.current) {
          gatewayAddNode(lfRef.current, nodeClick.current)
        }
      })

      // 仿钉钉节点卡片点「编辑」：打开属性抽屉
      eventCenter.on('edit:node', (args: any) => {
        if (args.click) {
          const model = lfRef.current.getNodeModelById(args.id)
          nodeClick.current = model
          setNodeClickState(model)
          collectGraphData()
          openPropertySetting()
        }
      })

      // 单击边：打开边（跳转）属性抽屉，串行 / 包含网关的出边才显示跳转条件
      eventCenter.on('show:EdgeSetting', (args: any) => {
        const model = lfRef.current.getEdgeModelById(args.id)
        nodeClick.current = model
        setNodeClickState(model)
        const nodeModel = lfRef.current.getNodeModelById(model.sourceNodeId)
        const conditionShow = ['serial', 'inclusive'].includes(nodeModel?.type)
        collectGraphData()
        openPropertySetting(conditionShow)
      })

      // 鼠标进入边：弹出「+」加节点浮层（只读态不弹）
      eventCenter.on('show:EdgeTooltip', (args: any) => {
        if (disabledRef.current) return
        setTooltipVisible(true)
        setTooltipPosition({ x: args.e.clientX, y: args.e.clientY })
        const model = lfRef.current.getEdgeModelById(args.id)
        tooltipEdge.current = model
        setTooltipEdgeState(model)
      })
      // 鼠标离开边：收起浮层
      eventCenter.on('hide:EdgeTooltip', () => {
        setTooltipVisible(false)
      })

      // 删除节点
      eventCenter.on('delete:node', (args: any) => {
        if (disabledRef.current) return
        const nodeModel = lfRef.current.getNodeModelById(args.id)
        removeNode(lfRef.current, nodeModel)
      })
    } else {
      // 经典模式：中间节点单击事件（透出节点点击 + 收集图数据 + 打开属性抽屉）
      eventCenter.on('node:click', (args: any) => {
        nodeClick.current = args.data
        setNodeClickState(args.data)
        emitNodeClick(args.data)
        collectGraphData()
        openPropertySetting()
      })

      /**
       * 经典模式：边单击 -> 打开边属性抽屉。
       *
       * 注意：Vue 版此处事件名写成 `'edge:click  '`（**尾部带两个空格**，见
       * warm-flow-vue-designer/src/components/design/FlowDesigner.vue:602），而 LogicFlow 实际派发的是
       * `'edge:click'`，故该监听器在 Vue 版里**从不触发**——经典模式点边打不开属性面板。
       * React 版用正确的事件名，即修复了这个存量 bug。若要求两端行为严格一致，
       * 应当反过来去修 Vue 版的事件名，而不是在 React 版复制该 bug。
       */
      eventCenter.on('edge:click', (args: any) => {
        nodeClick.current = args.data
        setNodeClickState(args.data)
        const nodeModel = lfRef.current.getNodeModelById(args.data.sourceNodeId)
        const conditionShow = ['serial', 'inclusive'].includes(nodeModel?.type)
        collectGraphData()
        openPropertySetting(conditionShow)
      })
    }

    // 新增边：改边类型为 skip，并按前驱节点判定 PASS / REJECT
    eventCenter.on('edge:add', (args: any) => {
      const graphData = lfRef.current.getGraphData()
      const previousNodes = getPreviousNodes(
        graphData['nodes'], graphData['edges'], args.data.sourceNodeId
      )
      lfRef.current.changeEdgeType(args.data.id, 'skip')
      lfRef.current.setProperties(args.data.id, {
        skipType: previousNodes.some((node: any) => node.id === args.data.targetNodeId)
          ? 'REJECT'
          : 'PASS',
      })
    })

    // 点击空白处：关闭属性抽屉（抽屉内部有 200ms 防抖，避免刚打开就被关掉）
    eventCenter.on('blank:click', () => {
      nodeClick.current = null
      setNodeClickState(null)
      setTimeout(() => propertySettingRef.current?.handleClose(), 0)
    })
  }

  /**
   * 应用流程定义数据（来源：props.initialJson / props.json 或 DataProvider.queryDef）。
   * 解析发布态/类别/表单路径 → 转换为 LogicFlow json → 空流程回退到内置初始模板。
   */
  const applyDefinition = useCallback((data: any) => {
    // 加载结束：关闭加载态；无可用定义数据则标记空态
    setLoading(false)
    setIsEmpty(!data)
    jsonString.current = data
    if (data?.isPublish && data.isPublish !== 0) {
      setDisabledState(true)
      disabledRef.current = true
    }
    if (data?.categoryList && data.categoryList.length > 0) {
      categoryList.current = data.categoryList
    }
    if (data?.formPathList && data.formPathList.length > 0) {
      formPathList.current = data.formPathList
      // state 镜像：PropertySetting 的属性面板要经 props 拿到表单路径树
      setFormPathListState(data.formPathList)
    }
    if (jsonString.current) {
      logicJson.current = json2LogicFlowJson(jsonString.current)
      if (!logicJson.current.nodes || logicJson.current.nodes.length === 0) {
        // 空流程：回退到内置初始模板（经典 / 仿钉钉）
        const initData = isClassics(logicJson.current.modelValue) ? initClassicsData : initMimicData
        logicJson.current = { ...logicJson.current, ...initData }
      }
      if (onlyDesignShowRef.current) {
        setActiveStep(1)
      }
    }
    // 关键：logicJson 是 ref，写入不触发重渲染；而 setLoading(false)/setIsEmpty(false)
    // 常与初始 state 同值（React 会 bail out 跳过渲染），必须显式 bump 才能让头部流程名、
    // 基础信息表单初值、经典/仿钉钉判定按新数据重渲染。（Vue 版靠 ref 响应式，无需此步）
    bumpLogicJson()
  }, [bumpLogicJson])

  // 挂载：加载流程定义数据
  useEffect(() => {
    // 隐藏滚动条
    document.body.style.overflow = 'hidden'
    // 标记当前处于设计器页面：供经典节点设计态语义色判断（业务侧实例进度图不受影响）
    window.__WF_FLOW_DESIGN_MODE__ = true

    // 数据源优先级：props.json（受控）> props.initialJson（脱后端）> queryDef（走 DataProvider）
    const localSource =
      jsonProp != null && jsonProp !== ''
        ? jsonProp
        : initialJson != null && initialJson !== ''
          ? initialJson
          : null

    if (localSource != null) {
      const data = typeof localSource === 'string' ? JSON.parse(localSource) : localSource
      applyDefinition(data)
    } else {
      // 走后端/mock：标记加载态
      setLoading(true)
      queryDef(definitionIdRef.current)
        .then((res: any) => applyDefinition(res.data))
        .catch(() => applyDefinition(null))
    }

    return () => {
      // 离开设计器页面，复位设计态标记
      window.__WF_FLOW_DESIGN_MODE__ = false
      document.body.style.overflow = ''
    }
    // 仅挂载时执行一次（对齐 Vue onMounted 语义）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 步骤切换：从「基础信息」切到「流程设计」时，自适应显示全部节点（所有端）
  const activeStepInitRef = useRef(activeStep)
  useEffect(() => {
    if (activeStep === activeStepInitRef.current) return
    if (activeStep === 1 && lfRef.current) {
      const doFit = () => {
        if (lfRef.current?.resize) {
          lfRef.current.resize()
          requestAnimationFrame(fitViewAll)
        }
      }
      // 多次延迟确保在各种时序下移动端能正确适配
      requestAnimationFrame(doFit)
      const timers = [150, 400, 800].map((ms) => setTimeout(doFit, ms))
      return () => timers.forEach(clearTimeout)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStep])

  // activeStep 进到 1 且画布未初始化时，初始化 LogicFlow（对齐 Vue handleModelValueUpdate -> initLogicFlow）
  useEffect(() => {
    if (activeStep !== 1) return
    if (lfRef.current) return
    if (!logicJson.current || !Object.keys(logicJson.current).length) return
    // 等 DOM 挂载出 container 后再初始化
    const timer = setTimeout(() => {
      if (!lfRef.current && containerRef.current) {
        canvasReady.current = false
        initLogicFlow()
      }
    }, 0)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStep, isEmpty, loading])

  /** 步骤点击：离开基础信息页前校验表单。 */
  const handleStepClick = useCallback(async (index: number) => {
    if (activeStep === 0 && !onlyDesignShowRef.current) {
      validateSource.current = 'step'
      const validate = await baseInfoRef.current?.validate()
      if (!validate) return
    }
    setActiveStep(index)
  }, [activeStep])

  /**
   * 收集当前可保存的 warm-flow 流程 json 字符串（命令式 API）。
   * 等价于保存前的数据装配：合并基础信息 + 画布图数据，再转 warm-flow 结构。
   */
  function getFlowJson(): string {
    getBaseInfo()
    if (lfRef.current) {
      const graphData = lfRef.current.getGraphData()
      logicJson.current['nodes'] = graphData['nodes']
      logicJson.current['edges'] = graphData['edges']
    }
    logicJson.current['id'] = definitionIdRef.current
    return logicFlowJsonToWarmFlow(logicJson.current)
  }

  /** 保存（命令式 + 工具栏 / 头部按钮共用）。 */
  const saveJsonModel = useCallback(async () => {
    const loadingInstance = getUiAdapter().loading({
      fullscreen: true, text: t('flowDesigner.saving'),
    })
    if (!onlyDesignShowRef.current) {
      validateSource.current = 'save'
      const validate = await baseInfoRef.current?.validate()
      if (!validate) {
        loadingInstance.close()
        return
      }
    }
    // 装配本次提交的流程 json（与命令式 getFlowJson 同一来源，避免重复装配逻辑）
    let submitJson = getFlowJson()

    // before-save 钩子（同步）：消费方可改写 json 或取消保存
    let saveCancelled = false
    eventsRef.current.onBeforeSave?.({
      id: definitionIdRef.current,
      json: submitJson,
      onlyDesignShow: onlyDesignShowRef.current,
      setJson: (next: string) => { if (typeof next === 'string') submitJson = next },
      preventDefault: () => { saveCancelled = true },
    })
    if (saveCancelled) {
      loadingInstance.close()
      return
    }

    try {
      const response: any = await saveJson(submitJson, onlyDesignShowRef.current)
      if (response.code === 200) {
        getUiAdapter().message('success', t('flowDesigner.saveSuccess'))
        // 保存成功：复位未保存标记
        markPristine()
        eventsRef.current.onSaved?.({
          id: definitionIdRef.current, data: response.data, json: submitJson,
        })
        // 延迟 500ms 后通知宿主关闭
        setTimeout(() => eventsRef.current.onClose?.(), 500)
      }
    } finally {
      setTimeout(() => loadingInstance.close(), 0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, markPristine])

  /** 校验基础信息表单（命令式 API）。onlyDesignShow 模式无基础信息页，恒为通过。 */
  const validate = useCallback(async (): Promise<boolean> => {
    if (onlyDesignShowRef.current) return true
    validateSource.current = 'api'
    return (await baseInfoRef.current?.validate()) ?? true
  }, [])

  /**
   * 校验流程结构（命令式 API）。
   * 内置检查：≥1 开始节点、≥1 结束节点、无孤立节点；再追加消费方的 structureValidator。
   */
  const validateStructure = useCallback((): FlowStructureValidateResult => {
    const errors: string[] = []
    const graph = lfRef.current ? lfRef.current.getGraphData() : { nodes: [], edges: [] }
    const graphNodes: any[] = graph.nodes || []
    const graphEdges: any[] = graph.edges || []
    if (graphNodes.filter((n) => n.type === 'start').length < 1) errors.push(t('flowDesigner.errNoStart'))
    if (graphNodes.filter((n) => n.type === 'end').length < 1) errors.push(t('flowDesigner.errNoEnd'))
    if (graphNodes.length > 1) {
      const connected = new Set<string>()
      graphEdges.forEach((e) => { connected.add(e.sourceNodeId); connected.add(e.targetNodeId) })
      const isolated = graphNodes.filter((n) => !connected.has(n.id))
      if (isolated.length > 0) errors.push(t('flowDesigner.errIsolated', { n: isolated.length }))
    }
    const custom = structureValidator
      ? structureValidator({ nodes: graphNodes, edges: graphEdges })
      : undefined
    if (Array.isArray(custom)) {
      custom.forEach((msg) => { if (msg) errors.push(String(msg)) })
    }
    return { valid: errors.length === 0, errors }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, structureValidator])

  // —— 对外暴露命令式 API（等价 Vue defineExpose）——
  useImperativeHandle(ref, () => ({
    save: saveJsonModel,
    validate,
    getGraphData,
    getFlowJson,
    getFlowName: () => logicJson.current.flowName ?? '',
    getLogicFlow: () => lfRef.current,
    zoom: zoomViewport,
    zoomIn: () => zoomViewport(true),
    zoomOut: () => zoomViewport(false),
    fitView: () => zoomViewport('fit'),
    resetZoom: () => zoomViewport(1),
    undo: () => undoOrRedo(true),
    redo: () => undoOrRedo(false),
    clear,
    downloadImage: downLoad,
    downloadJson: downJson,
    isDirty: () => dirty.current,
    resetDirty: markPristine,
    validateStructure,
  }), [
    saveJsonModel, validate, getGraphData, zoomViewport, undoOrRedo, clear,
    downLoad, downJson, markPristine, validateStructure,
  ])

  // —— 样式（对齐 Vue 版 computed 内联样式）——
  const headerDivStyle = useMemo<React.CSSProperties>(() => ({
    backgroundColor: 'var(--wf-bg-white, #fff)',
    minHeight: '100vh',
    position: 'relative',
  }), [])

  const headerStyle = useMemo<React.CSSProperties>(() => ({
    top: '5px',
    right: '50px',
    left: isClassics(logicJson.current.modelValue) ? '60px' : '50px',
    zIndex: 2,
    height: 'auto',
    backgroundColor: 'var(--wf-bg-white, #fff)',
    border: '1px solid var(--wf-border-light, #e2e8f0)',
    borderRadius: '6px',
    margin: '5px',
    color: 'var(--wf-text-primary, #303133)',
    transition: 'left 0.3s ease',
  }), [activeStep, isDark])

  const steps = useMemo(() => [
    { title: t('flowDesigner.stepBaseInfo'), icon: 'baseInfo' },
    { title: t('flowDesigner.stepFlowDesign'), icon: 'flowDesign' },
  ], [t])

  const isClassicMode = isClassics(logicJson.current.modelValue)

  return (
    <div style={headerDivStyle} className={isDark ? 'wf-react-designer dark' : 'wf-react-designer'}>
      {/* 顶部导航栏（onlyDesignShow 时隐藏） */}
      {!onlyDesignShowProp ? (
        <FlowDesignerHeader
          flowName={logicJson.current.flowName}
          activeStep={activeStep}
          steps={steps}
          disabled={disabledState}
          onStepClick={handleStepClick}
          onSave={saveJsonModel}
          headerLeft={headerLeft}
          headerCenter={headerCenter}
          headerActions={headerActions}
        />
      ) : null}

      <div style={headerStyle}>
        {/* 画布工具栏 */}
        <FlowDesignerToolbar
          activeStep={activeStep}
          onlyDesignShow={onlyDesignShowProp}
          disabled={disabledState}
          lf={lfState}
          onZoomOut={() => zoomViewport(false)}
          onFitView={() => zoomViewport('fit')}
          onZoomIn={() => zoomViewport(true)}
          onUndo={() => undoOrRedo(true)}
          onRedo={() => undoOrRedo(false)}
          onClear={() => clear()}
          onDownloadImage={downLoad}
          onDownloadJson={downJson}
          onSave={saveJsonModel}
          toolbarExtra={toolbarExtra}
        />

        {/* 基础信息表单（onlyDesignShow 时跳过） */}
        {!onlyDesignShowProp && activeStep === 0 ? (
          <div style={{ margin: '5px', backgroundColor: 'var(--wf-bg-white, #fff)' }}>
            <BaseInfo
              ref={baseInfoRef}
              logicJson={logicJson.current}
              categoryList={categoryList.current}
              formPathList={formPathList.current}
              definitionId={definitionIdRef.current}
              disabled={disabledState}
              onFlowNameUpdate={(newName) => {
                // 头部流程名渲染期读 logicJson.current.flowName，故须 bump 才会即时刷新
                logicJson.current.flowName = newName
                bumpLogicJson()
              }}
              onModelValueUpdate={() => {
                // 模型切换（经典 <-> 仿钉钉）：隐藏侧栏、关闭变更追踪，下一帧重建画布
                setSidebarVisible(false)
                canvasReady.current = false
                requestAnimationFrame(() => {
                  if (!jsonString.current.nodeList || jsonString.current.nodeList.length === 0) {
                    const initData = isClassics(logicJson.current.modelValue)
                      ? initClassicsData : initMimicData
                    logicJson.current = { ...logicJson.current, ...initData }
                  }
                  // 模型切换影响「经典/仿钉钉」判定（侧栏显隐、画布交互），bump 触发重渲染
                  bumpLogicJson()
                  if (lfRef.current) {
                    // 已有实例：销毁后重建（React 无 Vue 的 v-if 重建语义，显式 destroy）
                    lfRef.current.destroy?.()
                    lfRef.current = null
                    setLfState(null)
                  }
                  setActiveStep(1)
                  setTimeout(() => initLogicFlow(), 0)
                })
              }}
              onValidateError={handleBaseInfoValidateError}
            />
          </div>
        ) : null}

        {/* 自定义拖拽侧边栏：仅经典模式流程设计页签显示 + 延迟显示避免与 LogicFlow DOM 冲突 */}
        {sidebarVisible && activeStep === 1 ? (
          sidebar ? (
            sidebar({
              dragInNode: handleDragInNode, lf: lfState, disabled: disabledState,
            })
          ) : (
            <DiagramSidebar
              flowNodes={paletteNodes?.flowNodes}
              gatewayNodes={paletteNodes?.gatewayNodes}
              onDragInNode={handleDragInNode}
            />
          )
        ) : null}

        {/* 画布容器：LogicFlow 挂载点。用 hidden 而非条件渲染，保留 DOM 让 lf 实例存活 */}
        <div
          className="container"
          ref={containerRef}
          style={{ display: activeStep === 1 ? 'block' : 'none' }}
        >
          {/* 节点 / 边属性抽屉：由 initEvent 的 node:click / edit:node / show:EdgeSetting / edge:click
              命令式 show()，blank:click 命令式 handleClose()。抽屉本身 teleport 到 body（适配器实现）。 */}
          <PropertySetting
            ref={propertySettingRef}
            node={nodeClickState}
            lf={lfState}
            disabled={disabledState}
            skipConditionShow={skipConditionShowState}
            nodes={nodesState}
            skips={skipsState}
            formPathList={formPathListState}
            nodeFormExtra={nodeFormExtra}
          />
        </div>

        {activeStep === 1 ? (
          <div className="logo-text">Warm-Flow</div>
        ) : null}
      </div>

      {/* 仿钉钉模式边「+」加节点浮层 */}
      {tooltipVisible ? (
        <EdgeTooltip
          position={tooltipPosition}
          tooltipEdge={tooltipEdgeState}
          onOptionClick={handleOptionClick}
          onCloseTooltip={() => setTooltipVisible(false)}
        />
      ) : null}

      {/* 加载态 / 空态覆盖层 */}
      {loading ? (
        <div className="wf-state-overlay">
          {loadingSlot ?? <div className="wf-state-default">{t('common.loading')}</div>}
        </div>
      ) : isEmpty ? (
        <div className="wf-state-overlay">
          {emptySlot ?? <div className="wf-state-default">{t('flowDesigner.emptyDef')}</div>}
        </div>
      ) : null}
    </div>
  )
})

FlowDesigner.displayName = 'FlowDesigner'

export default FlowDesigner

/**
 * 移植完成度（Vue -> React）。
 *
 * 已完成（对齐 warm-flow-vue-designer 全部组件层）：
 * - 数据层 / api / LogicFlow 节点层（经典 + 仿钉钉）/ 画布引擎 Hook / i18n / 主题；
 * - UI 适配层：uiAdapter 契约 + Fusion nextAdapter + 28 个中性 wf-* 组件；
 * - FlowDesigner 编排 / Header / Toolbar / DiagramSidebar / BaseNode（仿钉钉节点卡片）；
 * - BaseInfo（基础信息表单 + 监听器行）；
 * - PropertySetting 属性抽屉 + 6 个节点属性面板（start / between / end / gateway / skip / nodeExtList）；
 * - selectUser 办理人选择器 + UserPicker{Tree, Search, SelectedBar} + useUserPicker 逻辑层；
 * - EdgeTooltip 边「+」浮层。
 * initEvent 已接回全部画布事件（node:click / edit:node / show:EdgeSetting / show|hide:EdgeTooltip /
 * delete:node / edge:add / blank:click）。
 *
 * 与 Vue 版的已知行为差异（均有意为之，详见各处注释）：
 * 1. 经典模式 `edge:click`：Vue 版事件名尾部多两个空格导致监听从不触发（存量 bug），React 版已修正，
 *    即经典模式点边**能**打开属性面板。
 * 2. 表单校验自带实现（不依赖 UI 库 form.validate），跨 Fusion / 其它适配器行为一致。
 * 3. `nodeFormExtra` 单一扩展点，替代 Vue 版「全部插槽透传」（React 无对应概念）。
 *
 * 尚未逐字段核对的细节：BaseInfo 的表单分类 / 表单路径联动与 Vue 版可能有细微差异；
 * 动态扩展页签（nodeExt type=2）的多页签串联校验按 Vue 语义实现但未在真实后端数据下验证。
 */
