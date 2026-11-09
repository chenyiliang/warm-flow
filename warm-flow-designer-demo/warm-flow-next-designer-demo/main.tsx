import { createRoot } from 'react-dom/client'

// 像第三方一样，仅通过包名消费构建产物（workspace link → dist-lib）
import { setUiAdapter, setDataProvider, createMockProvider } from '@dromara/warm-flow-designer-react'
// 主入口 UI 库无关：显式选择 Fusion Design 适配器
import { nextAdapter } from '@dromara/warm-flow-designer-react/next'
import '@dromara/warm-flow-designer-react/style'

// Fusion 自身样式（消费方职责，库不内置任何 UI 库样式）
import '@alifd/next/dist/next.css'

import App from './App'

// ① 注册 UI 适配器：本 demo 用 Fusion Design（须在渲染 FlowDesigner 前调用）
setUiAdapter(nextAdapter)
// ② 注入数据源：用库内置内存 mock 脱后端运行（办理人 / 监听器 / 表单 / 配置等示例数据）
setDataProvider(createMockProvider())

// 注意：这里刻意不用 <StrictMode>。
// StrictMode 在开发期会「挂载 → 卸载 → 再挂载」以暴露副作用问题，而 LogicFlow 画布的
// DOM 容器初始化通常无法安全经历这一轮（容器被清空后二次 new LogicFlow 易异常）。
// 这与 React 版本身无关，是画布类库的通病；生产构建不受影响。
// TODO: 后续给 useLogicFlowCanvas 加挂载守卫（幂等 init / 卸载时 destroy 实例），再开启 StrictMode。
createRoot(document.getElementById('app')!).render(<App />)
