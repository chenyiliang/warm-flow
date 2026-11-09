import { useCallback, useEffect, useRef, useState } from 'react'
import { handlerResult, handlerType } from '@/api/flow/definition'
import { useI18n } from '@/i18n'

/**
 * 办理人选择弹窗（SelectUser）的逻辑层 Hook（React 版，移植自 Vue 的 composables/useUserPicker）。
 *
 * 集中 state / 数据请求 / 勾选与已选维护，让组件只保留 JSX 与编排。
 * 行为与 Vue 版一致：分组 tab（角色 / 部门 / 用户）、组织树筛选、查询 / 重置、
 * 全选与半选、移动端滚动加载更多、已选回显与提交。
 *
 * 与 Vue 版的实现差异：
 * - `ref` / `reactive` + `toRefs` -> `useState`；`watch` -> `useEffect`；`nextTick` -> `setTimeout(0)`。
 * - **queryParams 不再是被子组件直接 mutate 的共享响应式对象**：React 里改为父持有 state，
 *   通过 `setQueryParam(key, value)` 下传，子组件用受控 value/onChange 写回（单向数据流）。
 * - 子组件的命令式方法（tree.filter / tree.setCurrentKey / search.resetFields）改为**父持有 state、
 *   直接以 props 驱动**（树筛选关键字、查询表单值都在父级 state 里），因此无需 ref 转发，
 *   这是比 Vue 版更简单的做法：Vue 需要 `$refs.xxx.filter()` 是因为树筛选态在子组件内部。
 *
 * @author warm
 */

/** 已选办理人行（回显 / 提交用） */
export interface SelectedHandlerItem {
  storageId: string
  handlerName?: string
  [key: string]: any
}

export interface UseUserPickerOptions {
  /** 已选用户存储主键集合（等价 Vue 的 v-model:selectUser） */
  selectUser?: any[]
  /** 已选办理人行（回显用） */
  permissionRows?: SelectedHandlerItem[]
  /** 提交选择（等价 Vue emit('handleUserSelect')） */
  onUserSelect?: (checkedItemList: SelectedHandlerItem[]) => void
}

export interface UseUserPickerReturn {
  // —— state ——
  tabsValue: string
  tabsList: any[]
  tableList: any[]
  loading: boolean
  total: number
  dateRange: any[]
  groupName: string
  groupOptions: any
  mobileLoadingMore: boolean
  mobileNoMore: boolean
  checkedItemList: SelectedHandlerItem[]
  queryParams: Record<string, any>
  checkAllInfo: { isChecked: boolean; isIndeterminate: boolean }
  // —— 写回 state（受控子组件用）——
  setTabsValue: (v: string) => void
  setGroupName: (v: string) => void
  setDateRange: (v: any[]) => void
  setQueryParam: (key: string, value: any) => void
  // —— methods ——
  getList: (append?: boolean) => void
  onMobileScroll: (e: any) => void
  handleNodeClick: (data: any) => void
  tabChange: (tab: string) => void
  handleQuery: () => void
  resetQuery: () => void
  handleCheckAll: (checked: boolean) => void
  handleCheck: (row: any) => void
  handleClose: (storageId: any) => void
  clearAllSelected: () => void
  submitForm: () => void
}

// 移动端分页：每页 10 条，滚动加载更多
const MOBILE_PAGE_SIZE = 10

/** 移动端 / 平板判定（与画布 Hook 一致） */
function isMobileViewport(): boolean {
  return typeof window !== 'undefined' && window.innerWidth <= 768
}

export function useUserPicker(options: UseUserPickerOptions = {}): UseUserPickerReturn {
  const { selectUser, permissionRows, onUserSelect } = options
  const { t } = useI18n()

  const [tabsValue, setTabsValue] = useState('')
  const [tabsList, setTabsList] = useState<any[]>([])
  const [tableList, setTableList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [dateRange, setDateRange] = useState<any[]>([])
  const [groupName, setGroupName] = useState('')
  const [groupOptions, setGroupOptions] = useState<any>(undefined)
  const [mobileLoadingMore, setMobileLoadingMore] = useState(false)
  const [mobileNoMore, setMobileNoMore] = useState(false)
  const [checkedItemList, setCheckedItemList] = useState<SelectedHandlerItem[]>([])
  const [checkAllInfo, setCheckAllInfo] = useState({ isChecked: false, isIndeterminate: false })
  const [queryParams, setQueryParams] = useState<Record<string, any>>({
    pageNum: 1,
    pageSize: isMobileViewport() ? MOBILE_PAGE_SIZE : 10,
    userName: undefined,
    status: '0',
    groupId: undefined,
  })

  // 回调存盒子，避免请求闭包捕获旧回调
  const cbRef = useRef({ onUserSelect })
  cbRef.current = { onUserSelect }
  // 已选列表存盒子：请求回调里要读最新值给行打 isChecked
  const checkedRef = useRef(checkedItemList)
  checkedRef.current = checkedItemList
  const tabsValueRef = useRef(tabsValue)
  tabsValueRef.current = tabsValue
  const dateRangeRef = useRef(dateRange)
  dateRangeRef.current = dateRange
  const queryRef = useRef(queryParams)
  queryRef.current = queryParams
  const tableListRef = useRef(tableList)
  tableListRef.current = tableList

  // 已选初始化 / 外部变更同步（对齐 Vue watch(props.selectUser, ..., {immediate:true}))
  const selectUserKey = JSON.stringify(selectUser ?? [])
  useEffect(() => {
    if (selectUser && selectUser.length > 0) {
      // 有已选主键：用 permissionRows 回显名称，并同步表格勾选态
      const rows = (permissionRows ?? []).filter((n) => n.storageId)
      setCheckedItemList(rows.length ? rows : selectUser.map((id: any) => ({ storageId: id })))
    } else {
      setCheckedItemList([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectUserKey])

  /** 单字段写回查询参数 */
  const setQueryParam = useCallback((key: string, value: any) => {
    setQueryParams((prev) => ({ ...prev, [key]: value }))
  }, [])

  /** 依据当前表格与已选列表重算全选 / 半选态 */
  const recomputeCheckAll = useCallback((list: any[], checked: SelectedHandlerItem[]) => {
    const len = list.length
    let count = 0
    list.forEach((item) => {
      if (item.isChecked) count += 1
    })
    setCheckAllInfo({
      isChecked: len === count && len > 0,
      isIndeterminate: count > 0 && count < len,
    })
    void checked
  }, [])

  /** 查询用户列表（append=true 为移动端滚动追加） */
  const getList = useCallback((append = false) => {
    if (append) {
      setMobileLoadingMore(true)
    } else {
      setLoading(true)
    }
    if (!tabsValueRef.current) {
      setLoading(false)
      setMobileLoadingMore(false)
      return
    }
    const range = Array.isArray(dateRangeRef.current) ? dateRangeRef.current : []
    const params = {
      ...queryRef.current,
      handlerType: tabsValueRef.current,
      beginTime: range[0],
      endTime: range[1],
    }

    handlerResult(params)
      .then((res: any) => {
        setLoading(false)
        setMobileLoadingMore(false)
        const handlerAuths = res.data.handlerAuths
        const checked = checkedRef.current
        const rows = (handlerAuths.rows ?? []).map((item: any) => ({
          ...item,
          isChecked: checked.findIndex((e) => e.storageId === item.storageId) !== -1,
        }))
        setTableList((prev) => (append && isMobileViewport() ? [...prev, ...rows] : rows))
        setTotal(handlerAuths.total)
        setGroupOptions(res.data.treeSelections)
        recomputeCheckAll(rows, checked)
      })
      .catch(() => {
        // 接口异常也结束 loading，展示空状态而非一直转圈
        setLoading(false)
        setMobileLoadingMore(false)
      })
  }, [recomputeCheckAll])

  /** 获取分组 tabs（角色 / 部门 / 用户） */
  const getTabsType = useCallback(() => {
    handlerType()
      .then((res: any) => {
        const list = res.data ?? []
        setTabsList(list)
        if (list.length > 0) {
          setTabsValue(list[0])
          tabsValueRef.current = list[0]
        }
        getList()
      })
      .catch(() => {
        setLoading(false)
        setMobileLoadingMore(false)
      })
    // getList 稳定（useCallback），首次挂载拉一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 挂载时拉取分组与首屏列表（对齐 Vue 版在 setup 里直接调 getTabsType()）
  useEffect(() => {
    getTabsType()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 移动端滚动加载更多 */
  const loadMoreMobile = useCallback(() => {
    if (mobileLoadingMore || mobileNoMore || loading) return
    if (tableListRef.current.length >= total) {
      setMobileNoMore(true)
      return
    }
    setQueryParams((prev) => ({ ...prev, pageNum: prev.pageNum + 1, pageSize: MOBILE_PAGE_SIZE }))
    getList(true)
  }, [mobileLoadingMore, mobileNoMore, loading, total, getList])

  /** 移动端卡片列表滚动事件：距底 60px 触发加载 */
  const onMobileScroll = useCallback((e: any) => {
    const el = e.target
    if (!el) return
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 60) {
      loadMoreMobile()
    }
  }, [loadMoreMobile])

  /** 重置移动端分页状态 */
  const resetMobilePagination = useCallback(() => {
    setMobileLoadingMore(false)
    setMobileNoMore(false)
    setQueryParams((prev) => ({
      ...prev,
      pageNum: 1,
      ...(isMobileViewport() ? { pageSize: MOBILE_PAGE_SIZE } : null),
    }))
  }, [])

  /** 搜索 */
  const handleQuery = useCallback(() => {
    resetMobilePagination()
    // state 更新是异步的，用微任务后的最新 queryRef 值发请求
    setTimeout(() => getList(), 0)
  }, [resetMobilePagination, getList])

  /** 组织树节点单击：按部门 id 过滤 */
  const handleNodeClick = useCallback((data: any) => {
    const groupId = data?.id ?? data?.value
    setQueryParams((prev) => ({ ...prev, groupId }))
    resetMobilePagination()
    setTimeout(() => getList(), 0)
  }, [resetMobilePagination, getList])

  /** tab 切换：清空部门筛选并重新查询 */
  const tabChange = useCallback((tab: string) => {
    setTabsValue(tab)
    tabsValueRef.current = tab
    setGroupName('')
    setDateRange([])
    dateRangeRef.current = []
    setQueryParams((prev) => ({
      ...prev,
      groupId: undefined,
      handlerCode: undefined,
      handlerName: undefined,
    }))
    resetMobilePagination()
    setTimeout(() => getList(), 0)
  }, [resetMobilePagination, getList])

  /** 重置查询条件 */
  const resetQuery = useCallback(() => {
    setDateRange([])
    dateRangeRef.current = []
    setGroupName('')
    setQueryParams((prev) => ({
      ...prev,
      groupId: undefined,
      handlerCode: undefined,
      handlerName: undefined,
    }))
    resetMobilePagination()
    setTimeout(() => getList(), 0)
  }, [resetMobilePagination, getList])

  /** 全选 / 取消全选 */
  const handleCheckAll = useCallback((checked: boolean) => {
    setTableList((prevList) => {
      const next = prevList.map((item) => ({ ...item, isChecked: checked }))
      setCheckedItemList((prevChecked) => {
        const arr = [...prevChecked]
        if (checked) {
          next.forEach((item) => {
            if (arr.findIndex((e) => e.storageId === item.storageId) === -1) {
              arr.push({ storageId: item.storageId, handlerName: item.handlerName })
            }
          })
        } else {
          next.forEach((item) => {
            const index = arr.findIndex((e) => e.storageId === item.storageId)
            if (index !== -1) arr.splice(index, 1)
          })
        }
        checkedRef.current = arr
        return arr
      })
      setCheckAllInfo({ isChecked: checked && next.length > 0, isIndeterminate: false })
      return next
    })
  }, [])

  /** 单行勾选（整行点击驱动，checkbox 仅展示态） */
  const handleCheck = useCallback((row: any) => {
    setTableList((prevList) =>
      prevList.map((e) =>
        e.storageId === row.storageId ? { ...e, isChecked: !e.isChecked } : e
      )
    )
    setCheckedItemList((prevChecked) => {
      const arr = [...prevChecked]
      const wasChecked = row.isChecked
      if (!wasChecked) {
        if (arr.findIndex((e) => e.storageId === row.storageId) === -1) {
          arr.push({ storageId: row.storageId, handlerName: row.handlerName })
        }
      } else {
        const index = arr.findIndex((n) => n.storageId === row.storageId)
        if (index !== -1) arr.splice(index, 1)
      }
      checkedRef.current = arr
      // 重算全选态
      const list = tableListRef.current.map((e) =>
        e.storageId === row.storageId ? { ...e, isChecked: !e.isChecked } : e
      )
      const len = list.length
      const count = list.filter((i) => i.isChecked).length
      setCheckAllInfo({
        isChecked: len === count && len > 0,
        isIndeterminate: count > 0 && count < len,
      })
      return arr
    })
  }, [])

  /** 删除已选标签 */
  const handleClose = useCallback((storageId: any) => {
    setTableList((prevList) =>
      prevList.map((e) =>
        e.storageId === storageId ? { ...e, isChecked: !e.isChecked } : e
      )
    )
    setCheckedItemList((prevChecked) => {
      const arr = [...prevChecked]
      const index = arr.findIndex((n) => n.storageId === storageId)
      if (index !== -1) arr.splice(index, 1)
      checkedRef.current = arr
      return arr
    })
    setTimeout(() => {
      const list = tableListRef.current
      const len = list.length
      const count = list.filter((i) => i.isChecked).length
      setCheckAllInfo({
        isChecked: len === count && len > 0,
        isIndeterminate: count > 0 && count < len,
      })
    }, 0)
  }, [])

  /** 清空所有已选 */
  const clearAllSelected = useCallback(() => {
    setTableList((prevList) => prevList.map((e) => ({ ...e, isChecked: false })))
    setCheckedItemList([])
    checkedRef.current = []
    setCheckAllInfo({ isChecked: false, isIndeterminate: false })
  }, [])

  /** 提交选择：回传已选列表并关闭弹窗 */
  const submitForm = useCallback(() => {
    cbRef.current.onUserSelect?.(checkedRef.current)
  }, [])

  void t

  return {
    tabsValue,
    tabsList,
    tableList,
    loading,
    total,
    dateRange,
    groupName,
    groupOptions,
    mobileLoadingMore,
    mobileNoMore,
    checkedItemList,
    queryParams,
    checkAllInfo,
    setTabsValue,
    setGroupName,
    setDateRange,
    setQueryParam,
    getList,
    onMobileScroll,
    handleNodeClick,
    tabChange,
    handleQuery,
    resetQuery,
    handleCheckAll,
    handleCheck,
    handleClose,
    clearAllSelected,
    submitForm,
  }
}
