import { useState } from 'react'
import { WfForm, WfFormItem, WfInput, WfDatePicker } from '@/ui/components'
import { useI18n } from '@/i18n'

/**
 * 办理人选择器的查询区（React 版，移植自 common/vue/UserPickerSearch.vue）。
 *
 * 权限编码 / 名称 / 创建时间区间查询 + 搜索 / 重置 / 确定；移动端有折叠开关。
 *
 * 与 Vue 版的差异：
 * - **不再需要 ref 转发 resetFields**：Vue 版查询表单值由子组件 el-form 内部持有，父级重置要经
 *   `$refs.queryRef.resetFields()`；React 版查询值（handlerCode / handlerName / dateRange）由父级
 *   useUserPicker 持有并下传，重置即父级 setState 空值，子组件纯受控渲染，无命令式方法。
 * - `v-model:dateRange` -> 受控 value + onChange。
 * - `@keyup.enter` -> Fusion Input 的 `onKeyDown` 判断 Enter（无原生 keyup.enter 修饰符）。
 *
 * @author warm
 */
export interface UserPickerSearchProps {
  /** 查询参数（父级持有：handlerCode / handlerName） */
  queryParams?: Record<string, any>
  /** 创建时间区间 */
  dateRange?: any[]
  onQueryParamChange?: (key: string, value: any) => void
  onDateRangeChange?: (value: any[]) => void
  onQuery?: () => void
  onReset?: () => void
  onConfirm?: () => void
}

export default function UserPickerSearch(props: UserPickerSearchProps) {
  const {
    queryParams = {},
    dateRange = [],
    onQueryParamChange,
    onDateRangeChange,
    onQuery,
    onReset,
    onConfirm,
  } = props

  const { t } = useI18n()

  // 搜索区内部 UI 状态：移动端默认折叠
  const [searchCollapsed, setSearchCollapsed] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= 768
  )

  const handleEnter = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') onQuery?.()
  }

  return (
    <>
      {/* 工具栏：筛选折叠 + 确定（移动端） */}
      <div className="search-toggle-row mobile-only">
        <button
          type="button"
          className={`search-toggle-btn${searchCollapsed ? '' : ' is-expanded'}`}
          onClick={() => setSearchCollapsed((v) => !v)}
        >
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="search-icon">
            <path
              d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
              fill="currentColor"
            />
          </svg>
          <span>{searchCollapsed ? t('selectUser.filter') : t('selectUser.filterExpanded')}</span>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={`toggle-arrow-sm${searchCollapsed ? '' : ' is-rotated'}`}
          >
            <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" fill="currentColor" />
          </svg>
        </button>
        <button type="button" className="btn-confirm btn-confirm-inline mobile-only" onClick={onConfirm}>
          {t('common.confirm')}
        </button>
      </div>

      {!searchCollapsed ? (
        <div className="section-card search-card">
          <div className="search-card-body">
            <WfForm inline>
              <WfFormItem label={t('selectUser.permCode')}>
                <WfInput
                  value={queryParams.handlerCode ?? ''}
                  placeholder={t('selectUser.permCodePlaceholder')}
                  hasClear
                  style={{ width: 200 }}
                  onChange={(v: any) =>
                    onQueryParamChange?.('handlerCode', typeof v === 'string' ? v : v?.target?.value ?? '')
                  }
                  onKeyDown={handleEnter}
                />
              </WfFormItem>
              <WfFormItem label={t('between.handlerName')}>
                <WfInput
                  value={queryParams.handlerName ?? ''}
                  placeholder={t('selectUser.permNamePlaceholder')}
                  hasClear
                  style={{ width: 200 }}
                  onChange={(v: any) =>
                    onQueryParamChange?.('handlerName', typeof v === 'string' ? v : v?.target?.value ?? '')
                  }
                  onKeyDown={handleEnter}
                />
              </WfFormItem>
              <WfFormItem label={t('selectUser.createTime')}>
                <WfDatePicker
                  type="daterange"
                  value={dateRange}
                  onChange={(v: any) => onDateRangeChange?.(v ?? [])}
                />
              </WfFormItem>
            </WfForm>
            <div className="search-action-row">
              <div className="search-action-left">
                <button type="button" className="btn-action btn-primary" onClick={onQuery}>
                  {t('common.search')}
                </button>
                <button type="button" className="btn-action btn-default" onClick={onReset}>
                  {t('common.reset')}
                </button>
              </div>
              <button type="button" className="btn-confirm btn-confirm-search" onClick={onConfirm}>
                {t('common.confirm')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
