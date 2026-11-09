import { Icon } from '@iconify/react'

/**
 * SVG 图标组件（React 版，移植自 Vue 的 components/SvgIcon/index.vue）。
 *
 * 组件名与 icon-class 接口保持不变（向后兼容历史用法），内部改用 iconify 渲染。
 * 无前缀的 iconClass 默认归到 Warm-Flow 自定义集（wf:），也支持传入完整 iconify 名（如 ep:zoom-out）。
 *
 * 图标集在 `@/icons` 中离线注册（epIcons / wfIcons），运行时无网络请求。
 *
 * 与 Vue 版的唯一差异：绑定 `@iconify/react` 的 Icon（Vue 版为 `@iconify/vue`）。
 *
 * @author warm
 */
export interface SvgIconProps {
  /** 图标名：无前缀归 wf: 集（如 'save'），或完整 iconify 名（如 'ep:zoom-in'） */
  iconClass: string
  /** 追加的 class（与 svg-icon 合并） */
  className?: string
  /** 图标颜色（CSS color 值） */
  color?: string
  /** 显式宽度（CSS 值，如 '14px'） */
  width?: string | number
  /** 显式高度（CSS 值） */
  height?: string | number
  style?: React.CSSProperties
}

export default function SvgIcon(props: SvgIconProps) {
  const { iconClass, className = '', color = '', width, height, style } = props

  // 无前缀归 wf 集，带冒号视为完整 iconify 名。
  // **统一转小写**：iconify 要求图标名全小写，且 registerIcons() 已把 wfIcons 的驼峰名
  // （flowName / baseInfo / flowDesign / formDesign）归一化为小写注册；这里查找时也转小写，
  // 二者对齐，否则 `<SvgIcon iconClass="flowName" />` 会因大小写不匹配而渲染为空。
  const rawName = iconClass.includes(':') ? iconClass : `wf:${iconClass}`
  const iconName = rawName.toLowerCase()
  const svgClass = className ? `svg-icon ${className}` : 'svg-icon'

  const mergedStyle: React.CSSProperties = {
    ...(color ? { color } : null),
    ...(width != null ? { width: typeof width === 'number' ? `${width}px` : width } : null),
    ...(height != null ? { height: typeof height === 'number' ? `${height}px` : height } : null),
    ...style,
  }

  return <Icon icon={iconName} className={svgClass} style={mergedStyle} aria-hidden="true" />
}
