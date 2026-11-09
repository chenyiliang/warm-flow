import { addCollection } from '@iconify/react'
import { epIcons } from './epIcons'
import { wfIcons } from './wfIcons'
import type { IconifyJSON } from '@iconify/types'

/**
 * 注册离线图标集（iconify），使设计器图标框架无关、不依赖具体 UI 库的图标包与 svg sprite：
 *  - ep:*  Element Plus 官方图标子集（离线内联，仅设计器实际用到的 9 个，见 epIcons.ts）
 *  - wf:*  Warm-Flow 自定义图标（由原 svg 资产迁移），用于流程名 / 保存 / 节点类型等
 *
 * 与 Vue 版的唯一差异：绑定 `@iconify/react` 的 addCollection（Vue 版为 `@iconify/vue`）。
 * 图标数据（epIcons / wfIcons）为纯 JSON，与 Vue 版**逐字相同**、原样移植。
 *
 * 图标数据在构建期内联进产物，运行时无网络请求；只内联用到的图标，避免整集打包膨胀。
 *
 * **为什么导出 registerIcons() 而不是只在模块顶层裸调 addCollection**：
 * 本包 `package.json` 的 `sideEffects` 只声明了 CSS 文件，Rollup 据此认为「除 css 外均无副作用」，
 * 于是会把纯副作用模块（只调用、无导出）的语句整体 tree-shake 掉——结果是图标数据进了 bundle
 * 却**从未注册**，全部 `<SvgIcon>` 渲染为空（实测：`#app` 内 0 个 `<svg>`）。
 * 改成显式导出函数 + 由入口调用后，这是一次「有真实使用绑定」的调用，不受 sideEffects 配置影响。
 *
 * @author warm
 */

/**
 * iconify **要求图标名为全小写**：含大写字母的名称会被判为非法，而 `addCollection` 对集合做
 * **全量校验**——只要有一个图标名非法，**整个集合都会被拒绝注册**（实测返回 true 但 getIcon 全 null，
 * 随后回退去请求 api.iconify.design，wf 前缀公网没有 -> 图标渲染为空 span）。
 *
 * `wfIcons.ts` 沿用 Vue 版数据，含 flowName / baseInfo / flowDesign / formDesign 四个驼峰名。
 * 为保持该数据文件与 Vue 版**逐字一致**（便于后续从上游同步），不改数据源，而在注册这一层
 * 统一把图标名转小写；SvgIcon 侧对请求名同样转小写，二者对齐。
 */
function normalizeIconNames(collection: IconifyJSON): IconifyJSON {
  const icons: Record<string, any> = {}
  const src: Record<string, any> = (collection as any).icons ?? {}
  Object.keys(src).forEach((name) => {
    icons[name.toLowerCase()] = src[name]
  })
  // aliases（若有）同样需要小写键；当前 wf/ep 数据无 aliases，保留处理以防上游补充
  const aliases: Record<string, any> = {}
  const srcAliases: Record<string, any> = (collection as any).aliases ?? {}
  Object.keys(srcAliases).forEach((name) => {
    aliases[name.toLowerCase()] = srcAliases[name]
  })
  return {
    ...collection,
    prefix: collection.prefix.toLowerCase(),
    icons,
    ...(Object.keys(aliases).length ? { aliases } : null),
  } as IconifyJSON
}

let registered = false

/**
 * 注册 ep / wf 两套离线图标集到 iconify。
 *
 * 幂等：重复调用只注册一次（HMR / 多次 import 场景安全）。
 * 由库入口 `src/designer/index.ts` 在模块加载时调用；消费方无需关心。
 */
export function registerIcons(): void {
  if (registered) return
  registered = true
  addCollection(normalizeIconNames(epIcons))
  addCollection(normalizeIconNames(wfIcons))
}

export { epIcons, wfIcons }
