# warm-flow-next-designer-demo

Warm-Flow 设计器 React 版（`@dromara/warm-flow-designer-react`）的 **Fusion Design（`@alifd/next`）** 消费示例。

以干净的第三方工程（仅 `react` + `@alifd/next` + 包本身）消费库的 `dist-lib`，演示「命令式 API / 事件回调 / initialJson 脱后端驱动」三类用法，数据用库内置 `createMockProvider()` 内存 mock 脱后端运行。

与三个 Vue demo（ep :5180 / antdv4 :5181 / naive :5182）并列，本 demo 用 **:5183**。

## 运行（pnpm workspace）

```bash
# 1) 先在库工程构建产物
cd ../../warm-flow-react-designer && ./node_modules/.bin/vite build --config vite.lib.config.js && ./node_modules/.bin/vite build --config vite.next.config.js
# 2) 启动本 demo
cd ../warm-flow-designer-demo/warm-flow-next-designer-demo
./node_modules/.bin/vite      # http://localhost:5183
```

> ⚠️ `pnpm dev` 在本仓库会失败：根 `pnpm-workspace.yaml` 的 `allowBuilds` 是未填的占位符，
> pnpm 的 run 前置 deps 检查硬失败。直接调 `./node_modules/.bin/vite` 绕过即可。

库通过 `"@dromara/warm-flow-designer-react": "workspace:*"` 本地消费其 `dist-lib`，改库后重新构建即生效。

## URL 参数（便于自动化验证）

| 参数 | 作用 |
|---|---|
| `?onlyDesign=true` | 直达画布（跳过基础信息步骤），等价手动打开「仅画布模式」开关 |
| `?model=CLASSICS` | 走经典模式（SVG 节点 + 左侧拖拽面板）；默认 `MIMIC`（仿钉钉 HtmlNode 桥接，无面板） |

两条路径是不同的画布实现，需分别验证：

- `http://localhost:5183/?onlyDesign=true` —— 仿钉钉画布 + React↔LogicFlow HtmlNode 桥接
- `http://localhost:5183/?onlyDesign=true&model=CLASSICS` —— 经典画布 + DiagramSidebar

## React 19 + Fusion 兼容

`vite.config.ts` 里挂了 `fusionReact19Compat()`（`fusion-react19-compat.mjs`）：React 19 移除了
`findDOMNode` / `render` / `unmountComponentAtNode`，而 Fusion 1.x 及其依赖 `@alifd/overlay`、
`react-transition-group@2` 仍在用，不补 shim 会抛 `findDOMNode is not a function`。

插件生成一个 re-export 真实 `react-dom` 并补回三个 API 的 shim 模块，再把白名单内遗留包对
`'react-dom'` 的引用改写到 shim（**只按白名单逐包改写**——全局 alias 会与 `react-dom/client`
形成初始化死锁）。与 chipflow 前端的 `build/fusion-react19-compat.mjs` 同源，本 demo 适配
vite 5 的 esbuild 预构建（chipflow 是 vite 8 / rolldown，用 `rolldownOptions.plugins`）。

这是**宿主侧**职责，不进库产物；React 18 宿主无需处理。

## 已知边界

库本身尚未移植完（节点属性抽屉 `PropertySetting`、办理人选择器 `selectUser`、边「+」浮层
`EdgeTooltip`），故本 demo 未演示这些交互。详见库 README 的「移植边界」。

另外 `main.tsx` 刻意未用 `<StrictMode>`：StrictMode 开发期的「挂载→卸载→再挂载」会让
LogicFlow 画布的 DOM 容器初始化异常（画布类库通病，与 React 版本身无关）。生产构建不受影响。
