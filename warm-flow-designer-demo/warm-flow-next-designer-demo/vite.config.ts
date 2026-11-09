import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fusionReact19Compat } from './fusion-react19-compat.mjs'

/**
 * Warm-Flow 设计器 React 版 · Fusion Design（@alifd/next）消费示例。
 *
 * 以「第三方业务工程」的姿势消费 npm 包 @dromara/warm-flow-designer-react
 * （本地 link 到 ../../warm-flow-react-designer 的 dist-lib），
 * 仅引入 react + @alifd/next + 包本身即跑通设计器。运行前确保库已 `pnpm build:lib`。
 *
 * 与三个 Vue demo（ep:5180 / antdv4:5181 / naive:5182）并列，本 demo 用 5183。
 *
 * fusionReact19Compat()：React 19 + Fusion 1.x 的宿主侧兼容插件（补回 findDOMNode 等
 * 被 React 19 移除的 API）。chipflow 前端已内置等价插件，接入本库无需额外处理。
 *
 * @author warm
 */
export default defineConfig({
  // 顺序敏感：兼容插件 enforce:'pre'，须在 react 插件之前改写遗留包的 react-dom 引用
  plugins: [fusionReact19Compat(), react()],
  resolve: {
    // 经 link 消费本地库时，确保 react / react-dom 单实例
    // （多份 React 会直接报 "Invalid hook call"，这是 link 本地库最常见的坑）
    dedupe: ['react', 'react-dom']
  },
  optimizeDeps: {
    // 库本身已是预构建 ESM，无需再被预打包
    exclude: ['@dromara/warm-flow-designer-react']
  },
  server: {
    port: 5183,
    open: false,
    // 允许 dev server 访问仓库内 link 出去的库产物（dist-lib 在本工程目录之外）
    fs: { allow: [path.resolve(__dirname, '../../')] }
  }
})
