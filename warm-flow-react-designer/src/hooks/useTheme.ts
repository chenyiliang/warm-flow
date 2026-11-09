import { useCallback, useEffect, useState } from 'react'
import {
  getThemeColors,
  setCustomThemeColors,
  resetThemeColors,
  getUserOverride,
  applyCssVariables,
  replaceDarkBaseColor,
  lightColors,
  darkColors,
} from '@/config/themeConfig'

/**
 * 全局暗黑模式 Hook（React 版，对应 Vue 的 composables/useDark）。
 *
 * 功能：
 * - 统一管理 isDark 状态、URL 参数初始化、postMessage 监听
 * - 从 themeConfig 读取所有颜色（SSOT），消除硬编码
 * - 提供 applyDarkTheme() 将颜色应用到 LogicFlow 画布
 *
 * 与 Vue 版的实现差异：
 * - **isDark 用 React state**（`useState`）而非 Vue 模块级 `ref` 单例。React 无跨组件的响应式
 *   单例，故本 Hook 每次调用返回自己的 state；跨组件同步由外层 `FlowDesigner` 持有单份并下传。
 * - **不再依赖 pinia store 读 appParams**：Vue 版经 `useAppStore().appParams` 取 URL 参数，
 *   React 版直接从 `window.location.search` 解析（Vue 版 store 的 fetchTokenName 本质也是读它）。
 * - 颜色常量（themeColors）为**纯计算值**，随 isDark 变化重算，无需响应式包装。
 *
 * @author warm
 */

/** 解析 URL 查询参数为对象（替代 Vue 版 store 的 appParams） */
function readUrlParams(): Record<string, string> {
  const params: Record<string, string> = {}
  try {
    const urlParams = new URLSearchParams(window.location.search)
    for (const [key, value] of urlParams.entries()) {
      if (value && 'undefined' !== value) params[key] = value
    }
  } catch {
    // SSR / 无 window 环境容错
  }
  return params
}

/** 解析 darkColors 参数（如 darkColors=111827，不带 # 号），替换 8 个暗黑底色字段 */
function applyColorParams(params: Record<string, any> | undefined, mode: 'dark' | 'light') {
  const colorParam = params?.darkColors
  if (!colorParam || mode !== 'dark') return
  if (typeof colorParam === 'string' && /^[0-9a-fA-F]{3,8}$/.test(colorParam)) {
    const hex = '#' + colorParam
    setCustomThemeColors({ dark: replaceDarkBaseColor(hex) })
    applyCssVariables(mode)
  }
}

export interface UseThemeReturn {
  /** 当前是否暗黑模式 */
  isDark: boolean
  /** 当前模式的完整颜色对象（含用户覆盖） */
  themeColors: Record<string, string>
  /** 默认亮色配色常量 */
  light: typeof lightColors
  /** 默认暗黑配色常量 */
  dark: typeof darkColors
  /** 切换暗黑模式 */
  setDark: (v: boolean) => void
  /** 从 URL 参数初始化主题（支持 darkColors 底色替换） */
  initFromUrl: () => void
  /** 应用/取消暗黑主题到 LogicFlow 画布（背景 + 网格 + 边文字） */
  applyDarkTheme: (lfInstance: any, isDarkMode: boolean) => void
  /** 注册 message 事件监听 + 主动查询父页面主题状态 */
  setupMessageListener: () => void
  /** 清理 message 事件监听 */
  cleanupMessageListener: () => void
  setCustomThemeColors: typeof setCustomThemeColors
  resetThemeColors: typeof resetThemeColors
  getUserOverride: typeof getUserOverride
  getThemeColors: typeof getThemeColors
}

export function useTheme(): UseThemeReturn {
  const [isDark, setIsDarkState] = useState<boolean>(false)

  const themeColors = getThemeColors(isDark ? 'dark' : 'light')

  const setDark = useCallback((v: boolean) => {
    setIsDarkState(v)
    if (v) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [])

  /** 从 URL 参数初始化主题 */
  const initFromUrl = useCallback(() => {
    const params = readUrlParams()
    const urlTheme = params?.theme
    const dark = urlTheme === 'theme-dark'
    const mode: 'dark' | 'light' = dark ? 'dark' : 'light'

    setDark(dark)

    applyColorParams(params, mode)
    // 始终同步 CSS 变量（SSOT：JS 颜色 → DOM CSS 变量）
    applyCssVariables(mode)
  }, [setDark])

  /** 监听父页面 postMessage 主题切换（支持携带自定义颜色） */
  const listeningMessage = useCallback(
    (e: MessageEvent) => {
      const { data } = e
      if (!data || typeof data !== 'object') return
      switch (data.type) {
        case 'theme-dark':
          setDark(true)
          applyColorParams(data, 'dark')
          applyCssVariables('dark')
          return
        case 'theme-light':
          setDark(false)
          applyColorParams(data, 'light')
          applyCssVariables('light')
          return
      }
    },
    [setDark]
  )

  /**
   * 应用/取消暗黑主题到 LogicFlow 画布（背景 + 网格 + 边文字）
   * 所有颜色均从 themeConfig 读取，不再硬编码
   */
  const applyDarkTheme = useCallback((lfInstance: any, isDarkMode: boolean) => {
    if (!lfInstance) return
    const colors = getThemeColors(isDarkMode ? 'dark' : 'light')
    lfInstance.graphModel.background = {
      background: colors.bgPage,
    }
    if (lfInstance.graphModel.grid) {
      lfInstance.graphModel.grid.config = {
        ...lfInstance.graphModel.grid.config,
        color: colors.gridColor,
      }
    }
    lfInstance.setTheme({
      snapline: {
        stroke: colors.snaplineStroke,
        strokeWidth: 2,
      },
      nodeText: {
        color: colors.nodeTextColor,
        fill: colors.nodeTextFill,
        fontSize: 13,
        fontWeight: 500,
      },
      edgeText: {
        fontSize: 13,
        strokeWidth: 1,
        background: {
          fill: colors.edgeTextBg,
        },
      },
    })
  }, [])

  const setupMessageListener = useCallback(() => {
    window.addEventListener('message', listeningMessage)
    if (window.parent !== window) {
      window.parent.postMessage({ method: 'getTheme' }, '*')
    }
  }, [listeningMessage])

  const cleanupMessageListener = useCallback(() => {
    window.removeEventListener('message', listeningMessage)
  }, [listeningMessage])

  return {
    isDark,
    themeColors,
    dark: darkColors,
    light: lightColors,
    setDark,
    initFromUrl,
    applyDarkTheme,
    setupMessageListener,
    cleanupMessageListener,
    setCustomThemeColors,
    resetThemeColors,
    getUserOverride,
    getThemeColors,
  }
}

// 导出非响应式的默认颜色常量（供非 React 上下文使用）
export { lightColors, darkColors }
