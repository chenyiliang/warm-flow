/**
 * 把从 Vue 版原样拷来的 10 个 .scss 转换成 React 版可用的样式。
 *
 * 三件事：
 *  1. 剥离 Vue scoped 专属语法：:deep(...) / ::v-deep(...) -> 普通后代选择器；:global(...) -> 内容原样（逃生舱）。
 *  2. Element Plus 类名 -> Fusion(@alifd/next) 类名（已逐个对照真实 next.css 核验）。
 *  3. 给每个文件的规则套上命名空间根类，避免「Vue 的 scoped 在 React 里变成全局」污染宿主应用。
 *
 * 映射按「选择器长度降序」替换，保证 .el-input__wrapper 先于 .el-input 命中（避免前缀误伤）。
 *
 * 用法（在仓库根或任意 cwd 均可，路径相对本脚本解析）：
 *   node warm-flow-react-designer/scripts/port-scss-from-vue.mjs
 * 幂等：每次从 Vue 版源文件重新生成，可重复运行。改样式时先改 Vue 版源，再跑本脚本。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// 仓库根 = 本脚本（<root>/warm-flow-react-designer/scripts/）向上两级
const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../..')
const SRC = path.join(ROOT, 'warm-flow-vue-designer/src/components/design/common/vue')
const DST = path.join(ROOT, 'warm-flow-react-designer/src/components/design/common/react')

// EP -> Fusion。已用 next.css 核验；标注 MISSING 的用结构等价物替代。
const MAP = {
  // 表单
  '.el-form-item__label': '.next-form-item-label',
  '.el-form-item__content': '.next-form-item-control',
  '.el-form-item__error': '.next-form-item-help',
  '.el-form-item.is-error': '.next-form-item.next-error',
  '.el-form-item': '.next-form-item',
  '.el-form': '.next-form',
  // 输入框：Fusion 无 __wrapper 层，.next-input 本身即描边盒
  '.el-input-number__increase': '.next-number-picker-handler',
  '.el-input-number__decrease': '.next-number-picker-handler',
  '.el-input-number': '.next-number-picker',
  '.el-input__wrapper': '.next-input',
  '.el-input__inner': '.next-input input',
  '.el-input__prefix': '.next-input-label',
  '.el-input.is-focus': '.next-input.next-focus',
  '.el-input.is-disabled': '.next-input.next-disabled',
  '.el-input': '.next-input',
  '.el-textarea__inner': '.next-input-textarea textarea',
  '.el-textarea': '.next-input-textarea',
  // 选择器
  '.el-select__tags': '.next-select-tag',
  '.el-select': '.next-select',
  // 表格
  '.el-table__header-wrapper': '.next-table-header',
  '.el-table__body-wrapper': '.next-table-body',
  '.el-table__empty-block': '.next-table-empty',
  '.el-table__cell': '.next-table-cell',
  '.el-table__row': '.next-table-row',
  '.el-table-column--selection': '.next-table-selection',
  '.el-table--border': '.next-table.next-table-bordered',
  '.el-table--group': '.next-table',
  '.el-table': '.next-table',
  // 弹窗 / 抽屉（Fusion 无独立 title 类，折进 header）
  '.el-dialog__headerbtn': '.next-dialog-close',
  '.el-dialog__header': '.next-dialog-header',
  '.el-dialog__title': '.next-dialog-header',
  '.el-dialog__body': '.next-dialog-body',
  '.el-dialog': '.next-dialog',
  '.el-drawer__close-btn': '.next-drawer-close',
  '.el-drawer__container': '.next-drawer',
  '.el-drawer__wrapper': '.next-drawer',
  '.el-drawer__header': '.next-drawer-header',
  '.el-drawer__body': '.next-drawer-body',
  '.el-drawer': '.next-drawer',
  '.el-overlay': '.next-overlay-wrapper',
  // 标签
  '.el-tag__close': '.next-tag-close-btn',
  '.el-tag__content': '.next-tag-body',
  '.el-tag': '.next-tag',
  // 分页
  '.el-pagination__rightwrapper': '.next-pagination-display',
  '.el-pagination--small': '.next-pagination.next-small',
  '.el-pager': '.next-pagination-list',
  '.el-pagination': '.next-pagination',
  // 单选 / 多选
  '.el-radio-group': '.next-radio-group',
  '.el-radio__label': '.next-radio-label',
  '.el-radio__input': '.next-radio-wrapper',
  '.el-radio__inner': '.next-radio-inner',
  '.el-radio': '.next-radio',
  '.el-checkbox-group': '.next-checkbox-group',
  '.el-checkbox__label': '.next-checkbox-label',
  '.el-checkbox__inner': '.next-checkbox-inner',
  '.el-checkbox': '.next-checkbox',
  // 树
  '.el-tree-node__expand-icon': '.next-tree-switcher',
  '.el-tree-node__content': '.next-tree-node-label',
  '.el-tree-node': '.next-tree-node',
  '.el-tree': '.next-tree',
  // 日期 / 时间
  '.el-range-editor': '.next-range-picker',
  '.el-date-editor': '.next-date-picker',
  '.el-time-picker': '.next-time-picker',
  // 按钮 / 图标 / 栅格
  '.el-button--danger': '.next-btn-warning',
  '.el-button--primary': '.next-btn-primary',
  '.el-button--small': '.next-btn.next-small',
  '.el-button': '.next-btn',
  '.el-icon': '.next-icon',
  '.el-col': '.next-col',
  '.el-row': '.next-row',
  // 状态修饰（Fusion 用 next- 前缀而非 is- 前缀）
  '.is-disabled': '.next-disabled',
  '.is-focus': '.next-focus',
  // Ant Design Vue 类名（Vue 版同时适配 antd，故样式里有一批 .ant-* 并行规则）-> Fusion
  // 注意：antd 用 `-checked` 后缀，Fusion 用 `.checked` 修饰类，故映射到组合选择器
  '.ant-radio-wrapper-checked': '.next-radio-wrapper.checked',
  '.ant-checkbox-wrapper-checked': '.next-checkbox-wrapper.checked',
  '.ant-radio-wrapper': '.next-radio-wrapper',
  '.ant-checkbox-wrapper': '.next-checkbox-wrapper',
  '.ant-radio-group': '.next-radio-group',
  '.ant-checkbox-group': '.next-checkbox-group',
  '.ant-form-item': '.next-form-item',
}

// 长选择器优先，避免 .el-input 抢先命中 .el-input__wrapper
const ORDERED = Object.keys(MAP).sort((a, b) => b.length - a.length)

/** 剥离 Vue scoped 语法 */
function stripVueSyntax(css) {
  let out = css
  // ::global(完整选择器) / :global(完整选择器) -> 选择器原样（不套命名空间，因为它本就是逃生舱）
  // 源文件里两种写法都存在；漏掉 ::global( 会留下一个裸 ':' 变成 ':.next-xxx' / ':html.dark ...'，
  // 导致 Sass "Expected identifier" 语法错误。
  out = out.replace(/::global\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g, '$1')
  out = out.replace(/:global\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g, '$1')
  // ::v-deep(...) / ::deep(...) / :deep(...) -> 内容原样（React 无 scoped，后代选择器即可）
  // 注意源文件里三种写法都存在：:deep( 、::v-deep( 、::deep(（后者是 Vue 也容忍的非标写法，
  // 若漏掉会留下一个裸 ':' 变成 ':.next-xxx' 导致 Sass "Expected identifier" 语法错误）
  out = out.replace(/::v-deep\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g, '$1')
  out = out.replace(/::deep\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g, '$1')
  out = out.replace(/:deep\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g, '$1')
  // 裸 ::v-deep / ::deep / >>> 组合器
  out = out.replace(/::v-deep\s+/g, '')
  out = out.replace(/::deep\s+/g, '')
  out = out.replace(/>>>\s+/g, '')
  return out
}

/**
 * 删除 Ant Design Vue 的并行样式块（`.ant-*` 选择器）。
 *
 * Vue 版同时适配 Element Plus 与 Ant Design Vue，因此同一份样式里有 `.el-*` 与 `.ant-*`
 * 两套并行规则，表达**相同的设计意图**、只是目标 DOM 类名不同（源码注释也这么写：
 * 「antd 下 wf-table→.ant-table、wf-form-item→.ant-form-item，上面的 .el-* 选择器不命中」）。
 *
 * React 版的目标 UI 库是 Fusion（`@alifd/next`），既不是 EP 也不是 antd：
 *  - `.el-*` 已被翻译成 `.next-*`（见 MAP），Fusion 的样式由这套规则覆盖；
 *  - `.ant-*` 在 Fusion DOM 里**永远匹配不到**（Fusion 不产出 .ant- 前缀类），
 *    若也翻译成 `.next-*` 则与上面那套规则**重复**，且部分规则（如 `.ant-form-item-control-input`）
 *    在 Fusion 无对应层级，翻译后语义会失真。
 * 故直接删除，由 `.next-*` 一套规则单独承载 Fusion 样式。
 *
 * 删除范围：整条规则块（选择器含 `.ant-` 时连同其 `{ ... }` 一起删），
 * 以及选择器列表中「仅」由 `.ant-*` 片段组成的逗号项。
 */
function stripAntdBlocks(css) {
  const lines = css.split('\n')
  const out = []
  let skipDepth = 0 // >0 表示正处于被删除的 .ant- 规则块内部
  let inAntdComment = false // 正处于被删除的多行注释内部
  for (const line of lines) {
    if (skipDepth > 0) {
      skipDepth += (line.match(/\{/g) || []).length
      skipDepth -= (line.match(/\}/g) || []).length
      continue // 整行丢弃
    }
    const opensComment = /\/\*/.test(line)
    const closesComment = /\*\//.test(line)

    // 多行注释：进入 antd 相关注释块后，一直删到闭合 */（否则只删首行会留下悬空正文与孤立的 */，破坏语法）
    if (inAntdComment) {
      if (closesComment) inAntdComment = false
      continue
    }
    const isCommentLine = /^\s*(\/\*|\*|\/\/)/.test(line)
    if (isCommentLine && /(antd 适配|\.ant-|a-form-item|对齐 EP 行为|对齐 el-table)/.test(line)) {
      // 单行注释（同行闭合）直接删；跨行注释进入 inAntdComment 模式删到闭合
      if (opensComment && !closesComment) inAntdComment = true
      continue
    }

    // 该行的选择器部分是否引用了 .ant-
    const selectorPart = line.split('{')[0]
    const opens = (line.match(/\{/g) || []).length
    const closes = (line.match(/\}/g) || []).length
    const isSelectorLine = opens > 0 || line.trim().endsWith(',')

    if (isSelectorLine && /\.ant-/.test(selectorPart)) {
      // 纯 antd 选择器行：若同行开块则跳过整个块，否则（逗号续行）跳过本行
      if (opens > closes) {
        skipDepth = opens - closes
      }
      continue
    }
    // 逗号选择器列表中间的纯 antd 片段（无大括号、无注释）
    if (!opens && !closes && /^\s*&?\.ant-/.test(line)) continue

    out.push(line)
  }
  return out.join('\n')
}

function translateSelectors(css) {
  let out = css
  for (const ep of ORDERED) {
    // 只替换「作为完整类名」出现的位置：后面不能紧跟 [-_a-zA-Z0-9]
    const re = new RegExp(ep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![-_a-zA-Z0-9])', 'g')
    out = out.replace(re, MAP[ep])
  }
  return out
}

/**
 * 给整个文件内容套命名空间根类。
 * 做法：把全部内容包进 `.<root> { ... }`，SCSS 嵌套自动给所有规则加前缀。
 * @media / html.dark & 等嵌套写法在 SCSS 里天然可用，无需特殊处理。
 *
 * 关键：文件里若有「顶层选择器恰好就是 .<root> 本身」（如 between.scoped.scss 开头的
 * `.between { width:100% }`），直接包裹会得到 `.between .between`——匹配不到根元素，
 * width 与暗黑底会静默丢失。故先把**顶层**（大括号深度 0）的 `.<root>` 选择器改写成 `&`，
 * 再包裹：`.between { & { width:100% } }` 正确编译为 `.between { width:100% }`。
 *
 * 只改顶层、且要求 `.<root>` 是该选择器的**首个复合类**（避免误伤 `.parent .between` 这类后代选择器，
 * 也避免 `.betweenForm` 因前缀相同被命中——靠 `(?![\w-])` 边界保护）。
 */
function namespace(css, root) {
  if (!root) return css

  const rootEsc = ('.' + root).replace('.', '\\.')

  // ---- 第一步：修「祖先上下文选择器」----
  // 顶层 `html.dark .foo {` 被包进 .root{} 后会编译成 `.root html.dark .foo`，
  // 这要求 html.dark 是 .root 的后代（实际是祖先）-> 规则永不生效，暗黑样式静默失效。
  // 改写成 `html.dark & .foo`（& 展开为 .root）-> `html.dark .root .foo`，祖先关系正确。
  const lines = css.split('\n').map((line) => {
    const m = line.match(/^(\s*)html\.dark\s+(.*?)(\s*[,{])\s*$/)
    if (!m) return line
    const [, indent, selectorBody, tail] = m
    // 若 html.dark 之后紧跟的就是 .root 本身，去掉它（& 已代表 .root，否则重复一层）
    const stripped = selectorBody.replace(new RegExp('^\\s*' + rootEsc + '(?![\\w-])\\s*'), '')
    const rest = stripped.trim()
    return rest ? `${indent}html.dark & ${rest}${tail}` : `${indent}html.dark &${tail}`
  })

  // ---- 第二步：把顶层的「.root 自身」选择器改写成 & ----
  // 否则 `.root { width:100% }` 包裹后变成 `.root .root { ... }`，匹配不到根元素，规则丢失。
  let depth = 0
  const out = lines.map((line) => {
    const isTopLevel = depth === 0
    const opens = (line.match(/\{/g) || []).length
    const closes = (line.match(/\}/g) || []).length

    let nl = line
    if (isTopLevel && new RegExp('^(\\s*)' + rootEsc + '(?![\\w-])').test(nl)) {
      // 保留缩进与后缀（.root:hover / .root.foo），只把类名 token 换成 &
      nl = nl.replace(new RegExp('^(\\s*)' + rootEsc + '(?![\\w-])'), '$1&')
    }
    depth += opens - closes
    return nl
  })

  const body = out.join('\n')

  // ---- 第三步：把 @import 提到命名空间块之外 ----
  // Sass 要求 @import 位于文档顶层；留在 `.root { ... }` 内部会编译失败。
  // （@include 可以留在块内——mixin 就地展开，无此限制。）
  const importLines = []
  const withoutImports = body
    .split('\n')
    .filter((line) => {
      if (/^\s*@import\s/.test(line)) {
        importLines.push(line.trim())
        return false
      }
      return true
    })
    .join('\n')

  const importBlock = importLines.length ? importLines.join('\n') + '\n\n' : ''

  return `${importBlock}/* 命名空间：本文件全部规则收敛在 .${root} 下，避免污染宿主应用全局样式
   （Vue 版是 <style scoped>，React 无 scoped，裸 import 会让 .mt5 / .placeholder 这类通用名泄漏到宿主）。
   三处改写保证包裹后语义不变：
   1) @import 提到块外（Sass 要求 @import 位于文档顶层）；
   2) 顶层 .${root} 自身规则 -> &（否则变成 .${root} .${root}，匹配不到根元素）；
   3) html.dark 祖先选择器 -> html.dark &（否则变成 .${root} html.dark，祖先关系倒置而失效）。 */
.${root} {
${withoutImports}
}
`
}

// 各文件的命名空间根类（取自对应 React 组件实际渲染的根 className）
//
// 注意三个 UserPicker 子组件：Tree 根类是 .section-card.tree-card，Search 渲染的是 Fragment
// （无单一根元素），SelectedBar 根类是 .selected-inline-bar。三者**始终渲染在 SelectUser 的
// .user-select-wrapper 内部**，故统一锚到 .user-select-wrapper，避免依赖各自不稳定的根类。
const NAMESPACE = {
  'baseInfo.scoped.scss': 'wf-base-info',
  'between.scoped.scss': 'between',
  'nodeExtList.scoped.scss': 'nodeExtForm',
  'selectUser.scoped.scss': 'user-select-wrapper',
  'userPickerTree.scoped.scss': 'user-select-wrapper',
  'userPickerSearch.scoped.scss': 'user-select-wrapper',
  'userPickerSelectedBar.scoped.scss': 'user-select-wrapper',
  // global 文件本身就锚定 portal 根类（.property-drawer-modern / .person-select-dialog），不再二次包裹
  'propertySetting.global.scss': null,
  'selectUser.global.scss': null,
  // scoped 里只有 1 条抽屉规则，归到抽屉根类下
  'propertySetting.scoped.scss': 'property-drawer-modern',
}

const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.scss'))
let report = []

for (const f of files) {
  const raw = fs.readFileSync(path.join(SRC, f), 'utf8')
  let out = stripVueSyntax(raw)
  // 顺序关键：必须**先**删 antd 块、**再**翻译 .el-*。
  // 若先翻译，`.ant-radio-wrapper` 会变成 `.next-radio-wrapper`，丢掉 `.ant-` 标记，
  // stripAntdBlocks 就再也认不出它 -> antd 规则残留并与 EP 翻译结果重复（同一属性写两遍）。
  out = stripAntdBlocks(out)
  out = translateSelectors(out)

  // baseInfo: 删除死代码「.Tabs 旧样式兼容覆盖」块。
  // baseInfo.vue 与 React 版 BaseInfo.tsx 都不渲染任何 tab 组件（tab 只在 start/between，且是自绘
  // .modern-tabs 而非 UI 库 tabs）；该块内还引用无 fallback 的 --el-border-color（Fusion 下不解析）。
  if (f === 'baseInfo.scoped.scss') {
    out = out.replace(
      /\/\* =+ 旧样式兼容覆盖 =+ \*\/\s*\n\.Tabs \{[\s\S]*?\n\}\s*\n/,
      '/* 已移除 Vue 版死代码「.Tabs 旧样式兼容覆盖」块：baseInfo 不渲染 tab 组件，'
        + '且其内引用了无 fallback 的 --el-border-color（Fusion 下不解析）。 */\n'
    )
  }

  out = namespace(out, NAMESPACE[f] ?? null)
  fs.writeFileSync(path.join(DST, f), out)
  report.push({
    file: f,
    ns: NAMESPACE[f] ?? '(global-anchored)',
    elBefore: (raw.match(/\.el-[a-z_-]+/g) || []).length,
    elAfter: (out.match(/\.el-[a-z_-]+/g) || []).length,
    deepAfter: (out.match(/:deep\(|::v-deep\(|:global\(/g) || []).length,
    lines: out.split('\n').length,
  })
}

console.log('file'.padEnd(34), 'ns'.padEnd(26), 'el:before'.padStart(9), 'el:after'.padStart(8), 'vueSyntax'.padStart(9))
for (const r of report) {
  console.log(r.file.padEnd(34), String(r.ns).padEnd(26), String(r.elBefore).padStart(9), String(r.elAfter).padStart(8), String(r.deepAfter).padStart(9))
}
const totEl = report.reduce((a, r) => a + r.elAfter, 0)
const totVue = report.reduce((a, r) => a + r.deepAfter, 0)
console.log('---')
console.log(`component scss: remaining .el-* = ${totEl}, remaining vue syntax = ${totVue}`)

/**
 * 第二遍：共享 mixin 文件（_common.scss）。
 *
 * 这些是被各面板 @include 展开的 mixin（modern-tabs / base-settings-card / section-card /
 * table-form-align / responsive-adaption），展开后已经落在各面板的命名空间里，故**不能再套命名空间**，
 * 只需：剥离 ::v-deep() + 翻译 .el-* -> .next-*。
 */
// 源取 Vue 版的 _common.scss（而非本模块已转换的文件），保证重复运行幂等、不会二次转换
const COMMON_SRC = path.join(ROOT, 'warm-flow-vue-designer/src/assets/styles/_common.scss')
const COMMON = path.join(ROOT, 'warm-flow-react-designer/src/assets/styles/_common.scss')
{
  const raw = fs.readFileSync(COMMON_SRC, 'utf8')
  let out = stripVueSyntax(raw)
  // 顺序关键：必须**先**删 antd 块、**再**翻译 .el-*。
  // 若先翻译，`.ant-radio-wrapper` 会变成 `.next-radio-wrapper`，丢掉 `.ant-` 标记，
  // stripAntdBlocks 就再也认不出它 -> antd 规则残留并与 EP 翻译结果重复（同一属性写两遍）。
  out = stripAntdBlocks(out)
  out = translateSelectors(out)
  fs.writeFileSync(COMMON, out)
  console.log('---')
  console.log(`_common.scss mixins: .el- ${(raw.match(/\.el-[a-z_-]+/g) || []).length} -> ${(out.match(/\.el-[a-z_-]+/g) || []).length}, .ant- -> ${(out.match(/\.ant-[a-z_-]+/g) || []).length}, vueSyntax -> ${(out.match(/:deep\(|::v-deep\(|::deep\(|:global\(|::global\(/g) || []).length}`)
}

/**
 * 第三遍：start / end / gateway / skip 四个面板的样式在 Vue 版是**内联 <style scoped>**，
 * 没有独立 .scss 文件（故第一遍没覆盖到）。这里从 .vue 抽出 <style> 内容，
 * 走同一套转换（剥离 vue 语法 + 翻译 el->next + 命名空间），写成 <name>.scoped.scss。
 *
 * 命名空间根类取自对应 React 组件实际渲染的根 className：
 *   start -> .start / end -> .end-wrapper / gateway -> .gateway-wrapper / skip -> .skip-wrapper
 */
const VUE_ROOT = SRC
const INLINE = {
  'start.vue': { out: 'start.scoped.scss', root: 'start' },
  'end.vue': { out: 'end.scoped.scss', root: 'end-wrapper' },
  'gateway.vue': { out: 'gateway.scoped.scss', root: 'gateway-wrapper' },
  'skip.vue': { out: 'skip.scoped.scss', root: 'skip-wrapper' },
}
const inlineReport = []
for (const [vueFile, cfg] of Object.entries(INLINE)) {
  const vueSrc = fs.readFileSync(path.join(VUE_ROOT, vueFile), 'utf8')
  // 抽取 <style ...> ... </style> 内部内容（可能多段，合并）
  const blocks = [...vueSrc.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1])
  const raw = blocks.join('\n')
  let out = stripVueSyntax(raw)
  // 顺序关键：必须**先**删 antd 块、**再**翻译 .el-*。
  // 若先翻译，`.ant-radio-wrapper` 会变成 `.next-radio-wrapper`，丢掉 `.ant-` 标记，
  // stripAntdBlocks 就再也认不出它 -> antd 规则残留并与 EP 翻译结果重复（同一属性写两遍）。
  out = stripAntdBlocks(out)
  out = translateSelectors(out)
  out = namespace(out, cfg.root)
  fs.writeFileSync(path.join(DST, cfg.out), out)
  inlineReport.push({
    out: cfg.out, root: cfg.root,
    elBefore: (raw.match(/\.el-[a-z_-]+/g) || []).length,
    elAfter: (out.match(/\.el-[a-z_-]+/g) || []).length,
    vueSyntax: (out.match(/:deep\(|::v-deep\(|:global\(/g) || []).length,
  })
}
console.log('--- inline <style> panels ---')
for (const r of inlineReport) {
  console.log(`  ${r.out.padEnd(26)} root=.${r.root.padEnd(16)} el ${r.elBefore}->${r.elAfter}  vueSyntax ${r.vueSyntax}`)
}
