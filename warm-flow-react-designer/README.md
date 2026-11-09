<p align="center">
	<img alt="logo" src="https://foruda.gitee.com/images/1726820610127990120/c8c5f3a4_2218307.png" width="100">
</p>
<h1 align="center" style="margin: 30px 0 30px; font-weight: bold;">Warm-Flow 设计器 React 版</h1>

# @dromara/warm-flow-designer-react

Warm-Flow 流程设计器（经典 + 仿钉钉双模式）的 **React 组件库**，移植自 Vue 版 [`@dromara/warm-flow-designer`](../warm-flow-vue-designer)。主入口 **UI 库无关**，经适配器支持 Fusion Design（`@alifd/next`），并预留 Ant Design / Arco 等扩展位。

> 状态：**组件层已全量移植**。画布渲染 / 节点拖拽 / 连线 / 缩放撤销 / 导出 / 保存 / 双模式切换 / 基础信息编辑 / 节点属性抽屉 / 办理人选择 / 边「+」浮层均已实现，并经 headless Chrome 端到端验证。与 Vue 版的已知差异见文末「移植完成度」。

## 与 Vue 版的关系

三者是同一套设计器的不同形态，**流程定义 JSON 契约完全一致**（与后端 `warm-flow-plugin-ui` 共享），可混用于同一后端：

| 模块 | 形态 | 消费方 |
|---|---|---|
| `warm-flow-ui` | webjar 源工程（iframe 集成，jar 内置） | 后端 jar |
| `warm-flow-vue-designer` | Vue3 组件库 `@dromara/warm-flow-designer` | Vue 业务方 |
| **`warm-flow-react-designer`（本模块）** | React 组件库 `@dromara/warm-flow-designer-react` | React 业务方（如 chipflow） |

框架无关层（数据层 `DataProvider`、LogicFlow 节点层、主题 token、i18n catalog、`tool.ts` JSON 互转）从 Vue 版**原样移植**，故两端行为对齐；框架相关层（组件、适配器、响应式）按 React 语义重写。

## 构建库产物

```bash
pnpm build:lib   # 输出 dist-lib/（ESM + .d.ts + 合并样式 + Fusion 适配器子入口）
```

产物：

- `dist-lib/warm-flow-designer-react.es.js` —— 主入口（**UI 库无关**，零 `@alifd/next` import）
- `dist-lib/next.es.js` —— Fusion Design 适配器子入口
- `dist-lib/warm-flow-designer-react.css` —— 合并样式（含 `--wf-*` design token）
- `dist-lib/**/*.d.ts` —— 类型声明

## 安装与初始化

> 主入口不内置任何 UI 库。渲染 `FlowDesigner` 前必须先 `setUiAdapter(...)`，否则中性组件 `wf-*` 无法映射、画布不渲染。

```tsx
import { createRoot } from 'react-dom/client'
import { FlowDesigner, setUiAdapter, setDataProvider, createMockProvider } from '@dromara/warm-flow-designer-react'
import { nextAdapter } from '@dromara/warm-flow-designer-react/next'   // Fusion Design 适配器
import '@dromara/warm-flow-designer-react/style'
import '@alifd/next/dist/next.css'                                     // UI 库样式由消费方引入

// ① 选择 UI 适配器（必须在渲染 FlowDesigner 之前调用）
setUiAdapter(nextAdapter)
// ② 可选：注入自定义数据源 / mock（脱后端）
setDataProvider(createMockProvider())

createRoot(document.getElementById('app')!).render(<App />)
```

## 组件用法

React 用 **ref + 回调 props** 替代 Vue 的「模板 ref + emit + 插槽」：

```tsx
import { FlowDesigner, useFlowDesigner } from '@dromara/warm-flow-designer-react'

function Page() {
  const { designerRef, save, getFlowJson } = useFlowDesigner()

  return (
    <>
      {/* 后端驱动：传 definitionId，组件自行 queryDef 加载 */}
      <FlowDesigner
        ref={designerRef}
        definitionId={defId}
        onlyDesignShow
        onSaved={(p) => console.log('saved', p.id)}
        onClose={() => console.log('close')}
      />
      <button onClick={save}>保存</button>
    </>
  )
}
```

```tsx
{/* 脱后端驱动：直接喂流程 JSON（initialJson 优先于 definitionId / queryDef） */}
<FlowDesigner initialJson={flowJson} onlyDesignShow onSaved={onSaved} />
```

### FlowDesigner Props

| 名称 | 类型 | 默认 | 说明 |
|---|---|---|---|
| definitionId | String | null | 流程定义 id，传入则 `queryDef` 加载，否则新建 |
| initialJson | String \| Object | null | 初始流程 JSON。**有值时优先于 definitionId**，不请求后端 |
| json | String \| Object | - | 受控 JSON（配合 `onJsonChange`）：初始注入 + 变更回写。不做运行时反向重渲染（重载请配合 `key` 重挂载） |
| disabled | Boolean | false | 只读模式（隐藏保存等编辑操作） |
| onlyDesignShow | Boolean | false | 仅显示画布（跳过基础信息步骤） |
| showGrid | Boolean | false | 画布显示网格点 |
| customNodes | Array | [] | 追加自定义 LogicFlow 节点 |
| extraExtensions | Array | [] | 追加自定义 LogicFlow 扩展（MiniMap / Control / Group） |
| lfOptions | Object | {} | 透传合并到 LogicFlow 初始化选项（`container` 由组件管理，勿传） |
| onBeforeUse | Function | - | 命令式扩展钩子：`LogicFlow.use` 之后、`new LogicFlow` 之前，可注册带配置扩展 |
| onRegister | Function | - | 命令式节点钩子：`customNodes` 之后、`render` 之前，透出 lf 实例 |
| paletteNodes | Object | - | 自定义经典模式左侧拖拽面板节点 `{ flowNodes?, gatewayNodes? }`（仅经典模式） |
| structureValidator | Function | - | 自定义结构校验 `(graph) => string[] \| void`，内置校验之后追加 |

### FlowDesigner Events（Vue emit → React 回调 props）

| 名称 | 回传 | 说明 |
|---|---|---|
| onClose | - | 宿主关闭回调（保存成功后自动触发） |
| onSaved | `{ id, data, json }` | 保存成功 |
| onReady | `{ lf }` | 画布初始化完成，透出 LogicFlow 实例 |
| onBeforeSave | `{ id, json, onlyDesignShow, setJson, preventDefault }` | 保存前（同步），可改写 json 或取消 |
| onChange | `{ dirty, getJson, getGraphData }` | 画布图数据变更（惰性 getter） |
| onDirty | `boolean` | 未保存状态翻转 |
| onValidateError | `{ source, fields? }` | 基础信息校验未通过 |
| onNodeClick | `{ id, type, data, lf }` | 画布节点被点击 |
| onJsonChange | `string` | 受控 json 回写（仅 `json` prop 受控时） |

### Slots → render-props

Vue 具名插槽改为 render-prop：`headerLeft` / `headerCenter` / `headerActions` / `sidebar` / `toolbarExtra` / `loadingSlot` / `emptySlot`。

### 命令式 API（FlowDesignerInstance）

经 `ref` 或 `useFlowDesigner()` 获取，与 Vue 版**同名同签名**：
`save` / `validate` / `getGraphData` / `getFlowJson` / `getFlowName` / `getLogicFlow` / `zoom` / `zoomIn` / `zoomOut` / `fitView` / `resetZoom` / `undo` / `redo` / `clear` / `downloadImage` / `downloadJson` / `isDirty` / `resetDirty` / `validateStructure`。

> 差异：Vue 版 `designerRef.value`，React 版 `designerRef.current`。

## Hooks

| Hook | 作用 |
|---|---|
| `useFlowDesigner()` | 命令式 API + 空安全包装（`{ designerRef, save, getFlowJson, ... }`） |
| `useFlowJson(designerRef)` | 流程 json 只读视图（`json` / `data` / `dirty` + `sync` + `bind`） |
| `useTheme()` | 暗黑模式与主题颜色（`isDark` / `themeColors` / `applyDarkTheme` …） |
| `useI18n()` | 订阅式国际化（`locale` / `t` / `setLocale`） |

`useFlowJson` 用法：

```tsx
const { designerRef } = useFlowDesigner()
const { json, data, dirty, bind } = useFlowJson(designerRef)
<FlowDesigner ref={designerRef} initialJson={initial} {...bind} />
<pre>{json}</pre>
```

## 国际化 / 主题

```ts
import { setLocale, setMessages, setCustomThemeColors } from '@dromara/warm-flow-designer-react'

setLocale('en')                                   // 内置 zh / en（catalog 与 Vue 版逐字相同）
setMessages('en', { common: { save: 'Save' } })   // 深合并扩展语言包
```

主题色走 `--wf-*` CSS 变量（SSOT 见 `src/config/themeConfig.ts`），消费方可覆盖 `:root` 整体换肤；暗黑模式经 `useTheme().setDark(true)` 或父页面 `postMessage({ type: 'theme-dark' })`。

## 适配新的 UI 库

实现一份 `UiAdapter` 契约（命令式反馈 message/notify/alert/confirm/prompt/loading + `components` 语义名映射），拆独立子入口构建，**不在核心里写 `if (antd) ... else ...`**。参考 `src/ui/nextAdapter.tsx`。

`UiAdapter` 相比 Vue 版**移除了 `clickOutside` / `loadingDirective` 两个「指令」字段**（React 无自定义指令，点击外部 / 区域 loading 由组件内原生实现）。

## 宿主侧要求（React 19 + Fusion）

Fusion 1.x 依赖 React 18 已移除的 `findDOMNode` / `render` / `unmountComponentAtNode`。在 **React 19** 下消费 Fusion，需宿主侧补一个兼容 shim（改写遗留包内部的 `react-dom` 引用）。chipflow 前端已内置 `build/fusion-react19-compat.mjs`；本仓库 `warm-flow-next-designer-demo` 亦提供等价插件示例。**这是宿主职责，不进库产物**；React 18 宿主无需处理。

## 运行消费示例

```bash
# 仓库根：一次装齐（库 + 全部 demo）
pnpm install

# 库：构建产物
cd warm-flow-react-designer && pnpm build:lib

# Fusion demo（:5183）
cd ../warm-flow-designer-demo/warm-flow-next-designer-demo && pnpm dev
```

推荐开发循环：一个终端库目录 `pnpm dev`（watch 重建 dist-lib），另一个终端 demo 目录 `pnpm dev`。

demo 支持 URL 参数便于验证：`?onlyDesign=true` 直达画布；`?model=CLASSICS` 走经典模式（默认 MIMIC 仿钉钉）。

## 移植完成度

Vue 版组件层已**全部移植**（PropertySetting 属性抽屉、6 个节点属性面板、selectUser 办理人选择器、EdgeTooltip 边浮层均已就位并接入画布事件）。

已移植：数据层 / api / LogicFlow 节点层（经典 + 仿钉钉）/ 画布引擎 Hook / UI 适配层（`uiAdapter` 契约 + Fusion `nextAdapter` + 28 个中性 `wf-*` 组件 + 若干 UI 库差异垫片）/ i18n / 主题 / `FlowDesigner` 编排 / Header / Toolbar / DiagramSidebar / BaseInfo / BaseNode（仿钉钉节点卡片）/ PropertySetting（属性抽屉）/ start·between·end·gateway·skip·nodeExtList（6 个属性面板）/ selectUser + UserPicker{Tree,Search,SelectedBar}（办理人选择器）/ EdgeTooltip（边「+」浮层）。

全部经 headless Chrome（CDP 真实点击）端到端验证：双模式画布渲染、节点/边属性抽屉打开与回填、办理人选择弹窗、边「+」加节点浮层，控制台 0 应用错误。

### 与 Vue 版的已知行为差异（均有意为之）

1. **经典模式点边能打开属性面板**：Vue 版 `eventCenter.on('edge:click  ')` 事件名尾部多两个空格，LogicFlow 实际派发 `'edge:click'`，故该监听**从不触发**（存量 bug）。React 版用正确事件名，已修复。
2. **表单校验自带实现**：不依赖 UI 库的 `form.validate`（EP/antd/Fusion 签名各异），跨适配器行为一致。
3. **`nodeFormExtra` 单一扩展点**：替代 Vue 版「全部插槽透传」（React 无对应概念）。
4. **Fusion `fixedHeader` 规避**：SelectUser 表格用外层 CSS 滚动容器限高，不用 Fusion 的 `fixedHeader`（它走 React 19 已移除的 legacy `getChildContext`，未 shim 的宿主会抛 `getNode is not a function`）。代价是表头不吸顶；宿主若已内置 legacy-context shim（chipflow 即有），可自行改回。
5. **图标名大小写**：iconify 要求全小写名且对集合做全量校验，故 `registerIcons()` 把 `wfIcons` 的驼峰名（flowName 等）归一化为小写注册，`SvgIcon` 查找时同样转小写。数据文件 `wfIcons.ts` 仍与 Vue 版逐字一致，便于上游同步。
