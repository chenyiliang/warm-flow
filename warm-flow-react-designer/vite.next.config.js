import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

/**
 * Fusion Design（@alifd/next）适配器子入口构建：产物 dist-lib/next.es.js，
 * 对应包导出 @dromara/warm-flow-designer-react/next。
 *
 * 与主库构建（vite.lib.config.js）分离：next 适配器是「可选」的，仅 Fusion 消费方按需引入，
 * 故 react / react-dom / @alifd/next 全部 externalize 为 peerDependencies，主入口不打包 next。
 * emptyOutDir:false 以免擦除主库已产出的 dist-lib 内容（须在 build:lib 之后运行）。
 *
 * @author warm
 */
const externalDeps = ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', '@alifd/next']

export default defineConfig(() => {
  return {
    // 仅构建 JS 产物（next.es.js）。dts 由主库构建（vite.lib.config.js）统一产出，
    // 此处不再重复生成，避免 entryRoot 行为异常导致的产物目录嵌套错乱。
    plugins: [react()],
    resolve: {
      alias: {
        '~': path.resolve(__dirname, './'),
        '@': path.resolve(__dirname, './src')
      },
      extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json']
    },
    build: {
      outDir: 'dist-lib',
      emptyOutDir: false,
      cssCodeSplit: false,
      chunkSizeWarningLimit: 3000,
      lib: {
        entry: path.resolve(__dirname, 'src/ui/nextAdapter.tsx'),
        name: 'WarmFlowDesignerReactNext',
        formats: ['es'],
        fileName: () => 'next.es.js'
      },
      rollupOptions: {
        external: (id) => {
          if (id.endsWith('.css')) return false
          return externalDeps.some((dep) => id === dep || id.startsWith(dep + '/'))
        }
      }
    }
  }
})
