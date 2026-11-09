import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import dts from 'vite-plugin-dts'

/**
 * Warm-Flow 设计器 React 版「组件库 / npm 包」构建配置。
 *
 * 对齐 Vue 版 warm-flow-vue-designer/vite.lib.config.js 的隔离策略：
 *  - 入口为可复用层门面 src/designer/index.ts（FlowDesigner + 数据层 + UI 适配契约）
 *  - 产物输出到 dist-lib/
 *  - react / react-dom / logicflow 等重型库 externalize 为 peerDependencies，
 *    避免包体膨胀与 React 单例重复（多份 React 会直接报 "Invalid hook call"）
 *  - 第三方 .css（如 LogicFlow 样式）仍打进库合并产物
 *
 * @author warm
 */
// 需要 externalize 的单例敏感 / 框架级依赖（由消费方以 peerDependencies 提供）
const externalDeps = [
  'react',
  'react-dom',
  'react-dom/client',
  'react/jsx-runtime',
  '@logicflow/core',
  '@logicflow/extension'
]

const distLibRoot = path.resolve(__dirname, 'dist-lib')

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      // 生成 .d.ts 类型声明。include 放宽到整个 src，覆盖主入口与 Fusion 适配器子入口
      // 及 FlowDesigner 组件链路上的全部传递依赖（ui / components / hooks / data），
      // 避免漏产导致消费方 import 悬空。子构建（vite.next.config.js）不再各自产 dts。
      //
      // 注意：诊断不阻断构建（与 Vue 版一致）。原样移植的 tool.ts / classics| mimic 节点层
      // 在 Vue 版 tsconfig include 之外（Vue 版仅 include designer/data/api/types/ui/composables），
      // 从未被类型检查，故存在既有的宽松类型（隐式 any / 少传可选参）。这些是**继承自 Vue 版的
      // 存量问题**，本模块按「原样移植不改写」原则保留，不在此处修型以免与 Vue 版产生分叉。
      dts({
        include: ['src/**/*.ts', 'src/**/*.tsx', 'src/**/*.d.ts'],
        outDir: 'dist-lib',
        tsconfigPath: './tsconfig.json',
        staticImport: true,
        rollupTypes: false
      })
    ],
    resolve: {
      alias: {
        '~': path.resolve(__dirname, './'),
        '@': path.resolve(__dirname, './src')
      },
      extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json']
    },
    build: {
      outDir: 'dist-lib',
      emptyOutDir: true,
      cssCodeSplit: false,
      chunkSizeWarningLimit: 3000,
      lib: {
        entry: path.resolve(__dirname, 'src/designer/index.ts'),
        name: 'WarmFlowDesignerReact',
        formats: ['es'],
        fileName: () => 'warm-flow-designer-react.es.js'
      },
      rollupOptions: {
        external: (id) => {
          if (id.endsWith('.css')) return false
          return externalDeps.some((dep) => id === dep || id.startsWith(dep + '/'))
        },
        output: {
          // 合并样式产物固定命名为 warm-flow-designer-react.css（对齐 package.json 的 ./style 导出）
          assetFileNames: 'warm-flow-designer-react.[ext]'
        }
      }
    }
  }
})
