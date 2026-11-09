# AGENTS.md — warm-flow-react-designer 模块规则

> 本文件只写 `warm-flow-react-designer` 的差异化规则。通用协作原则（先思考、最小改动、外科手术式、用证据验证、品牌保护、安全边界）以仓库根 [`../AGENTS.md`](../AGENTS.md) 为准。
>
> 注意：本模块是**前端工程，不属于 Maven 反应堆**，不受根 `AGENTS.md` 中 Java / JDK / ORM / SQL 规则约束；后端编译命令与本模块无关。

## 模块职责

`warm-flow-react-designer` 是 Warm-Flow 流程设计器的 **React 组件库 / npm 包工程**（包名 `@dromara/warm-flow-designer-react`，经典 + 仿钉钉双模式）。它由 `warm-flow-vue-designer` **移植**而来（非复制后放任分叉），目标是让 React 业务方（首要消费方：`D:\Projects\chipflow` 前端，React 19 + Fusion `@alifd/next`）能像 Vue 版那样 `import` 使用设计器。

**纯组件库**，无独立应用壳（无 `index.html`/`main.tsx`/`App.tsx`）。消费示例见 [`../warm-flow-designer-demo/warm-flow-next-designer-demo`](../warm-flow-designer-demo/warm-flow-next-designer-demo)（Fusion，:5183）。

与同族模块的分工：

- **`warm-flow-ui`**：稳定 webjar 源工程，构建产物供 `warm-flow-plugin-ui` 打进 jar。**维护态**。
- **`warm-flow-vue-designer`**：Vue3 组件库 + npm 化成果的**上游真源**。框架无关层的改动应先在 Vue 版做、再移植过来。
- **`warm-flow-react-designer`（本模块）**：React 组件库。移植中，尚未全量对齐（见「移植边界」）。

技术栈（以 `package.json` 为准）：

- React 19 + Vite 5 + TypeScript（`.tsx` / `.ts`）；**主入口 UI 库无关**，经 `src/ui` 适配层支持 Fusion Design（`@alifd/next` 1.27.x），为可选适配器。
- 流程图：`@logicflow/core` / `@logicflow/extension`（必选 peer）——**与 Vue 版共用同一套节点定义**（框架无关）。
- 图标：**离线 iconify**（`@iconify/react` + `src/icons` 的 `ep` / `wf` 集，图标数据与 Vue 版逐字相同）。
- 请求 axios；样式 Sass；`file-saver` 导出。
- **依赖结构**：库 `package.json` 的 `dependencies` 为空；框架（react / react-dom / logicflow）与 UI 库（@alifd/next）走 `peerDependencies`（UI 库为 optional），bundled 运行时（axios / file-saver / @iconify/react）走 `devDependencies`。**勿把框架 / UI 库放回 `dependencies`**。
- 包管理 **pnpm（workspace）**；`type: module`；**前端许可证为 MIT**（与后端 Apache 2.0 不同，勿混改 header）。

## 移植完成度（改动前务必先看这一节）

Vue 版组件层**已全量移植**，经 headless Chrome（CDP 真实点击）端到端验证，控制台 0 应用错误：

**已移植**：数据层（`src/data`：DataProvider 契约 + http / mock）/ api / LogicFlow 节点层（`classics/js`、`mimic/js`、`common/js/tool.ts`）/ 画布引擎 Hook（`hooks/useLogicFlowCanvas`）/ UI 适配层（`uiAdapter` 契约 + Fusion `nextAdapter` + 28 个中性 `wf-*` 组件 + 若干 UI 库差异垫片）/ i18n / 主题（`hooks/useTheme`）/ `FlowDesigner` 编排 / Header / Toolbar / DiagramSidebar / BaseInfo / BaseNode（仿钉钉节点卡片）/ **PropertySetting（属性抽屉）+ start·between·end·gateway·skip·nodeExtList（6 个属性面板）** / **selectUser + UserPicker{Tree,Search,SelectedBar}（办理人选择器）** / **EdgeTooltip（边「+」浮层）**。`initEvent` 已接回全部画布事件（node:click / edit:node / show:EdgeSetting / show|hide:EdgeTooltip / delete:node / edge:add / blank:click）。

**与 Vue 版的已知行为差异（均有意为之，勿当 bug 改回）**：

1. **经典模式 `edge:click`**：Vue 版事件名 `'edge:click  '` 尾部多两个空格，LogicFlow 实际派发 `'edge:click'`，故 Vue 版该监听**从不触发**（存量 bug）。React 版用正确事件名 = 修复。若要求两端严格一致，应改 Vue 版而非在 React 版复制 bug。
2. **表单校验自带实现**：不依赖 UI 库 `form.validate`（EP/antd/Fusion 签名各异），跨适配器一致。
3. **Fusion `fixedHeader` 规避**：SelectUser 表格用外层 CSS 滚动容器限高。Fusion 的 fixedHeader 走 React 19 已移除的 legacy `getChildContext`（getNode），未 shim 的宿主会抛错。已实测 Fusion 表格 cell 默认即 `vertical-align: middle`，故删 antd 块后无对齐回归。
4. **图标名大小写**：iconify 要求全小写且对集合做全量校验（一个非法名会拒绝整个集合）。`registerIcons()` 把 `wfIcons` 驼峰名归一化为小写注册，`SvgIcon` 查找同步转小写。数据文件仍与 Vue 版逐字一致。

**样式移植机制**：组件 SCSS 由 `warm-flow-react-designer/.tmp-scss-port`（转换脚本，见下）从 Vue 版转换而来——剥离 Vue scoped 语法（`:deep`/`::v-deep`/`::deep`/`:global`/`::global`）、EP 类名 `.el-*` → Fusion `.next-*`（含 `.ant-*` 并行块删除，因 Fusion 无 `.ant-` 前缀且翻译后与 `.el-*` 结果重复）、各文件套命名空间根类（Vue 的 `<style scoped>` 在 React 里会泄漏全局）、`@import` 提到顶层。`html.dark` 祖先选择器改写为 `html.dark &` 以免嵌套后祖先关系倒置。汇总入口 `components/design/common/react/panels.scss`，由 `assets/styles/designer.scss` 引入。改样式优先改 Vue 版源、再跑转换脚本，保持两端一致。

## 移植原则（Vue → React 的对应关系）

框架无关层（数据 / 节点 / 主题 token / i18n catalog / tool.ts）**原样移植**，逐字对齐 Vue 版，便于后续上游同步；框架相关层按 React 语义重写。对照表：

| Vue 版 | React 版 |
|---|---|
| `ref()`（渲染相关） | `useState` |
| `ref()`（命令式、不想触发渲染） | `useRef` 盒子（`MutableBox`） |
| `computed()` | `useMemo` |
| `watch(x, cb)` | `useEffect(() => cb(), [x])` |
| `onMounted` / `onUnmounted` | `useEffect(() => { ...; return cleanup }, [])` |
| `defineExpose` | `forwardRef` + `useImperativeHandle` |
| `emit('saved')` | `onSaved` 回调 prop |
| 具名插槽 `#sidebar` | render-prop `sidebar={({...}) => ...}` |
| `v-model:xxx` | 受控 `value` + `onChange` |
| `app.use(plugin)` + 全局组件 `wf-*` | 具名导出 `WfButton` 等（React 无全局注册） |
| 自定义指令 `v-click-outside` | 组件内原生 `document` 监听（适配器不提供指令） |
| `createApp(h(VueComp))` 挂进 LogicFlow HtmlNode | `createRoot(...).render(createElement(ReactComp))` |

**易错点**：`useRef().current` 的写入**不触发重渲染**（Vue 的 `ref().value` 会）。凡渲染期要读的逻辑数据（如 `logicJson`），mutation 后须显式 `bumpLogicJson()` 补一次渲染 —— 见 `FlowDesigner.tsx` 的 `logicJsonTick`。这是本模块踩过的真实坑，勿重犯。

## 常用命令

> 包管理为 **pnpm workspace**（根 `pnpm-workspace.yaml` 含本库 + `warm-flow-vue-designer` + `warm-flow-designer-demo/*`）。

```bash
# 仓库根：一次装齐 库 + 全部 demo
pnpm install

# 库（在 warm-flow-react-designer/）
pnpm build:lib     # 组件库构建 -> dist-lib/（主 ESM + next 适配器 + .d.ts + 合并样式）
pnpm build:next    # 仅构建 Fusion 适配器子入口
pnpm dev           # 库开发：vite build --config vite.lib.config.js --watch，持续重建 dist-lib
pnpm mock          # 零依赖 node mock HTTP 服务（:8080，与 Vue 版共用同一份 server.mjs）

# 消费示例（在 warm-flow-designer-demo/warm-flow-next-designer-demo/）
pnpm dev           # :5183
```

> ⚠️ **`pnpm run <script>` 在本仓库会失败**（根 `pnpm-workspace.yaml` 的 `allowBuilds` 是未填的占位符，pnpm 的 run 前置 deps 检查硬失败）。直接调二进制：`./node_modules/.bin/vite build --config vite.lib.config.js`。修 `allowBuilds` 属改签入文件，需先与用户确认。

**推荐开发循环**：一个终端库目录 `./node_modules/.bin/vite build --config vite.lib.config.js --watch`，另一个终端 demo 目录 `./node_modules/.bin/vite`；改库源即重建产物并反映到 demo。

## 改动前必读

- **后端契约**：设计器读写的流程定义 JSON、节点属性、办理人 / 条件 / 监听器结构需与后端 `dto` / `vo` 及 core 实体对齐。该契约**与 Vue 版共享**，改字段先看后端 + Vue 版。
- **上游同步**：框架无关层（`src/data` / `src/config` / `src/icons` / `components/design/**/js` / `common/js/tool.ts` / `i18n` catalog）原则上从 Vue 版同步而来。改这些文件时考虑是否应先在 Vue 版改、再移植过来，避免两端分叉。
- **数据层解耦**：经 `src/data` 的 `DataProvider` 抽象数据源。组件内不要直连具体后端，走 `@/api`（委托 `getDataProvider()`）。
- 复用既有模式（组件、Hooks、适配器、公共样式），不要另起一套风格。

## UI 适配层（UI 库解耦）

设计器对具体 UI 库的依赖收敛到 `src/ui` 适配层，**主入口 UI 库无关**：

- **命令式 UI 一律走适配器**：消息 / 通知 / 弹框 / loading 统一通过 `src/ui/uiAdapter` 的 `getUiAdapter()`。**核心代码禁止直接 import 任何 UI 库**——只有 `src/ui/nextAdapter.tsx` 可引 `@alifd/next`。
- **主入口 UI 库无关**：主 bundle `dist-lib/warm-flow-designer-react.es.js` **零 `@alifd/next` import**（已实测）。消费方**必须**在渲染 `FlowDesigner` 前显式 `setUiAdapter(...)`，否则中性组件 `getUiAdapter()` 抛错。
- **Fusion 为可选子入口**：`src/ui/nextAdapter.tsx` → `vite.next.config.js`（`build:next`）→ `dist-lib/next.es.js` → 包导出 `@dromara/warm-flow-designer-react/next`。externalize `react` / `react-dom` / `@alifd/next` 为 peer。
- **组件层中性化**：28 种 UI 组件已包成中性 `Wf*`（`src/ui/components`），按当前 adapter 的 `components` 映射渲染。新写 UI 用中性 `<Wf*>`，**不新增直连 Fusion 组件的耦合**。
- **适配器要吸收 UI 库差异，组件层不感知**：例：Fusion `Balloon.Tooltip` 的 `trigger`/children 语义与 EP 相反，垫片写在 `nextAdapter.tsx` 的 `TooltipShim`，组件仍按 EP 语义写 `<WfTooltip title=...><WfButton/></WfTooltip>`。
- **新增 UI 库**：实现一份同 `UiAdapter` 契约的适配器 + 拆独立子入口构建，**不在核心里写 `if (next) ... else ...`**。
- **对外契约**：`src/designer/index.ts` 的导出 + `package.json` 的 `exports`（`.` / `./next` / `./style`）是 npm API，向后兼容、优先「加法」。
- **`UiAdapter` 与 Vue 版的契约差异**：移除了 `clickOutside` / `loadingDirective`（Vue 自定义指令在 React 无对应物，改由组件内原生实现）。同步两端契约时注意此差异。

## 宿主侧要求（React 19 + Fusion）

Fusion 1.x 依赖 React 19 已移除的 `findDOMNode` / `render` / `unmountComponentAtNode`，在 React 19 下会抛 `findDOMNode is not a function`。**这是宿主职责，不进库产物**：

- chipflow 前端已内置 `build/fusion-react19-compat.mjs`（vite 8 / rolldown 版）；
- 本仓库 demo 提供等价插件 `warm-flow-next-designer-demo/fusion-react19-compat.mjs`（vite 5 / esbuild 版），配合 `react-legacy-compat` 补回三个 API。
- **React 18 宿主无需处理**。接入 chipflow 时无需额外配置（它已有 shim）。

## 高风险点

- **双模式一致**：经典（SVG 节点 + DiagramSidebar）与仿钉钉（HtmlNode + React 桥接，无面板）是两条不同实现路径，改动都要兼顾；节点状态颜色沿用后端 `chartStatusColor*` 配置语义。
- **前后端契约**：流程定义 JSON 与后端、Vue 版共享，改动要三方同步。
- **ref 不触发渲染**：见「移植原则」的易错点，渲染期数据 mutation 后必须 bump。
- **LogicFlow HtmlNode 桥接**：`mimic/js/baseNodeView.tsx` 用 `createRoot` 把 React 组件塞进 SVG foreignObject，卸载须 `root.unmount()`（放在 `setTimeout(0)` 避免渲染期同步卸载报错）。
- **npm 对外契约**：`designer/index.ts` 导出、`DataProvider` / `UiAdapter` 接口、`package.json` 的 `exports` / 包名是已发布契约，向后兼容优先「加法」。
- **构建**：纯库只有 `build:lib`（`dist-lib/`）；改 `vite.lib.config.js` 的 external / 入口后，跑 `build:lib` + demo `pnpm build` 验证消费正常。主 bundle 必须保持**零 UI 库 import**。
- **依赖版本**：锁定版本不随意升级；新增依赖先评估必要性与体积（尤其会进 `dist-lib` 的运行时依赖）。

## 验证

- 改动后至少库 `build:lib` 成功 + demo `build` 成功（验证包消费）。
- **构建通过 ≠ 运行通过**：本模块的画布 / 桥接类改动须实际渲染验证。可用 headless Chrome dump DOM 检查关键标记（`wf-react-designer` / `lf-node` / `base-node` / `diagram-sidebar`）与 console 错误；两条路径分别验：`?onlyDesign=true`（画布）、`?onlyDesign=true&model=CLASSICS`（经典 + 侧栏）。
- UI 适配 / 组件中性化改动：确认核心代码无残留直连 `@alifd/next` 命令式 API；切换 adapter 后消息 / 弹框 / loading 行为正常。
- 无法验证时如实报告命令、现象与风险，不要声称构建通过。

## UI 设计规范（Design System）

设计 token 与视觉规范**与 Vue 版一致**（同一套 `--wf-*` 变量，`src/config/themeConfig.ts` 为 SSOT，`src/assets/styles/tokens.scss` 为静态默认层）。样式集中在 `src/assets/styles/designer.scss`（React 无 scoped 样式，全部挂 `.wf-react-designer` 根类名下避免污染宿主全局）。

- 扁平 + iOS / macOS 质感，主色蓝 `#409eff`；禁止在组件里写死十六进制色，用 `var(--wf-*, fallback)`。
- 新增 UI 组件 / 面板：先看 Vue 版 `warm-flow-ui/AGENTS.md` 的「UI 设计规范」全节（输入控件 / 表单标签 / 页签 / 表格 / 单选 / 按钮 / 抽屉 / 画布节点 / 暗黑模式），按同一规范实现 React 版。
- **EP 专属选择器要适配**：Vue 版样式里针对 `.el-*` 写的选择器，React 版须换成 Fusion 类名（`.next-btn` 等）或中性类名；暗黑模式同样要补 `html.dark` 覆盖。
- **运行态语义不可破坏（红线）**：节点 `status=在办/已办` 或 `chartStatusColor` 存在时保留后端状态色；设计态语义色只在设计器页面生效（全局标志 `window.__WF_FLOW_DESIGN_MODE__`）且节点无运行状态时才覆盖。双模式一致。

## 品牌与协议

保留 Apache 2.0 / MIT 双许可中**前端为 MIT**（见 `LICENSE`，与 Vue 版同源 ruoyi lineage）、`@author warm` 注释、`org.dromara.warm` 后端品牌与 README 链接一致，不弱化「永久开源免费」声明。
