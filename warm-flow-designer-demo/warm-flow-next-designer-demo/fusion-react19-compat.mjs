import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

/**
 * 让 Fusion(@alifd/next) 在 React 19 下正常工作 —— demo 侧兼容插件。
 *
 * 背景：React 19 从 `react-dom` 移除了 findDOMNode / render / unmountComponentAtNode，
 * 而 Fusion 1.x 与它依赖的 @alifd/overlay、react-transition-group@2 仍在使用这三个 API，
 * 在 React 19 下会抛 `findDOMNode is not a function`。
 *
 * 做法（与 chipflow 前端 build/fusion-react19-compat.mjs 同源，适配 vite 5 的 esbuild 预构建）：
 *   1. 生成 shim 模块：re-export 真实 react-dom 全部具名导出，并补回三个被移除的 API
 *      （findDOMNode 复用 react-legacy-compat 的 fiber 遍历实现；
 *        render / unmountComponentAtNode 用 createRoot + flushSync 桥接）
 *   2. 把「调用 react-dom 的遗留包」内部对 'react-dom' 的引用改写到 shim
 *
 * ⚠️ 绝不能改成全局 resolve.alias 指向 shim：react-dom/client.js 内部会 require("react-dom")，
 * 全局改写会形成 shim <-> client 初始化死锁（createRoot 拿到 undefined）。只按白名单逐包改写。
 *
 * 注意：这是**宿主侧**职责（消费方自己引 Fusion + React 19 才需要），不进库产物。
 * chipflow 前端已内置等价插件，接入本库时无需额外处理。
 *
 * @author warm
 */

// 需要把 'react-dom' 引用改写为 shim 的遗留包（Fusion 基础三件套）
const LEGACY_PACKAGES = [
  '/node_modules/@alifd/next/',
  '/node_modules/@alifd/overlay/',
  '/node_modules/react-transition-group/',
]

// React 19 移除、需要 shim 补回的 API
const REMOVED_APIS = ['findDOMNode', 'render', 'unmountComponentAtNode']

function isLegacyPackage(id) {
  const norm = id.split(path.sep).join('/')
  return LEGACY_PACKAGES.some((p) => norm.includes(p))
}

function rewriteReactDom(code, shimPath) {
  if (!/['"]react-dom['"]/.test(code)) return null
  const spec = shimPath.split(path.sep).join('/')
  const out = code
    .replace(/(from\s*)['"]react-dom['"]/g, `$1'${spec}'`)
    .replace(/(require\(\s*)['"]react-dom['"](\s*\))/g, `$1'${spec}'$2`)
  return out === code ? null : out
}

export function fusionReact19Compat() {
  let shimPath = ''

  return {
    name: 'fusion-react19-compat',
    enforce: 'pre',

    config(config) {
      const root = config.root
        ? path.resolve(config.root)
        : path.dirname(fileURLToPath(import.meta.url))
      const require = createRequire(path.join(root, 'package.json'))

      const realReactDom = require.resolve('react-dom')
      const realClient = require.resolve('react-dom/client')
      const rlcEntry = require.resolve('react-legacy-compat')
      const findDomNodePath = path.join(
        path.dirname(rlcEntry), 'src', 'find-dom-node.js'
      )

      const shimDir = path.join(root, 'node_modules', '.fusion-react19-compat')
      shimPath = path.join(shimDir, 'react-dom-shim.mjs')
      fs.mkdirSync(shimDir, { recursive: true })

      // 枚举真实 react-dom 的具名导出（逐个 re-export，避免 export * 看不穿 CJS）
      const real = require(realReactDom)
      const names = Object.keys(real).filter(
        (k) =>
          !['default', ...REMOVED_APIS].includes(k) &&
          /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k)
      )
      const url = (p) => JSON.stringify(p.split(path.sep).join('/'))

      fs.writeFileSync(
        shimPath,
        [
          `import * as __real from ${url(realReactDom)};`,
          `import * as __client from ${url(realClient)};`,
          `import { findDOMNode as __findDOMNode } from ${url(findDomNodePath)};`,
          `const __base = __real.default || __real;`,
          ...names.map((n) => `export const ${n} = __base[${JSON.stringify(n)}];`),
          `const __roots = new WeakMap();`,
          // 桥接旧版 ReactDOM.render(element, container, callback)：同步渲染 + 回调
          `export function render(element, container, callback) {`,
          `  let root = __roots.get(container);`,
          `  if (!root) { root = __client.createRoot(container); __roots.set(container, root); }`,
          `  __base.flushSync(() => { root.render(element); });`,
          `  if (typeof callback === 'function') callback();`,
          `  return null;`,
          `}`,
          `export function unmountComponentAtNode(container) {`,
          `  const root = __roots.get(container);`,
          `  if (!root) return false;`,
          `  __base.flushSync(() => { root.unmount(); });`,
          `  __roots.delete(container);`,
          `  return true;`,
          `}`,
          `export const findDOMNode = __findDOMNode;`,
          `export default Object.assign({}, __base, { findDOMNode, render, unmountComponentAtNode });`,
          ``,
        ].join('\n')
      )

      // vite 5 用 esbuild 预构建裸依赖，故把改写逻辑作为 esbuild 插件注入 optimizeDeps
      // （chipflow 是 vite 8 / rolldown，用 rolldownOptions.plugins；两者等价，管线不同）
      const spec = shimPath.split(path.sep).join('/')
      return {
        optimizeDeps: {
          esbuildOptions: {
            plugins: [
              {
                name: 'fusion-react19-compat:optimize',
                setup(build) {
                  // 拦截遗留包内部对 'react-dom' 的裸名解析，直接指向 shim
                  build.onResolve({ filter: /^react-dom$/ }, (args) => {
                    if (!isLegacyPackage(args.importer || '')) return null
                    return { path: spec }
                  })
                },
              },
            ],
          },
        },
      }
    },

    // build 阶段：所有模块都过普通管线，用 transform 钩子改写
    transform(code, id) {
      if (!isLegacyPackage(id)) return null
      const out = rewriteReactDom(code, shimPath)
      return out == null ? null : { code: out, map: null }
    },
  }
}
