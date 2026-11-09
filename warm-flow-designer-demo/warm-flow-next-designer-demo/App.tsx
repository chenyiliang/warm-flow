import { useRef, useState } from 'react'
import { FlowDesigner, useFlowDesigner } from '@dromara/warm-flow-designer-react'
import type {
  FlowDesignerInstance,
  FlowDesignerSavedPayload,
  FlowDesignerNodeClickPayload,
} from '@dromara/warm-flow-designer-react'
import { Button, Message, Switch, Input, Card } from '@alifd/next'

/**
 * Warm-Flow 设计器 React 版消费示例（Fusion Design）。
 *
 * 演示三类用法：
 * 1. 模板 ref / useFlowDesigner 命令式 API（save / getFlowJson / zoom / validateStructure）
 * 2. 事件回调（onReady / onNodeClick / onSaved / onClose / onDirty）
 * 3. initialJson 脱后端驱动（直接喂一段流程 JSON，不请求后端）
 *
 * 与三个 Vue demo 内容对齐，仅 UI 库不同（本 demo 用 @alifd/next）。
 *
 * @author warm
 */

/**
 * 一段最小可用的 warm-flow 流程定义（仿钉钉模型），用于 initialJson 脱后端渲染。
 *
 * 字段形状须对齐后端定义：
 * - 每个 node 必带 `nodeRatio`（tool.ts 直接 `node.nodeRatio.toString()`，缺省会抛错）
 *   与 `coordinate`（`'x,y|textX,textY'`）。
 * - **`skipList` 挂在每个 node 内部**，不是定义顶层。`json2LogicFlowJson` 是
 *   `nodeList.reduce` 收集各节点的 skipList 来生成边的（见 tool.ts）；写成顶层 skipList
 *   会被完全忽略，画布只渲染节点、没有任何连线。
 */
const INITIAL_FLOW_MIMIC = {
  flowName: '示例请假流程',
  flowCode: 'demo_leave',
  modelValue: 'MIMIC',
  version: '1',
  nodeList: [
    {
      nodeType: 0, nodeCode: 'start_1', nodeName: '开始', nodeRatio: '0', coordinate: '700,100|700,100',
      skipList: [{ id: 'skip_1', nowNodeCode: 'start_1', nextNodeCode: 'between_1', skipName: '', skipType: 'PASS' }],
    },
    {
      nodeType: 1, nodeCode: 'between_1', nodeName: '部门审批', nodeRatio: '0', coordinate: '700,250|700,250',
      permissionFlag: 'role:1',
      skipList: [{ id: 'skip_2', nowNodeCode: 'between_1', nextNodeCode: 'end_1', skipName: '', skipType: 'PASS' }],
    },
    { nodeType: 2, nodeCode: 'end_1', nodeName: '结束', nodeRatio: '0', coordinate: '700,400|700,400' },
  ],
}

/**
 * 经典模式（CLASSICS）定义：走 SVG 节点 + 左侧拖拽面板，与仿钉钉（HtmlNode + 无面板）
 * 是两条不同的画布实现路径。?model=CLASSICS 时用它，便于分别验证双模式。
 */
const INITIAL_FLOW_CLASSICS = {
  ...INITIAL_FLOW_MIMIC,
  flowName: '示例请假流程（经典）',
  flowCode: 'demo_leave_classic',
  modelValue: 'CLASSICS',
  nodeList: [
    {
      nodeType: 0, nodeCode: 'start_1', nodeName: '开始', nodeRatio: '0', coordinate: '180,260|180,260',
      skipList: [{ id: 'skip_1', nowNodeCode: 'start_1', nextNodeCode: 'between_1', skipName: '', skipType: 'PASS' }],
    },
    {
      nodeType: 1, nodeCode: 'between_1', nodeName: '部门审批', nodeRatio: '0', coordinate: '430,260|430,260',
      permissionFlag: 'role:1',
      skipList: [{ id: 'skip_2', nowNodeCode: 'between_1', nextNodeCode: 'end_1', skipName: '', skipType: 'PASS' }],
    },
    { nodeType: 2, nodeCode: 'end_1', nodeName: '结束', nodeRatio: '0', coordinate: '680,260|680,260' },
  ],
}

export default function App() {
  // 命令式 API（空安全包装 + designerRef）
  const { designerRef, save, getFlowJson, zoomIn, zoomOut, fitView, undo, redo, validateStructure, isDirty } =
    useFlowDesigner()

  const [log, setLog] = useState<string[]>([])
  const [json, setJson] = useState('')
  // ?onlyDesign=true 直达画布（便于自动化验证画布渲染路径，等价手动打开「仅画布模式」开关）
  const [onlyDesign, setOnlyDesign] = useState(
    () => new URLSearchParams(window.location.search).get('onlyDesign') === 'true'
  )
  // ?model=CLASSICS 走经典模式（SVG 节点 + 左侧拖拽面板），默认仿钉钉（HtmlNode 桥接 + 无面板）。
  // 双模式是两条不同的画布实现路径，分别验证。
  const flowModel = new URLSearchParams(window.location.search).get('model') === 'CLASSICS'
    ? 'CLASSICS'
    : 'MIMIC'
  const initialFlow = flowModel === 'CLASSICS' ? INITIAL_FLOW_CLASSICS : INITIAL_FLOW_MIMIC
  // key 用于强制重挂载（onlyDesign 切换时重建画布，规避运行时反向重渲染）
  const [designerKey, setDesignerKey] = useState(0)

  const appendLog = (line: string) => {
    setLog((prev) => [`${new Date().toLocaleTimeString()}  ${line}`, ...prev].slice(0, 30))
  }

  const handleReady = () => appendLog('onReady: 画布初始化完成')

  const handleNodeClick = (payload: FlowDesignerNodeClickPayload) =>
    appendLog(`onNodeClick: ${payload.type} / ${payload.id}`)

  const handleSaved = (payload: FlowDesignerSavedPayload) =>
    appendLog(`onSaved: id=${payload.id ?? '(新建)'} json=${payload.json.slice(0, 40)}...`)

  const handleClose = () => appendLog('onClose: 宿主收到关闭请求')

  const handleDirty = (dirty: boolean) => appendLog(`onDirty: ${dirty}`)

  const handleShowJson = () => {
    const j = getFlowJson()
    setJson(j)
    appendLog(`getFlowJson: ${j.length} 字符`)
  }

  const handleValidate = () => {
    const result = validateStructure()
    if (result.valid) {
      Message.success('流程结构校验通过')
      appendLog('validateStructure: 通过')
    } else {
      Message.warning(result.errors.join('；'))
      appendLog(`validateStructure: 未通过 -> ${result.errors.join('；')}`)
    }
  }

  const handleToggleOnlyDesign = (checked: boolean) => {
    setOnlyDesign(checked)
    // 切换模式需重建画布（用 key 重挂载）
    setDesignerKey((k) => k + 1)
    appendLog(`onlyDesignShow -> ${checked}`)
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* 左侧：集成案例面板（命令式工具条 + 事件日志 + 实时 JSON） */}
      <div
        style={{
          width: 320,
          flexShrink: 0,
          borderRight: '1px solid #e2e8f0',
          padding: 12,
          overflowY: 'auto',
          background: '#fafafa',
        }}
      >
        <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>React + Fusion 集成案例</h3>

        <div style={{ marginBottom: 12 }}>
          <span style={{ marginRight: 8, fontSize: 13 }}>仅画布模式（onlyDesignShow）</span>
          <Switch checked={onlyDesign} onChange={handleToggleOnlyDesign} />
        </div>

        <Card title="命令式 API（useFlowDesigner）" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <Button size="small" type="primary" onClick={() => save()}>保存</Button>
            <Button size="small" onClick={handleValidate}>结构校验</Button>
            <Button size="small" onClick={handleShowJson}>读取 JSON</Button>
            <Button size="small" onClick={() => zoomIn()}>放大</Button>
            <Button size="small" onClick={() => zoomOut()}>缩小</Button>
            <Button size="small" onClick={() => fitView()}>自适应</Button>
            <Button size="small" onClick={() => undo()}>撤销</Button>
            <Button size="small" onClick={() => redo()}>重做</Button>
            <Button size="small" onClick={() => appendLog(`isDirty: ${isDirty()}`)}>脏检查</Button>
          </div>
        </Card>

        <Card title="事件日志" style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, lineHeight: 1.7, color: '#606266', maxHeight: 220, overflowY: 'auto' }}>
            {log.length === 0 ? <span style={{ color: '#909399' }}>（暂无事件）</span> : null}
            {log.map((line, i) => (
              <div key={i} style={{ borderBottom: '1px dashed #ebeef5', padding: '2px 0' }}>
                {line}
              </div>
            ))}
          </div>
        </Card>

        {json ? (
          <Card title="当前流程 JSON" style={{ marginBottom: 12 }}>
            <Input.TextArea value={json} readOnly rows={8} style={{ width: '100%', fontSize: 11 }} />
          </Card>
        ) : null}
      </div>

      {/* 右侧：设计器本体 */}
      <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
        <FlowDesigner
          key={designerKey}
          ref={designerRef as React.Ref<FlowDesignerInstance>}
          initialJson={initialFlow}
          onlyDesignShow={onlyDesign}
          showGrid
          onReady={handleReady}
          onNodeClick={handleNodeClick}
          onSaved={handleSaved}
          onClose={handleClose}
          onDirty={handleDirty}
        />
      </div>
    </div>
  )
}
