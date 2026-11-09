import { useCallback, useEffect, useRef } from 'react'
import LogicFlow from '@logicflow/core'
import '@logicflow/core/lib/style/index.css'
import { InsertNodeInPolyline, Menu, Snapshot } from '@logicflow/extension'
import '@logicflow/extension/lib/style/index.css'
import { isClassics, logicFlowJsonToWarmFlow } from '@/components/design/common/js/tool'
import StartC from '@/components/design/classics/js/start'
import BetweenC from '@/components/design/classics/js/between'
import SerialC from '@/components/design/classics/js/serial'
import ParallelC from '@/components/design/classics/js/parallel'
import InclusiveC from '@/components/design/classics/js/inclusive'
import EndC from '@/components/design/classics/js/end'
import SkipC from '@/components/design/classics/js/skip'
import StartM from '@/components/design/mimic/js/start'
import BetweenM from '@/components/design/mimic/js/between'
import SerialM from '@/components/design/mimic/js/serial'
import ParallelM from '@/components/design/mimic/js/parallel'
import InclusiveM from '@/components/design/mimic/js/inclusive'
import EndM from '@/components/design/mimic/js/end'
import SkipM from '@/components/design/mimic/js/skip'
import initMimicData from '@/components/design/mimic/initMimicData.json'
import { useTheme } from '@/hooks/useTheme'
import type { FlowDesignerProps } from '@/designer/types'

/**
 * 可变盒子：React 版用 `{ current }` 传递「画布需要但归属外层组件」的可变状态。
 *
 * 设计考量：LogicFlow 的命令式 API（render / getGraphData）需要在事件回调里读到**最新值**，
 * 而 React 的 state 在闭包里会捕获旧值。用 ref 盒子（等价 Vue 的 `Ref<T>`）可绕开闭包陈旧问题，
 * 让本 Hook 与 Vue 版 useLogicFlowCanvas 的「ref 注入」形态一一对应，便于逐行对照移植。
 */
export interface MutableBox<T> {
  current: T
}

/**
 * useLogicFlowCanvas 入参：组件把「画布需要、但归属向导/表单/属性面板」的依赖以
 * ref 盒子 + 回调形式注入，让 Hook 专注于 LogicFlow 实例的生命周期与视口/IO 操作。
 *
 * 与 Vue 版 options 的对应关系：
 * - `containerRef: Ref<HTMLElement|undefined>` -> `MutableBox<HTMLElement|null>`（React ref）
 * - `logicJson: Ref<Record<string,any>>` -> `MutableBox<Record<string,any>>`
 * - `disabled: Ref<boolean>` -> `MutableBox<boolean>`
 * - `props` 直接传 FlowDesignerProps（React 组件每次渲染拿到新 props，用 ref 盒子存最新值供回调读取）
 */
export interface UseLogicFlowCanvasOptions {
  /** FlowDesigner 的 props（读取 showGrid / lfOptions / customNodes / extraExtensions / onBeforeUse / onRegister） */
  propsRef: MutableBox<FlowDesignerProps>
  /** 画布容器 DOM（`<div ref={containerRef}>`），LogicFlow 挂载点 */
  containerRef: MutableBox<HTMLElement | null>
  /** 当前流程 JSON（读取 modelValue / flowName / version，render 数据源；clear 在仿钉钉模式会重置它） */
  logicJson: MutableBox<Record<string, any>>
  /** 只读标志（静默模式 / __WF_DESIGNER_DISABLED__） */
  disabled: MutableBox<boolean>
  /** 收集基础信息表单到 logicJson（下载 JSON 前调用），实现由组件提供 */
  getBaseInfo: () => void
  /** 绑定画布事件（initEvent）：画布 → 属性面板 UI 状态的桥接，逻辑留在组件，由本 Hook 在合适时机调用 */
  bindEvents: () => void
  /** 画布渲染完成回调：组件据此显示侧边栏 + onReady 事件 */
  onReady: (lf: any) => void
}

/**
 * LogicFlow 画布生命周期 Hook（React 版，移植自 Vue 的 composables/useLogicFlowCanvas）。
 *
 * 集中承载：
 * - 实例生命周期：use（扩展）→ new LogicFlow → setTheme → register（节点）→ menu → events → 触摸桥接 → render → fitView → 暗黑主题
 * - 视口操作：放大/缩小/自适应（zoomViewport）、撤销/重做、清空、下载图片 / JSON
 * - 自适应：移动端判定、fitView（限制最大 100%）、resize（防抖 + 抽屉屏蔽）、移动端真机延迟重绘
 * - 移动端触摸 → 鼠标事件桥接（Pointer Events）
 * - 暗黑主题随 isDark 切换
 *
 * 与 Vue 版的实现差异：
 * - `ref<T>` -> `useRef` 盒子（命令式状态，不触发渲染）；`watch(isDark)` -> `useEffect([isDark])`；
 *   `onUnmounted` -> `useEffect` 返回的清理函数；`nextTick` -> `requestAnimationFrame` / `setTimeout(0)`。
 * - `window.addEventListener('resize')` 与抽屉标志（_markDrawerOpen/_markDrawerClosed）的挂载/卸载
 *   移入 `useEffect`，保证组件卸载时移除监听（Vue 版在 setup 顶层挂、onUnmounted 摘）。
 * - 触摸桥接的 DOM 操作与双击/长按检测为**纯 DOM 逻辑，与框架无关**，原样保留。
 *
 * @author warm
 */
export function useLogicFlowCanvas(options: UseLogicFlowCanvasOptions) {
  const { propsRef, containerRef, logicJson, disabled, getBaseInfo, bindEvents, onReady } = options

  // LogicFlow 实例（命令式，不参与渲染）
  const lfRef = useRef<any>(null)
  // 暗黑模式：React state（isDark 变化需触发重渲染以重算 themeColors）
  const { isDark, themeColors, applyDarkTheme } = useTheme()
  // themeColors 存进盒子，供 initLogicFlow 等命令式回调读取最新值（避免闭包陈旧）
  const themeColorsRef = useRef(themeColors)
  themeColorsRef.current = themeColors
  // onReady 回调存盒子：由组件每次渲染传入，用 ref 避免 initLogicFlow 闭包捕获旧函数
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady
  const bindEventsRef = useRef(bindEvents)
  bindEventsRef.current = bindEvents
  const getBaseInfoRef = useRef(getBaseInfo)
  getBaseInfoRef.current = getBaseInfo

  // resize 相关可变状态（等价 Vue 版闭包变量）
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const drawerActiveRef = useRef(false)
  const lastCanvasSizeRef = useRef({ w: 0, h: 0 })

  /**
   * 判断当前是否为移动端/平板设备
   * 通过屏幕宽度 + 触摸能力综合判断（PC 端不生效自动 fitView）
   */
  const isMobileDevice = useCallback(() => {
    // 屏幕宽度 <= 1024px（覆盖平板横屏及以下）或支持触摸且有窄屏
    return window.innerWidth <= 1024 || ('ontouchstart' in window && window.innerWidth <= 1280)
  }, [])

  /**
   * 自适应显示全部节点（所有端）：打开 / 进入流程设计 / resize / 点击「自适应」按钮时使用。
   * fitView 会把节点较少的流程放大撑满画布，这里限制最大缩放 100%：
   * 流程大 -> 缩小铺满；流程小 -> 保持原始大小并居中，避免进来就糊脸。(PR#396 评审①)
   */
  const fitViewAll = useCallback(() => {
    const lfInst: any = lfRef.current
    if (!lfInst?.fitView) return
    lfInst.fitView(40, 20)
    const scale = lfInst.getTransform ? lfInst.getTransform().SCALE_X : 1
    if (scale && scale > 1) {
      lfInst.resetZoom ? lfInst.resetZoom() : lfInst.zoom(1)
      if (lfInst.translateCenter) lfInst.translateCenter()
    }
  }, [])

  /** 仅在移动端/平板执行 fitView（用于新增节点等增量操作，避免 PC 编辑时被打断） */
  const fitViewIfMobile = useCallback(() => {
    if (isMobileDevice() && lfRef.current?.fitView) {
      lfRef.current.fitView(40, 20)
    }
  }, [isMobileDevice])

  /**
   * 使用 Pointer Events API 建立移动端触摸→鼠标事件的完整桥接
   *
   * LogicFlow v2 内部用 mousedown/mousemove/mouseup + click/dblclick，移动端浏览器不会自动
   * 把 touch 转成 mouse 事件。Pointer Events 是 W3C 标准，同时覆盖鼠标/触摸/触控笔。
   * 额外补充：阻止默认手势（滚动/缩放）、长按模拟 contextmenu、双击检测并分发 dblclick。
   *
   * 纯 DOM 逻辑，与框架无关，从 Vue 版原样移植。
   */
  const setupPointerEventCapture = useCallback((el: Element) => {
    // --- 双击检测状态 ---
    let tapCount = 0
    let lastTapTime = 0
    let doubleTapTimer: ReturnType<typeof setTimeout> | null = null
    const DOUBLE_TAP_GAP = 350

    // --- 长按右键菜单状态 ---
    let longPressTimer: ReturnType<typeof setTimeout> | null = null
    let isLongPressFired = false

    // --- 拖动检测 ---
    let startX = 0,
      startY = 0
    let isDragging = false

    /**
     * 检查抽屉是否处于打开状态（打开期间禁止向 LogicFlow 转发触摸事件）
     *
     * 三级判断：
     * 1. drawerActiveRef 标志位 — 代码显式标记的打开/关闭窗口期
     * 2. `.next-drawer` / `.el-drawer` 打开时的 DOM class（React 版用 Fusion Drawer 类名 + 保留 EP 兼容）
     * 3. 排除正在执行关闭动画的抽屉
     */
    function isDrawerOpen() {
      if (drawerActiveRef.current) return true
      // Fusion Drawer 与 Element Plus Drawer 两种宿主都兼容
      const drawerEl = document.querySelector('.next-drawer, .el-drawer')
      if (!drawerEl) return false
      if (
        (drawerEl.classList.contains('el-drawer__open') ||
          drawerEl.classList.contains('next-drawer-opened')) &&
        !drawerEl.classList.contains('el-drawer__close')
      ) {
        return true
      }
      // 存在抽屉元素即视为打开（Fusion Drawer 挂载即在 DOM）
      return !!document.querySelector('.next-drawer')
    }

    /** 统一获取坐标参数（用于构造 MouseEvent） */
    function getEventOpts(pointerEvent: PointerEvent) {
      return {
        clientX: pointerEvent.clientX,
        clientY: pointerEvent.clientY,
        button: 0,
        bubbles: true,
        cancelable: true,
        view: window,
      }
    }

    function resetTapState() {
      if (doubleTapTimer) {
        clearTimeout(doubleTapTimer)
        doubleTapTimer = null
      }
      tapCount = 0
    }

    // ========== pointerdown ==========
    const onPointerDown = (e: PointerEvent) => {
      // 只处理主指针（手指/鼠标左键/触控笔）
      if (e.pointerType === 'mouse' && e.button !== 0) return

      // 抽屉打开期间：阻止触摸事件转发给 LogicFlow，防止画布被意外拖拽
      if (isDrawerOpen() && e.pointerType === 'touch') {
        e.preventDefault()
        return
      }

      startX = e.clientX
      startY = e.clientY
      isDragging = false
      isLongPressFired = false

      // 仅对触摸事件阻止浏览器默认手势（滚动/缩放/选择）；鼠标事件不干预
      if (e.pointerType === 'touch') {
        e.preventDefault()
        // 主动分发一次 mousedown 确保 LogicFlow 收到
        el.dispatchEvent(new MouseEvent('mousedown', getEventOpts(e)))
      }

      // 启动长按计时器（500ms 无显著移动则视为右键菜单，仅触摸有效）
      longPressTimer = setTimeout(() => {
        if (isDragging) return // 已在拖动，取消长按
        isLongPressFired = true
        el.dispatchEvent(new MouseEvent('contextmenu', getEventOpts(e)))
      }, 500)
    }
    el.addEventListener('pointerdown', onPointerDown, { passive: false } as AddEventListenerOptions)

    // ========== pointermove ==========
    const onPointerMove = (e: PointerEvent) => {
      // 抽屉打开期间：完全拦截触摸移动事件
      if (isDrawerOpen() && e.pointerType === 'touch') {
        e.preventDefault()
        return
      }

      const dx = Math.abs(e.clientX - startX)
      const dy = Math.abs(e.clientY - startY)

      if (!isDragging && (dx > 5 || dy > 5)) {
        // 首次超过阈值：进入拖动模式
        isDragging = true
        if (longPressTimer) {
          clearTimeout(longPressTimer)
          longPressTimer = null
        }
      }

      if (isDragging && e.pointerType === 'touch') {
        // 触摸拖动中：持续分发 mousemove 给 LogicFlow
        e.preventDefault()
        el.dispatchEvent(new MouseEvent('mousemove', getEventOpts(e)))
      } else if (e.pointerType === 'touch') {
        // 触摸微移动：阻止默认滚动行为
        e.preventDefault()
      }
    }
    el.addEventListener('pointermove', onPointerMove, { passive: false } as AddEventListenerOptions)

    // ========== pointerup / pointercancel ==========
    const handlePointerEnd = (e: PointerEvent) => {
      // 抽屉打开期间：拦截触摸释放事件
      if (isDrawerOpen() && e.pointerType === 'touch') {
        resetTapState()
        isDragging = false
        return
      }

      // 清理长按计时器
      if (longPressTimer) {
        clearTimeout(longPressTimer)
        longPressTimer = null
      }

      // 拖动结束：分发 mouseup 给 LogicFlow 完成拖拽链路
      if (isDragging && e.pointerType === 'touch') {
        el.dispatchEvent(new MouseEvent('mouseup', getEventOpts(e)))
        resetTapState()
        isDragging = false
        return
      }

      // 长按已触发（右键菜单），不再处理 click/dblclick
      if (isLongPressFired) {
        resetTapState()
        return
      }

      // ---- 点击/双击检测（仅非拖动） ----
      const now = Date.now()
      tapCount++

      if (tapCount === 1) {
        // 第一次点击：立即触发 click
        lastTapTime = now
        el.dispatchEvent(new MouseEvent('click', getEventOpts(e)))

        // 设置双击等待窗口
        doubleTapTimer = setTimeout(() => {
          tapCount = 0
          doubleTapTimer = null
        }, DOUBLE_TAP_GAP)
      } else if (tapCount >= 2 && now - lastTapTime < DOUBLE_TAP_GAP) {
        // 第二次快速点击：触发 dblclick
        if (doubleTapTimer) {
          clearTimeout(doubleTapTimer)
          doubleTapTimer = null
        }
        tapCount = 0
        el.dispatchEvent(new MouseEvent('dblclick', getEventOpts(e)))
      } else {
        // 超出双击间隔，重新开始计数
        tapCount = 1
        lastTapTime = now
        el.dispatchEvent(new MouseEvent('click', getEventOpts(e)))

        doubleTapTimer = setTimeout(() => {
          tapCount = 0
          doubleTapTimer = null
        }, DOUBLE_TAP_GAP)
      }
    }

    const onPointerCancel = (e: PointerEvent) => {
      // 中断：如果正在拖动需要补发 mouseup
      if (isDragging && e.pointerType === 'touch') {
        el.dispatchEvent(new MouseEvent('mouseup', getEventOpts(e)))
        isDragging = false
      }
      if (longPressTimer) {
        clearTimeout(longPressTimer)
        longPressTimer = null
      }
      resetTapState()
    }

    el.addEventListener('pointerup', handlePointerEnd as EventListener)
    el.addEventListener('pointercancel', onPointerCancel)
  }, [])

  /**
   * 移动端触摸事件桥接：确保手机/平板上 LogicFlow 节点/边的点击、拖拽正常工作。
   * 对容器及 canvas-overlay 启用 Pointer Events 捕获（overlay 未渲染时用 MutationObserver 延迟绑定）。
   */
  const initTouchEventBridge = useCallback(() => {
    const container = containerRef.current
    if (!container) return

    setupPointerEventCapture(container)

    // 同时绑定到 canvas-overlay（确保画布拖拽也正常）
    const canvasOverlay = container.querySelector('.lf-canvas-overlay')
    if (canvasOverlay) {
      setupPointerEventCapture(canvasOverlay)
    } else {
      // 如果 CanvasOverlay 还未渲染，延迟绑定
      const observer = new MutationObserver(() => {
        const overlay = container.querySelector('.lf-canvas-overlay')
        if (overlay) {
          setupPointerEventCapture(overlay)
          observer.disconnect()
        }
      })
      observer.observe(container, { childList: true, subtree: true })
    }
  }, [containerRef, setupPointerEventCapture])

  /** 初始化右键菜单（只有仿钉钉模式才配置；须在 lf.render() 之前设置） */
  const initMenu = useCallback(() => {
    if (!isClassics(logicJson.current.modelValue)) {
      lfRef.current.extension.menu.setMenuConfig({
        nodeMenu: [],
        edgeMenu: [],
      })
    }
  }, [logicJson])

  /** 注册自定义节点和边（按经典 / 仿钉钉模式选择内置节点集） */
  const register = useCallback(() => {
    const lf = lfRef.current
    if (isClassics(logicJson.current.modelValue)) {
      lf.register(StartC)
      lf.register(BetweenC)
      lf.register(SerialC)
      lf.register(ParallelC)
      lf.register(InclusiveC)
      lf.register(EndC)
      lf.register(SkipC)
    } else {
      lf.register(StartM)
      lf.register(BetweenM)
      lf.register(SerialM)
      lf.register(ParallelM)
      lf.register(InclusiveM)
      lf.register(EndM)
      lf.register(SkipM)
    }
    const props = propsRef.current
    // 消费方自定义节点：在内置节点之后注册，可新增节点类型或覆盖内置同名 type
    ;(props.customNodes ?? []).forEach((node: any) => {
      if (node) lf.register(node)
    })
    // 命令式节点注册钩子：透出已创建的 lf 实例
    props.onRegister?.(lf)
  }, [logicJson, propsRef])

  /** 添加 LogicFlow 扩展（内置 Menu / Snapshot + 经典模式的 InsertNodeInPolyline） */
  const use = useCallback(() => {
    const props = propsRef.current
    // 只有经典模式才有拖拽面板（已使用自定义 DiagramSidebar 替代内置 DndPanel）
    if (isClassics(logicJson.current.modelValue)) {
      LogicFlow.use(InsertNodeInPolyline)
    }
    LogicFlow.use(Menu)
    LogicFlow.use(Snapshot)
    // 消费方自定义 LogicFlow 扩展（MiniMap / Control / Group 等），在内置扩展之后注册
    ;(props.extraExtensions ?? []).forEach((ext: any) => {
      if (ext) LogicFlow.use(ext)
    })
    // 命令式扩展钩子：透出 LogicFlow 类，支持注册带配置的扩展或覆盖内置扩展
    props.onBeforeUse?.(LogicFlow as any)
  }, [logicJson, propsRef])

  /**
   * 延迟触发 LogicFlow resize + fitView（所有端）
   * 覆盖移动端真机 / 显隐切换 / iframe 嵌入等容器尺寸延迟场景
   */
  const scheduleMobileResize = useCallback(() => {
    const doFit = () => {
      if (lfRef.current && lfRef.current.resize) {
        lfRef.current.resize()
        // resize 后自适应显示全部节点（所有端，覆盖布局/iframe 时序）
        requestAnimationFrame(fitViewAll)
      }
    }
    // 多重延迟策略覆盖各种场景：移动端/显隐切换/iframe 嵌入
    ;[50, 150, 300, 600, 1000].forEach((ms) => setTimeout(doFit, ms))
  }, [fitViewAll])

  /** 初始化 LogicFlow 实例（等价 Vue 版 initLogicFlow） */
  const initLogicFlow = useCallback(() => {
    const container = containerRef.current
    if (!container) return

    const props = propsRef.current
    const colors = themeColorsRef.current
    const isClassic = isClassics(logicJson.current.modelValue)

    use()
    lfRef.current = new LogicFlow({
      // 注意：container 不在这里设，而是放在 lfOptions 展开**之后**强制覆盖（见下方），
      // 确保消费方误传的 lfOptions.container 不会顶掉组件内部管理的挂载点。
      // 只读（预览 / 已发布）时开启静默模式：禁止拖拽、连线、文本编辑、删除键等原生编辑交互
      isSilentMode: disabled.current,
      textEdit: false, // 是否开启文本编辑
      snapToGrid: true, // 是否开启网格吸附
      hideAnchors: !isClassic, // 是否隐藏节点锚点，静默模式下默认隐藏
      adjustNodePosition: isClassic, // 是否允许拖动节点
      hoverOutline: isClassic, // hover 时是否显示节点外框
      nodeSelectedOutline: isClassic, // 节点选中时是否显示外框
      edgeSelectedOutline: isClassic, // 边选中时是否显示外框
      grid: {
        size: 20,
        visible: props.showGrid,
        type: 'dot',
        config: {
          color: colors.gridColor,
          thickness: 1,
        },
        background: {
          backgroundColor: colors.bgPage,
        },
      },
      keyboard: isClassic
        ? {
            enabled: true,
            shortcuts: [
              {
                keys: ['delete'],
                callback: () => {
                  const lf = lfRef.current
                  const elements = lf.getSelectElements(true)
                  lf.clearSelectElements()
                  elements.edges.forEach((edge: any) => lf.deleteEdge(edge.id))
                  elements.nodes.forEach((node: any) => lf.deleteNode(node.id))
                },
              },
            ],
          }
        : {},
      // 消费方自定义 LogicFlow 初始化选项（顶层覆盖内置默认值）
      ...(props.lfOptions ?? {}),
      // container 由组件内部管理，强制覆盖，避免消费方误传破坏画布挂载
      container,
    } as any)

    lfRef.current.setTheme({
      snapline: {
        stroke: colors.snaplineStroke,
        strokeWidth: 2,
      },
      nodeText: {
        color: colors.nodeTextColor,
        fill: colors.nodeTextFill,
        fontSize: 13,
        fontWeight: 500,
      },
      edgeText: {
        fontSize: 13,
        strokeWidth: 1,
        background: {
          fill: colors.edgeTextBg,
        },
      },
      // 选中/悬浮的包围框：默认是黑色虚线，改成柔和蓝实线
      outline: {
        stroke: 'rgba(64, 158, 255, 0.7)',
        strokeWidth: 1,
        strokeDasharray: '',
        hover: {
          stroke: 'rgba(64, 158, 255, 0.35)',
        },
      },
    })

    register()
    initMenu()
    // 画布 → 属性面板 UI 状态的事件桥接，逻辑由组件提供
    bindEventsRef.current()
    // 画布触摸事件桥接（移动端）
    initTouchEventBridge()
    // 渲染前同步只读标志：供仿钉钉自定义节点视图（BaseNode.tsx）判断是否隐藏编辑/删除/改名控件
    window.__WF_DESIGNER_DISABLED__ = disabled.current
    if (logicJson.current) {
      lfRef.current.render(logicJson.current)
      // 打开即自适应显示全部节点（所有端，最大缩放 100%）
      fitViewAll()
    }
    // 初始化完成后，如果当前是暗黑模式，显式应用一次主题（解决 URL 参数初始化时序问题）
    if (isDark && lfRef.current) {
      applyDarkTheme(lfRef.current, true)
    }
    // 真机修复：延迟触发一次 resize 确保 SVG 画布正确渲染尺寸
    scheduleMobileResize()

    // 透出底层 LogicFlow 实例 + 由组件接管渲染后副作用（显示侧边栏 + onReady 事件）
    onReadyRef.current(lfRef.current)
  }, [
    containerRef,
    propsRef,
    logicJson,
    disabled,
    use,
    register,
    initMenu,
    initTouchEventBridge,
    fitViewAll,
    isDark,
    applyDarkTheme,
    scheduleMobileResize,
  ])

  /**
   * 缩放视口：放大/缩小/自适应
   * @param zoom true=放大(内置刻度), false=缩小, 'fit'=fitView自适应全部节点, 1=重置+居中, number=直接设置比例
   */
  const zoomViewport = useCallback(async (zoom: boolean | number | string) => {
    const lf = lfRef.current
    if (!lf) return
    if (zoom === true) {
      lf.zoom(true)
    } else if (zoom === false) {
      lf.zoom(false)
    } else if (zoom === 1) {
      // PC 端自适应：zoom(1) 重置缩放 + translateCenter 居中
      lf.zoom(1)
      if (lf.translateCenter) lf.translateCenter()
    } else if (zoom === 'fit') {
      // 自适应：显示全部节点并居中，最大缩放 100%
      if (lf.fitView) {
        fitViewAll()
      } else {
        // fallback
        if (lf.translateCenter) lf.translateCenter()
        lf.resetZoom ? lf.resetZoom() : lf.zoom(1)
      }
    } else if (typeof zoom === 'number') {
      lf.zoom(zoom)
    }
  }, [fitViewAll])

  const undoOrRedo = useCallback(async (undo: boolean) => {
    const lf = lfRef.current
    if (!lf) return
    if (undo) {
      lf.undo(undo)
    } else {
      lf.redo(undo)
    }
  }, [])

  /** 清空画布（经典模式清数据；仿钉钉模式重置为初始模板并重渲染） */
  const clear = useCallback(async () => {
    const lf = lfRef.current
    if (!lf) return
    if (isClassics(logicJson.current.modelValue)) {
      lf.clearData()
    } else {
      logicJson.current = {
        ...logicJson.current,
        ...initMimicData,
      }
      lf.render(logicJson.current)
    }
  }, [logicJson])

  /** 下载流程图（PNG 快照） */
  const downLoad = useCallback(() => {
    const lf = lfRef.current
    if (!lf) return
    lf.getSnapshot(logicJson.current.flowName, {
      fileType: 'png',
      backgroundColor: themeColorsRef.current.snapshotBg,
    })
  }, [logicJson])

  /** 下载流程 json 文件 */
  const downJson = useCallback(async () => {
    try {
      getBaseInfoRef.current()
      const lf = lfRef.current
      if (lf) {
        const graphData = lf.getGraphData()
        logicJson.current['nodes'] = graphData['nodes']
        logicJson.current['edges'] = graphData['edges']
      }
      const jsonString = logicFlowJsonToWarmFlow(logicJson.current)

      const filename = `${logicJson.current.flowName}_${logicJson.current.version}.json`
      // 格式化用于下载（先 parse 成对象再 stringify）
      const jsonPretty = JSON.stringify(JSON.parse(jsonString), null, 2)
      const blob = new Blob([jsonPretty], { type: 'application/json' })
      const downloadUrl = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = downloadUrl
      link.setAttribute('download', filename)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(downloadUrl)
    } catch (error) {
      console.error('下载失败:', error)
    }
  }, [logicJson])

  /** 获取当前画布图数据（LogicFlow getGraphData 原始结构），未初始化时为 null */
  const getGraphData = useCallback(() => {
    return lfRef.current ? lfRef.current.getGraphData() : null
  }, [])

  /** 自定义拖拽面板：调用 lf.dnd.startDrag 把节点拖入画布 */
  const handleDragInNode = useCallback(
    (type: string, properties: Record<string, any> = {}, text?: string) => {
      if (lfRef.current) {
        lfRef.current.dnd.startDrag({
          text,
          type,
          properties,
        })
      }
    },
    []
  )

  // 监听窗口变化，真机旋转屏幕时重绘（带防抖 + 抽屉标志屏蔽干扰）
  useEffect(() => {
    const handleMobileResize = () => {
      if (drawerActiveRef.current) return // 抽屉操作期间跳过
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current)
      resizeTimerRef.current = setTimeout(() => {
        const container = containerRef.current
        if (!container || !lfRef.current?.resize) return
        const w = container.clientWidth
        const h = container.clientHeight
        const last = lastCanvasSizeRef.current
        // 容器尺寸无显著变化（<5px 容差）则跳过，过滤掉抽屉/overlay 导致的微调
        if (Math.abs(w - last.w) < 5 && Math.abs(h - last.h) < 5 && last.w > 0) return
        lastCanvasSizeRef.current = { w, h }
        lfRef.current.resize()
      }, 300) // 300ms 确保布局稳定后再判断
    }

    // 抽屉打开/关闭标志：供 propertySetting 等组件通过 window 桥接调用
    window._markDrawerOpen = () => {
      drawerActiveRef.current = true
    }
    window._markDrawerClosed = () => {
      setTimeout(() => {
        drawerActiveRef.current = false
        // 抽屉关闭后一次性适配画布（仅移动端/平板）
        if (isMobileDevice() && lfRef.current?.resize) {
          lfRef.current.resize()
          requestAnimationFrame(() => {
            if (lfRef.current?.fitView) lfRef.current.fitView(40, 20)
          })
        }
      }, 350)
    }

    window.addEventListener('resize', handleMobileResize)
    return () => {
      window.removeEventListener('resize', handleMobileResize)
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current)
      // 复位渲染态只读标志（由本 Hook 在 initLogicFlow 设置）
      window.__WF_DESIGNER_DISABLED__ = false
    }
  }, [containerRef, isMobileDevice])

  // 暗黑模式切换：重绘画布主题（等价 Vue 版 watch(isDark)）
  useEffect(() => {
    if (!lfRef.current) return
    applyDarkTheme(lfRef.current, isDark)
  }, [isDark, applyDarkTheme])

  return {
    /** LogicFlow 实例盒子（`lfRef.current`），命令式访问 */
    lfRef,
    initLogicFlow,
    zoomViewport,
    undoOrRedo,
    clear,
    downLoad,
    downJson,
    fitViewAll,
    fitViewIfMobile,
    handleDragInNode,
    getGraphData,
    /** 暗黑模式状态（来自 useTheme），供组件渲染深色样式 */
    isDark,
    themeColors,
  }
}
