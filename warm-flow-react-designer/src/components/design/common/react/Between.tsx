import {
  forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState,
} from 'react'
import SvgIcon from '@/components/SvgIcon'
import {
  WfForm, WfFormItem, WfInput, WfSelect, WfOption, WfTable, WfTableColumn,
  WfButton, WfTreeSelect, WfDialog, WfTooltip, WfIcon,
} from '@/ui/components'
import NodeExtList from './NodeExtList'
import SelectUser from './SelectUser'
import type { NodeExtListHandle } from './NodeExtList'
import type { SelectedHandlerItem } from '@/hooks/useUserPicker'
import {
  nodeExt, handlerFeedback, listenerList,
} from '@/api/flow/definition'
import { getPreviousNodes } from '@/components/design/common/js/tool'
import { getFramework } from '@/utils/auth'
import { useI18n } from '@/i18n'

/**
 * 中间（审批）节点属性面板（React 版，移植自 common/vue/between.vue，704 行）。
 *
 * 页签：基础设置 / 办理人设置 / 监听器 / + 后端 nodeExt 定义的动态扩展页签。
 * 基础设置含：节点编码 / 名称、协作方式（或签 / 票签 / 会签）、票签通过策略、
 * 票签退回节点、自定义表单（是 / 否）+ 表单路径 / 标识、节点扩展属性（可折叠）。
 *
 * 与 Vue 版的差异：
 * - **表单值受控**：Vue 版 `const form = ref(props.modelValue)` 直接引用父对象并就地 mutate
 *   （`form.value.permissionFlag.splice(...)`）；React 版全部走不可变更新 + `onChange` 回传父级，
 *   由 PropertySetting 统一写回 `lf.setProperties`。
 * - **nodeRatio 组装**：Vue 版用 `watch(form, deep)` 回写 `n.nodeRatio`；React 版在
 *   `useEffect([nodeRatioType, nodeRatioValue])` 里算出并经 onChange 回传（语义等价、显式）。
 * - **校验**：Vue 版 `proxy.$refs.formRef.validate(cb)` + 各 tab 的 nodeExtList.validate 串联；
 *   React 版自带 validate()：先校验自身票签策略必填与格式，再调各 NodeExtList ref 的 validate()。
 * - `computed` filteredNodes -> `useMemo`；动态 tab 列表用 state（nodeExt 请求回来后追加）。
 *
 * @author warm
 */
export interface BetweenProps {
  /** 节点表单数据（受控） */
  value?: Record<string, any>
  /** 只读 */
  disabled?: boolean
  /** 是否展示所有协作方式 */
  showWays?: boolean
  /** 画布节点列表（票签退回节点候选来源） */
  nodes?: any[]
  /** 画布边列表 */
  skips?: any[]
  /** 自定义表单路径树 */
  formPathList?: any[]
  /** 表单值变更 */
  onChange?: (value: Record<string, any>) => void
  /** 自定义扩展点（透出 form / disabled） */
  nodeFormExtra?: (ctx: { form: Record<string, any>; disabled: boolean }) => React.ReactNode
}

/** Between 通过 ref 暴露的契约 */
export interface BetweenHandle {
  validate: () => Promise<boolean>
}

// Tab 图标（单路径 SVG，viewBox 0 0 24 24，跟随 tab 文字色 currentColor）
const TAB_ICONS = {
  base: 'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z',
  handler: 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z',
  listener: 'M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z',
  ext: 'M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5C13 2.12 11.88 1 10.5 1S8 2.12 8 3.5V5H4c-1.1 0-1.99.9-1.99 2v3.8H3.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7 1.49 0 2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5c1.38 0 2.5-1.12 2.5-2.5S21.88 11 20.5 11z',
}

/** 表达式类通过策略（走单一宽输入框 + 特定格式校验） */
const EXPRESS_RATIO_TYPES = ['spel', 'default', 'snel']

const Between = forwardRef<BetweenHandle, BetweenProps>((props, ref) => {
  const {
    value = {},
    disabled = false,
    showWays = true,
    nodes = [],
    skips = [],
    formPathList = [],
    onChange,
    nodeFormExtra,
  } = props
  const { t } = useI18n()

  const framework = getFramework()
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768

  const [tabsValue, setTabsValue] = useState('1')
  // 节点扩展属性折叠状态（默认收起）
  const [baseExtCollapsed, setBaseExtCollapsed] = useState(true)
  // 动态扩展页签（后端 nodeExt type=2 的分组）
  const [extTabs, setExtTabs] = useState<{ label: string; name: string }[]>([])
  // 基础设置里的扩展属性（nodeExt type=1 的 childs）
  const [baseList, setBaseList] = useState<any[]>([])
  // 各动态页签的扩展属性定义（code -> childs）
  const [buttonList, setButtonList] = useState<Record<string, any[]>>({})
  // 办理人表格行（storageId + handlerName）
  const [permissionRows, setPermissionRows] = useState<SelectedHandlerItem[]>([])
  // 监听器可选项
  const [listenerVo, setListenerVo] = useState<any[]>([])
  // 办理人选择弹窗
  const [userVisible, setUserVisible] = useState(false)

  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  // 基础扩展属性表单的 ref（校验时串联）
  const nodeBaseRef = useRef<NodeExtListHandle>(null)
  // 动态扩展页签表单的 ref 集合
  const extRefs = useRef<Record<string, NodeExtListHandle | null>>({})

  const tabsList = useMemo(() => {
    const base = [
      { label: t('start.tabBase'), name: '1', iconPath: TAB_ICONS.base },
      { label: t('between.tabHandler'), name: '2', iconPath: TAB_ICONS.handler },
      { label: t('start.tabListener'), name: '3', iconPath: TAB_ICONS.listener },
    ]
    // 动态页签无内置图标，用 ext 图标兜底
    return [
      ...base,
      ...extTabs.map((e) => ({ label: e.label, name: e.name, iconPath: TAB_ICONS.ext })),
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, extTabs])

  /** 更新表单单字段并回传父级 */
  const setField = useCallback((key: string, v: any) => {
    onChangeRef.current?.({ ...value, [key]: v })
    // value 由父级下传，此处依赖当前渲染的 value
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  /** 整体替换表单（多字段联动时用） */
  const patchForm = useCallback((patch: Record<string, any>) => {
    onChangeRef.current?.({ ...value, ...patch })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  // 监听器行：缺省给一行空（对齐 Vue 版 listenerRows 初始化）
  const listenerRows: any[] =
    Array.isArray(value.listenerRows) && value.listenerRows.length ? value.listenerRows : [{}]

  /**
   * permissionFlag 在「字符串（后端 @@ 分隔）」与「数组（编辑态）」之间转换。
   * Vue 版在 setup 里调 getPermissionFlag() 做一次；React 版用 effect 在挂载 / 切换节点时做。
   */
  useEffect(() => {
    const pf = value.permissionFlag
    if (typeof pf === 'string') {
      const arr = pf ? pf.split('@@') : []
      patchForm({ permissionFlag: arr })
      // 办理人名称回显
      if (arr.filter(Boolean).length) {
        handlerFeedback({ storageIds: arr })
          .then((response: any) => {
            if (response.code === 200 && response.data) setPermissionRows(response.data)
          })
          .catch(() => {})
      } else {
        setPermissionRows([])
      }
    } else if (Array.isArray(pf)) {
      setPermissionRows(
        pf.filter(Boolean).map((id: any) => {
          const hit = permissionRows.find((r) => r.storageId === id)
          return hit ?? { storageId: id }
        })
      )
    }
    // 仅在 permissionFlag 的类型 / 值变化时转换（切换节点会换 value 引用）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeof value.permissionFlag === 'string' ? value.permissionFlag : JSON.stringify(value.permissionFlag)])

  /** nodeRatio 组装（对齐 Vue 版 watch(form) 的 nodeRatio 分支） */
  useEffect(() => {
    const type = value.nodeRatioType
    if (!type) return
    let nodeRatio = ''
    if (/^passCount|rejectCount/.test(type)) {
      nodeRatio = type + '='
    } else if (/^spel|default|snel/.test(type)) {
      nodeRatio = type + '@@'
    }
    const next = nodeRatio + (value.nodeRatioValue ?? '')
    if (next !== value.nodeRatio) patchForm({ nodeRatio: next })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.nodeRatioType, value.nodeRatioValue])

  /** 查询节点扩展属性定义（基础扩展 + 动态页签） */
  useEffect(() => {
    nodeExt()
      .then((response: any) => {
        if (response.code !== 200 || !response.data) return
        const nextBase: any[] = []
        const nextTabs: { label: string; name: string }[] = []
        const nextButtonList: Record<string, any[]> = {}
        const defaults: Record<string, any> = {}

        response.data.forEach((e: any) => {
          // 下拉 / 单选多选的默认值（selected 项）
          ;(e.childs ?? []).forEach((cItem: any) => {
            if ([3, 4].includes(cItem.type) && cItem?.dict) {
              const cur = value.ext?.[cItem.code]
              if (cur === undefined) {
                if (cItem.multiple) {
                  const arr: string[] = []
                  cItem.dict.forEach((d: any) => {
                    if (d.selected) arr.push(String(d.value))
                  })
                  defaults[cItem.code] = arr
                } else {
                  const picked = cItem.dict.find((d: any) => d.selected)?.value
                  defaults[cItem.code] = picked != null ? String(picked) : null
                }
              } else if (cItem.multiple) {
                // 处理为空、只选择一项的多选（字符串 -> 数组）
                defaults[cItem.code] = cur
                  ? Array.isArray(cur)
                    ? cur
                    : String(cur).split(',')
                  : []
              }
            }
          })
          if (e.type === 1) nextBase.push(...(e.childs ?? []))
          else if (e.type === 2) {
            nextTabs.push({ label: e.name, name: e.code })
            nextButtonList[e.code] = e.childs ?? []
          }
        })

        setBaseList(nextBase)
        setExtTabs(nextTabs)
        setButtonList(nextButtonList)
        if (Object.keys(defaults).length) {
          patchForm({ ext: { ...defaults, ...(value.ext ?? {}) } })
        }
      })
      .catch(() => {})
    // 挂载时拉一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 获取监听器列表（切到监听器页签时拉，与 Vue 版 handleTabChange 一致） */
  const getListenerList = useCallback(() => {
    listenerList()
      .then((response: any) => {
        if (response.code === 200 && response.data) setListenerVo(response.data)
      })
      .catch(() => {})
  }, [])

  /** 办理人名称回显（切到办理人页签时拉） */
  const getHandlerFeedback = useCallback(() => {
    const pf = value.permissionFlag
    const ids = Array.isArray(pf) ? pf.filter(Boolean) : pf ? String(pf).split('@@').filter(Boolean) : []
    if (!ids.length) return
    handlerFeedback({ storageIds: ids })
      .then((response: any) => {
        if (response.code === 200 && response.data) setPermissionRows(response.data)
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.permissionFlag])

  /** 页签切换：按需拉取对应数据 */
  const handleTabChange = useCallback((name: string) => {
    setTabsValue(name)
    if (name === '2') getHandlerFeedback()
    else if (name === '3') getListenerList()
  }, [getHandlerFeedback, getListenerList])

  // —— 校验：票签通过策略必填 + 格式（对齐 Vue 版 rules.nodeRatio 的 validator 分支）——
  function validatePassRatio(v: any): string | null {
    if (v === '' || v === undefined || v === null) return t('between.ratioPassRatioRequired')
    const numValue = Number(v)
    if (isNaN(numValue)) return t('between.ratioInvalidNumber')
    if (numValue < 0.001 || numValue > 100) return t('between.ratioRange')
    if (!/^\d+(\.\d{1,3})?$/.test(String(v))) return t('between.ratioDecimal')
    return null
  }
  function validatePassCount(v: any): string | null {
    if (v === '' || v === undefined || v === null) return t('between.ratioCountRequired')
    const s = String(v).replace('passCount', '').replace('rejectCount', '').replace('=', '').trim()
    if (!/^[1-9]\d*$/.test(s)) return t('between.ratioPositiveInt')
    return null
  }
  function validateExpr(v: any, kind: 'default' | 'spel' | 'snel'): string | null {
    const s = String(v ?? '').replace(`${kind}@@`, '').replace('=', '').trim()
    if (!s) return t(kind === 'default' ? 'skip.defaultRequired' : kind === 'spel' ? 'skip.spelRequired' : 'skip.snelRequired')
    if (kind === 'default') {
      if (!/^\$\{.*\}$/.test(s)) return t('skip.defaultFormat')
    } else {
      if (!/^#\{.*\}$/.test(s)) return t(kind === 'spel' ? 'skip.spelFormat' : 'skip.snelFormat')
    }
    return null
  }

  /** 通过策略值的占位提示 */
  function getNodeRatioDescription() {
    switch (value.nodeRatioType) {
      case 'passRatio':
        return t('between.descPassRatio')
      case 'passCount':
        return t('between.descPassCount')
      case 'rejectCount':
        return t('between.descRejectCount')
      case 'default':
        return t('between.descDefault')
      case 'spel':
        return t('skip.descSpel')
      case 'snel':
        return t('skip.descSnel')
      default:
        return t('common.pleaseInput')
    }
  }

  /** 清空通过策略 */
  const handleClear = useCallback(() => {
    patchForm({ nodeRatioType: '', nodeRatioValue: '', nodeRatio: '' })
  }, [patchForm])

  /** 校验（经 ref 暴露）：自身必填/格式 + 基础扩展 + 动态扩展页签 */
  const validate = useCallback(async (): Promise<boolean> => {
    // 票签（collaborativeWay === '2'）时通过策略必填且需符合格式
    if (value.collaborativeWay === '2') {
      const type = value.nodeRatioType
      const ratioValue = value.nodeRatioValue
      if (!type) return false
      let err: string | null = null
      if (type === 'passRatio') err = validatePassRatio(ratioValue)
      else if (['passCount', 'rejectCount'].includes(type)) err = validatePassCount(value.nodeRatio)
      else if (EXPRESS_RATIO_TYPES.includes(type)) {
        err = validateExpr(value.nodeRatio, type as 'default' | 'spel' | 'snel')
      }
      if (err) return false
    }
    // 基础扩展属性必填
    if (baseList.length && nodeBaseRef.current) {
      if (!(await nodeBaseRef.current.validate())) return false
    }
    // 动态扩展页签必填
    for (const e of extTabs) {
      const r = extRefs.current[e.name]
      if (r && !(await r.validate())) return false
    }
    return true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, baseList, extTabs])

  useImperativeHandle(ref, () => ({ validate }), [validate])

  // —— 办理人：增删改 + 弹窗选择 ——
  const delPermission = useCallback((index: number) => {
    const pf = Array.isArray(value.permissionFlag) ? [...value.permissionFlag] : []
    pf.splice(index, 1)
    setPermissionRows((prev) => prev.filter((_, i) => i !== index))
    patchForm({ permissionFlag: pf })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.permissionFlag])

  const addPermission = useCallback(() => {
    const pf = Array.isArray(value.permissionFlag) ? [...value.permissionFlag] : []
    pf.push('')
    setPermissionRows((prev) => [...prev, { storageId: '', handlerName: '' }])
    patchForm({ permissionFlag: pf })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.permissionFlag])

  /** 手动输入办理人主键（失焦写回） */
  const inputBlur = useCallback((val: string, index: number) => {
    const pf = Array.isArray(value.permissionFlag) ? [...value.permissionFlag] : []
    pf[index] = val
    setPermissionRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, storageId: val } : r))
    )
    patchForm({ permissionFlag: pf })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.permissionFlag])

  /** 弹窗提交选择 */
  const handleUserSelect = useCallback((checkedItemList: SelectedHandlerItem[]) => {
    const ids = checkedItemList.map((e) => e.storageId).filter((n) => n)
    setPermissionRows(checkedItemList)
    patchForm({ permissionFlag: ids })
    setUserVisible(false)
  }, [patchForm])

  // —— 监听器行 ——
  const updateListenerRow = useCallback((index: number, patch: Record<string, any>) => {
    const next = listenerRows.map((row, i) => (i === index ? { ...row, ...patch } : row))
    patchForm({ listenerRows: next })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listenerRows])

  /** 监听器路径变更：级联更新类型（在 listenerVo 中匹配 path -> type） */
  const handleListenerPathChange = useCallback((path: string, index: number) => {
    let listenerType = ''
    if (path) {
      const matched = listenerVo.find((item) => item.path === path)
      listenerType = matched?.type ?? ''
    }
    updateListenerRow(index, { listenerPath: path, listenerType })
  }, [listenerVo, updateListenerRow])

  const handleAddRow = useCallback(() => {
    patchForm({ listenerRows: [...listenerRows, { listenerType: '', listenerPath: '' }] })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listenerRows])

  const handleDeleteRow = useCallback((index: number) => {
    patchForm({ listenerRows: listenerRows.filter((_, i) => i !== index) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listenerRows])

  /** 票签退回节点候选：前驱节点中排除开始与三类网关（对齐 Vue 版 filteredNodes） */
  const filteredNodes = useMemo(() => {
    const previousNodes = getPreviousNodes(nodes, skips, value.nodeCode)
    return previousNodes.filter(
      (node: any) => !['start', 'serial', 'parallel', 'inclusive'].includes(node.type)
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, skips, value.nodeCode])

  /** 渲染协作方式 / 自定义表单的卡片式单选 */
  const renderRadioCard = (opts: {
    field: string
    value: string
    label: string
    tip: string
    visible?: boolean
  }) => {
    const checked = value[opts.field] === opts.value
    if (opts.visible === false) return null
    return (
      <label
        key={opts.value}
        className={`radio-card-item${checked ? ' is-checked' : ''}`}
        onClick={() => {
          if (!disabled) setField(opts.field, opts.value)
        }}
      >
        <span className="radio-card-dot" />
        <span className="radio-card-text">{opts.label}</span>
        <WfTooltip placement="top" title={opts.tip}>
          <WfIcon size={13} className="radio-card-tip">
            <SvgIcon iconClass="ep:warning-filled" />
          </WfIcon>
        </WfTooltip>
      </label>
    )
  }

  const isDynamicTab = tabsValue !== '1' && tabsValue !== '2' && tabsValue !== '3'

  return (
    <div className="between">
      <WfForm className="betweenForm" disabled={disabled}>
        {/* 页签区域 */}
        <div className="modern-tabs-wrapper">
          <div className="modern-tabs">
            {tabsList.map((item, index) => (
              <div
                key={item.name}
                className={`modern-tab-item${tabsValue === item.name ? ' is-active' : ''}${index >= 3 ? ' is-ext-tab' : ''}`}
                onClick={() => handleTabChange(item.name)}
              >
                <svg className="tab-icon" viewBox="0 0 24 24">
                  <path d={item.iconPath || TAB_ICONS.ext} fill="currentColor" />
                </svg>
                <span className="tab-label">{item.label}</span>
                {index >= 3 ? <span className="tab-ext-tag">{t('between.extTag')}</span> : null}
              </div>
            ))}
          </div>
        </div>

        {/* 基础设置 */}
        <div style={{ display: tabsValue === '1' ? 'block' : 'none' }} className="tabPane">
          <div className="base-settings-section">
            <div className="base-settings-content">
              <WfFormItem label={t('node.codeLabel')}>
                <WfInput
                  value={value.nodeCode ?? ''}
                  disabled={disabled}
                  onChange={(v: any) =>
                    setField('nodeCode', typeof v === 'string' ? v : v?.target?.value ?? '')
                  }
                />
              </WfFormItem>
              <WfFormItem label={t('node.nameLabel')}>
                <WfInput
                  value={value.nodeName ?? ''}
                  multiple
                  disabled={disabled}
                  onChange={(v: any) =>
                    setField('nodeName', typeof v === 'string' ? v : v?.target?.value ?? '')
                  }
                />
              </WfFormItem>

              {/* 协作方式：卡片式单选（或签 / 票签 / 会签） */}
              <WfFormItem label={t('between.collaborativeWay')}>
                <div className="radio-card-group">
                  {renderRadioCard({
                    field: 'collaborativeWay',
                    value: '1',
                    label: t('between.wayOr'),
                    tip: t('between.wayOrTip'),
                    visible: value.collaborativeWay === '1' || showWays,
                  })}
                  {renderRadioCard({
                    field: 'collaborativeWay',
                    value: '2',
                    label: t('between.wayVote'),
                    tip: t('between.wayVoteTip'),
                    visible: value.collaborativeWay === '2' || showWays,
                  })}
                  {renderRadioCard({
                    field: 'collaborativeWay',
                    value: '3',
                    label: t('between.waySign'),
                    tip: t('between.waySignTip'),
                    visible: value.collaborativeWay === '3' || showWays,
                  })}
                </div>
              </WfFormItem>

              {/* 票签通过策略（仅协作方式=票签时显示） */}
              {value.collaborativeWay === '2' ? (
                <WfFormItem label={t('between.ratioStrategy')}>
                  <WfSelect
                    value={value.nodeRatioType}
                    placeholder={t('between.ratioStrategyPlaceholder')}
                    disabled={disabled}
                    hasClear
                    style={{ width: '25%' }}
                    onChange={(v: any) => setField('nodeRatioType', v ?? '')}
                  >
                    <WfOption value="passRatio">{t('between.ratioPassRatio')}</WfOption>
                    <WfOption value="passCount">{t('between.ratioPassCount')}</WfOption>
                    <WfOption value="rejectCount">{t('between.ratioRejectCount')}</WfOption>
                    {framework === 'SPRING_BOOT' ? (
                      <WfOption value="default">{t('between.ratioDefaultExpr')}</WfOption>
                    ) : null}
                    {framework === 'SPRING_BOOT' ? (
                      <WfOption value="spel">{t('between.ratioSpelExpr')}</WfOption>
                    ) : null}
                    {framework === 'SOLON' ? (
                      <WfOption value="snel">{t('between.ratioSnelExpr')}</WfOption>
                    ) : null}
                  </WfSelect>
                  <WfInput
                    value={value.nodeRatioValue ?? ''}
                    placeholder={getNodeRatioDescription()}
                    disabled={disabled}
                    style={{ width: '74%', marginLeft: '1%' }}
                    onChange={(v: any) =>
                      setField('nodeRatioValue', typeof v === 'string' ? v : v?.target?.value ?? '')
                    }
                  />
                </WfFormItem>
              ) : null}

              {/* 票签退回节点（票签模式必填，标红星） */}
              <WfFormItem
                label={
                  <span>
                    {value.collaborativeWay === '2' ? (
                      <span className="mr5" style={{ color: 'red' }}>
                        *
                      </span>
                    ) : null}
                    {t('between.rejectToNode')}
                  </span>
                }
              >
                <WfSelect
                  value={value.anyNodeSkip}
                  disabled={disabled}
                  hasClear
                  style={{ width: '80%' }}
                  onChange={(v: any) => setField('anyNodeSkip', v)}
                >
                  {filteredNodes.map((dict: any) => (
                    <WfOption key={dict.id} value={dict.id}>
                      {dict.text?.value}
                    </WfOption>
                  ))}
                </WfSelect>
                <div className="placeholder mt5">{t('between.voteRejectRequired')}</div>
              </WfFormItem>

              {/* 自定义表单：卡片式单选（是 / 否） */}
              <WfFormItem label={t('between.formCustom')}>
                <div className="radio-card-group radio-card-sm">
                  {renderRadioCard({
                    field: 'formCustom',
                    value: 'N',
                    label: t('common.no'),
                    tip: t('between.formCustomNoTip'),
                  })}
                  {renderRadioCard({
                    field: 'formCustom',
                    value: 'Y',
                    label: t('common.yes'),
                    tip: t('between.formCustomYesTip'),
                  })}
                </div>
              </WfFormItem>

              {value.formCustom === 'N' ? (
                <WfFormItem label={t('between.formPath')}>
                  <WfInput
                    value={value.formPath ?? ''}
                    disabled={disabled}
                    onChange={(v: any) =>
                      setField('formPath', typeof v === 'string' ? v : v?.target?.value ?? '')
                    }
                  />
                </WfFormItem>
              ) : value.formCustom === 'Y' ? (
                <WfFormItem label={t('between.formKey')}>
                  <WfTreeSelect
                    value={value.formPath}
                    dataSource={formPathList}
                    fieldNames={{ value: 'id', label: 'name', children: 'children' }}
                    placeholder={t('baseInfo.categoryPlaceholder')}
                    disabled={disabled}
                    onChange={(v: any) => setField('formPath', v)}
                  />
                </WfFormItem>
              ) : null}

              {/* 自定义扩展点 */}
              {nodeFormExtra ? nodeFormExtra({ form: value, disabled }) : null}
            </div>
          </div>

          {/* 节点扩展属性（基础设置中的）- 可折叠 */}
          {baseList.length > 0 ? (
            <div className={`ext-attributes-section ext-primary${baseExtCollapsed ? ' is-collapsed' : ''}`}>
              <div
                className="ext-attributes-header ext-header-clickable"
                onClick={() => setBaseExtCollapsed((v) => !v)}
              >
                <span className="ext-attributes-icon ext-icon-star">
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path
                      d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
                      fill="currentColor"
                    />
                  </svg>
                </span>
                <span className="ext-attributes-title">{t('between.extAttributes')}</span>
                <span className="ext-attributes-badge">
                  {t('between.extCount', { n: baseList.length })}
                </span>
                <span className="ext-collapse-arrow">
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path
                      d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"
                      className={baseExtCollapsed ? '' : 'arrow-rotated'}
                      fill="currentColor"
                    />
                  </svg>
                </span>
              </div>
              {!baseExtCollapsed ? (
                <div className="ext-attributes-content">
                  <NodeExtList
                    ref={nodeBaseRef}
                    value={value.ext ?? {}}
                    formList={baseList}
                    disabled={disabled}
                    onChange={(ext) => setField('ext', ext)}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* 办理人设置 */}
        <div style={{ display: tabsValue === '2' ? 'block' : 'none' }} className="tabPane tabPane-full">
          <div className="section-card section-blue">
            <div className="section-card-body">
              <WfTable
                dataSource={permissionRows}
                style={{ width: '100%' }}
                className="inputGroup handler-table-mobile"
                tableLayout={isMobile ? 'fixed' : 'auto'}
              >
                <WfTableColumn
                  title={t('between.handlerStorageId')}
                  dataIndex="storageId"
                  width={isMobile ? undefined : 250}
                  cell={(storageId: string, index: number) => (
                    <WfInput
                      value={storageId ?? ''}
                      style={{ width: '100%' }}
                      disabled={disabled}
                      onChange={(v: any) =>
                        inputBlur(typeof v === 'string' ? v : v?.target?.value ?? '', index)
                      }
                    />
                  )}
                />
                <WfTableColumn title={t('between.handlerName')} dataIndex="handlerName" />
                {!disabled ? (
                  <WfTableColumn
                    title={t('common.operation')}
                    width={isMobile ? undefined : 65}
                    align="center"
                    cell={(_v: any, index: number) => (
                      <WfButton text size="small" warning onClick={() => delPermission(index)}>
                        <SvgIcon iconClass="ep:delete" />
                      </WfButton>
                    )}
                  />
                ) : null}
              </WfTable>
              <div className="action-buttons">
                {!disabled ? (
                  <>
                    <WfButton className="add-row-btn" onClick={addPermission}>
                      {t('between.addRowHandler')}
                    </WfButton>
                    <WfButton
                      className="add-row-btn add-row-btn-secondary"
                      onClick={() => setUserVisible(true)}
                    >
                      {t('between.selectHandler')}
                    </WfButton>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {/* 监听器 */}
        <div style={{ display: tabsValue === '3' ? 'block' : 'none' }} className="tabPane tabPane-full">
          <div className="section-card section-purple">
            <div className="section-card-body">
              <WfTable dataSource={listenerRows} style={{ width: '100%' }}>
                <WfTableColumn
                  title={t('common.type')}
                  dataIndex="listenerType"
                  width={isMobile ? 60 : 160}
                  cell={(type: string, index: number) => (
                    <WfSelect
                      value={type}
                      placeholder={t('common.pleaseSelect')}
                      disabled={disabled}
                      onChange={(v: any) => updateListenerRow(index, { listenerType: v })}
                    >
                      <WfOption value="start">{t('start.listenerStart')}</WfOption>
                      <WfOption value="assignment">{t('start.listenerAssignment')}</WfOption>
                      <WfOption value="finish">{t('start.listenerFinish')}</WfOption>
                      <WfOption value="create">{t('start.listenerCreate')}</WfOption>
                    </WfSelect>
                  )}
                />
                <WfTableColumn
                  title={t('baseInfo.listenerPathLabel')}
                  dataIndex="listenerPath"
                  cell={(path: string, index: number) => (
                    <WfSelect
                      value={path}
                      placeholder={t('baseInfo.listenerPathPlaceholder')}
                      disabled={disabled}
                      showSearch
                      hasClear
                      style={{ width: '100%' }}
                      onChange={(v: any) => handleListenerPathChange(v ?? '', index)}
                    >
                      {listenerVo.map((item) => (
                        <WfOption key={item.path} value={item.path}>
                          {item.description}
                        </WfOption>
                      ))}
                    </WfSelect>
                  )}
                />
                {!disabled ? (
                  <WfTableColumn
                    title={t('common.operation')}
                    width={65}
                    align="center"
                    cell={(_v: any, index: number) => (
                      <WfButton text size="small" warning onClick={() => handleDeleteRow(index)}>
                        <SvgIcon iconClass="ep:delete" />
                      </WfButton>
                    )}
                  />
                ) : null}
              </WfTable>
              <div className="action-buttons">
                {!disabled ? (
                  <WfButton className="add-row-btn" onClick={handleAddRow}>
                    {t('common.addRow')}
                  </WfButton>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {/* 动态页签（按钮权限等扩展属性）：tab 已表明分组，无需重复标题与卡片背景 */}
        <div style={{ display: isDynamicTab ? 'block' : 'none' }} className="tabPane tabPane-full">
          {(buttonList[tabsValue] ?? []).length > 0 ? (
            <div className="ext-tab-content">
              <NodeExtList
                ref={(r) => {
                  extRefs.current[tabsValue] = r
                }}
                value={value.ext ?? {}}
                formList={buttonList[tabsValue] ?? []}
                disabled={disabled}
                onChange={(ext) => setField('ext', ext)}
              />
            </div>
          ) : null}
        </div>
      </WfForm>

      {/* 办理人选择弹窗 */}
      {userVisible ? (
        <WfDialog
          title={t('between.userSelectTitle')}
          visible={userVisible}
          width={isMobile ? '96%' : '80%'}
          footer={false}
          className={`person-select-dialog${isMobile ? ' mobile-user-dialog' : ''}`}
          onClose={() => setUserVisible(false)}
        >
          <SelectUser
            selectUser={Array.isArray(value.permissionFlag) ? value.permissionFlag : []}
            permissionRows={permissionRows}
            onUserSelect={handleUserSelect}
          />
        </WfDialog>
      ) : null}
    </div>
  )
})

Between.displayName = 'Between'

export default Between
