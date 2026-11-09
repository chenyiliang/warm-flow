import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { HtmlNode } from '@logicflow/core'
import BaseNode from '../react/BaseNode'
import type { BaseNodeProps } from '../react/BaseNode'

/**
 * 仿钉钉模式自定义节点视图（React 版，移植自 mimic/js/baseNodeView.ts）。
 *
 * LogicFlow 的 HtmlNode 把一个真实 DOM 节点塞进 SVG foreignObject；Vue 版用 `createApp(h(...))`
 * 把 baseNode.vue 挂进去，React 版改用 `createRoot(...).render(createElement(BaseNode, props))`。
 *
 * 与 Vue 版的关键差异：
 * - **createApp/h -> createRoot/createElement**：挂载与更新机制换成 React 18 并发根。
 * - **更新方式**：Vue 版直接改 `this.r.component.props.xxx` 触发响应式；React 版调用
 *   `root.render(...)` 重新渲染新 props（React 幂等渲染同一 root 即 diff 更新）。
 * - **不再需要 v-click-outside 指令**：Vue 版从 uiAdapter 取 clickOutside 指令挂到子 app，
 *   React 版 BaseNode 内部用原生 document mousedown 监听实现点击外部，适配器无需提供指令。
 *
 * react-dom 作为 peerDependency 由消费方提供（构建时 externalize），故此处可直接 import。
 *
 * @author warm
 */
export class BaseNodeView extends HtmlNode {
  private root: Root | null = null
  private isMounted = false
  /**
   * 上次渲染的属性快照（JSON 字符串），用于 shouldUpdate 判断是否需要重渲染。
   *
   * **用 `declare` 而非重新声明**：基类 HtmlNode 已定义 `preProperties?: string`
   * （Vue 版 JS 里是直接 this.preProperties 赋值，TS 版必须复用基类字段，否则报 TS2612
   * 覆盖基类属性）。declare 只补类型、不生成运行时代码，字段仍由基类持有。
   */
  declare preProperties?: string
  /** 上次渲染的节点文本，用于 shouldUpdate 判断文本是否变化（本类自有字段） */
  private preText: string | undefined

  constructor(props: any) {
    super(props)
  }

  /**
   * 组装当前 BaseNode 的 props（含回调），供 render / 更新复用。
   *
   * model.properties 在 LogicFlow 类型里是 `Record<string, unknown>`，而 BaseNode 的 props
   * 是具体类型（permissionFlag: string 等），故此处按 BaseNodeProps 断言收敛。
   * 运行时值来自画布节点 properties，形状与 Vue 版一致。
   */
  private buildProps(): BaseNodeProps {
    const model = this.props.model
    const nodeStyle: any = model.getNodeStyle()
    const properties: any = model.properties ?? {}
    return {
      text: model.text?.value ?? model.inputData,
      permissionFlag: properties.permissionFlag,
      chartStatusColor: properties.chartStatusColor,
      status: properties.status,
      type: model.type,
      fill: nodeStyle.fill,
      stroke: nodeStyle.stroke,
      onUpdateNodeName: (nodeName: string) => {
        model.text.value = nodeName
        model.graphModel.eventCenter.emit('update:nodeName', {
          id: model.id,
          nodeName,
        })
      },
      onEditNode: () => {
        model.graphModel.eventCenter.emit('edit:node', { id: model.id, click: true })
      },
      onDeleteNode: () => {
        model.graphModel.eventCenter.emit('delete:node', { id: model.id })
      },
    }
  }

  shouldUpdate(): boolean {
    const currentProperties = JSON.stringify(this.props.model.properties)
    const currentText = this.props.model.text?.value
    if (this.preProperties !== undefined) {
      let flag = false
      if (
        JSON.parse(currentProperties).permissionFlag !==
        JSON.parse(this.preProperties).permissionFlag
      ) {
        this.preProperties = currentProperties
        flag = true
      }
      if (currentText !== this.preText) {
        this.preText = currentText
        flag = true
      }
      return flag
    }
    this.preProperties = currentProperties
    this.preText = currentText
    return true
  }

  /**
   * 挂载 / 更新节点内容。
   *
   * 参数类型沿用基类的 `SVGForeignObjectElement`（LogicFlow 把自定义 HTML 包在 foreignObject 里），
   * appendChild 在该类型上同样可用。
   */
  setHtml(rootEl: SVGForeignObjectElement): void {
    if (!this.isMounted) {
      this.isMounted = true
      const node = document.createElement('div')
      node.style.width = '100%'
      node.style.height = '100%'
      rootEl.appendChild(node)
      // React 18 并发根：挂载 BaseNode 组件树
      this.root = createRoot(node)
      this.root.render(createElement(BaseNode, this.buildProps()))
    } else if (this.root) {
      // 已挂载：重新渲染最新 props（React 对同一 root 幂等 diff 更新）
      this.root.render(createElement(BaseNode, this.buildProps()))
    }
  }

  /**
   * 节点卸载时释放 React root，避免内存泄漏。
   *
   * HtmlNode（preact 风格生命周期）暴露的卸载钩子是 `componentWillUnmount()`，
   * 不是 `destroy()`——后者是 LogicFlow 实例 / 事件中心上的方法，节点视图上没有。
   * Vue 版没有卸载逻辑（createApp 的实例随宿主 DOM 一起被 GC），React 的并发根必须显式 unmount。
   */
  componentWillUnmount(): void {
    if (this.root) {
      // React 18：卸载放到下一个宏任务，避免在渲染阶段同步卸载告警
      const root = this.root
      this.root = null
      setTimeout(() => {
        try {
          root.unmount()
        } catch {
          // ignore：节点可能已随画布移除
        }
      }, 0)
    }
    super.componentWillUnmount()
  }
}
