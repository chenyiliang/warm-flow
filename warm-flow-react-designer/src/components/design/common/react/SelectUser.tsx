import UserPickerTree from './UserPickerTree'
import UserPickerSearch from './UserPickerSearch'
import UserPickerSelectedBar from './UserPickerSelectedBar'
import {
  WfRow, WfCol, WfTable, WfTableColumn, WfCheckbox, WfPagination,
} from '@/ui/components'
import { parseTime } from '@/utils/ruoyi'
import { useUserPicker } from '@/hooks/useUserPicker'
import { useI18n } from '@/i18n'
import type { SelectedHandlerItem } from '@/hooks/useUserPicker'

/**
 * 办理人选择器（React 版，移植自 common/vue/selectUser.vue）。
 *
 * 三栏结构：分组 tab（角色 / 部门 / 用户）+ 左侧组织树 + 右侧查询区 / 已选条 / 人员表格（PC）
 * 或卡片列表（移动端，滚动加载更多）。逻辑层统一收口到 `useUserPicker`，本组件只保留 JSX 与编排。
 *
 * 与 Vue 版的差异：
 * - 逻辑层 `useUserPicker(props, emit)` -> `useUserPicker(options)`：React 无 emit，改回传
 *   `onUserSelect` 回调；提交后关闭弹窗由**父级**（Between / NodeExtList）负责（React 无 v-model:userVisible）。
 * - `v-loading` 指令 -> Fusion Table 原生 `loading` prop；移动端卡片列表用简单文字提示替代遮罩。
 * - `#empty` / `#header` 具名插槽 -> Fusion Table 的 `emptyContent` prop 与 `title` 传 ReactNode。
 * - `@row-click="handleCheck"` -> `onRowClick`（整行点击驱动勾选，checkbox 仅展示态，与 Vue 版一致）。
 *
 * 注意：本组件**不含弹窗外壳**，由父级用 `WfDialog` 包裹（与 Vue 版契约一致）。
 *
 * @author warm
 */
export interface SelectUserProps {
  /** 已选用户存储主键集合（等价 Vue 的 v-model:selectUser） */
  selectUser?: any[]
  /** 已选办理人行（回显名称用） */
  permissionRows?: SelectedHandlerItem[]
  /** 点击「确定」提交选择 */
  onUserSelect?: (checkedItemList: SelectedHandlerItem[]) => void
}

export default function SelectUser(props: SelectUserProps) {
  const { selectUser = [], permissionRows = [], onUserSelect } = props
  const { t } = useI18n()

  const {
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
  } = useUserPicker({ selectUser, permissionRows, onUserSelect })

  // 移动端判定（卡片列表 vs 表格）
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768
  // 树折叠状态：移动端默认折叠（对齐 Vue 版 treeCollapsed 初值）
  const treeCollapsed = isMobile

  const hasTree = !!groupOptions

  return (
    <div className="user-select-wrapper">
      {/* 分组页签（无分组数据时隐藏，避免空白条） */}
      {tabsList.length > 0 ? (
        <div className="modern-tabs-wrapper">
          <div className="modern-tabs">
            {tabsList.map((item) => (
              <div
                key={item}
                className={`modern-tab-item${tabsValue === item ? ' is-active' : ''}`}
                onClick={() => tabChange(item)}
              >
                <span className="tab-label">{item}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* 主内容区 */}
      <WfRow gutter={16} className="content">
        {/* 左侧树状选择 */}
        {hasTree ? (
          <WfCol span={5} xxs={24}>
            <UserPickerTree
              groupOptions={groupOptions}
              groupName={groupName}
              treeCollapsed={treeCollapsed}
              selectedId={queryParams.groupId}
              onGroupNameChange={setGroupName}
              onTreeCollapsedChange={() => {
                // 折叠态由移动端视口派生，PC 端点击头部仅做视觉收起，不影响数据
              }}
              onNodeClick={handleNodeClick}
            />
          </WfCol>
        ) : null}

        {/* 右侧列表数据 */}
        <WfCol span={hasTree ? 19 : 24} xxs={24}>
          {/* 查询区 */}
          <UserPickerSearch
            queryParams={queryParams}
            dateRange={dateRange}
            onQueryParamChange={setQueryParam}
            onDateRangeChange={setDateRange}
            onQuery={handleQuery}
            onReset={resetQuery}
            onConfirm={submitForm}
          />

          {/* 已选提示条 */}
          <UserPickerSelectedBar
            selected={checkedItemList}
            onClose={handleClose}
            onClear={clearAllSelected}
          />

          {/* 移动端：卡片式列表（滚动加载更多） */}
          {isMobile ? (
            <div className="mobile-card-list mobile-only" onScroll={onMobileScroll}>
              {loading ? <div className="mobile-empty">{t('common.loading')}</div> : null}
              {!loading
                ? tableList.map((item) => (
                    <div
                      key={item.storageId}
                      className={`mobile-card-item${item.isChecked ? ' is-checked' : ''}`}
                      onClick={() => handleCheck(item)}
                    >
                      <div className="card-left">
                        <WfCheckbox
                          checked={!!item.isChecked}
                          onChange={() => handleCheck(item)}
                        />
                        <div className="card-info">
                          <div className="card-name-row">
                            <span className="card-name">{item.handlerName || '-'}</span>
                            {item.createTime ? (
                              <span className="card-time">{item.createTime}</span>
                            ) : null}
                          </div>
                          <div className="card-sub">
                            <span className="card-code">{item.handlerCode || '-'}</span>
                            {item.groupName ? (
                              <span className="card-group">{item.groupName}</span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      {item.isChecked ? (
                        <div className="card-check-icon">
                          <svg viewBox="0 0 24 24" fill="none">
                            <path
                              d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"
                              fill="#67c23a"
                            />
                          </svg>
                        </div>
                      ) : null}
                    </div>
                  ))
                : null}
              {/* 加载更多 / 没有更多提示 */}
              <div className="mobile-load-more">
                {tableList.length > 0 ? (
                  mobileLoadingMore ? (
                    <span className="load-text">{t('selectUser.loadingMore')}</span>
                  ) : mobileNoMore || tableList.length >= total ? (
                    <span className="load-text load-end">{t('selectUser.loadedAll')}</span>
                  ) : null
                ) : null}
              </div>
              {!loading && tableList.length === 0 ? (
                <div className="mobile-empty">{t('common.empty')}</div>
              ) : null}
            </div>
          ) : null}

          {/* PC 端：数据表格卡片 */}
          {!isMobile ? (
            <div className="section-card table-card pc-only">
              {/*
                用外层 CSS 滚动容器限制高度，**不用 Fusion 的 fixedHeader/maxBodyHeight**。
                原因：fixedHeader 走 Fusion 的 legacy getChildContext/contextTypes（getNode），
                React 19 已移除这些 API，未 shim 的宿主会抛 `this.context.getNode is not a function`。
                CSS overflow 滚动跨 React 版本安全，且宿主无需为本库额外加 legacy-context shim。
                代价：表头不吸顶（随内容滚动）。Vue 版靠 el-table 的 max-height 吸顶，
                若 chipflow 已内置 legacy-context-shim-plugin（它确实内置了），可在宿主侧改回 fixedHeader。
              */}
              <div className="user-table-scroll" style={{ maxHeight: 570, overflowY: 'auto' }}>
              <WfTable
                dataSource={tableList}
                loading={loading}
                onRowClick={(record: any) => handleCheck(record)}
                emptyContent={
                  <div className="user-empty">
                    <svg viewBox="0 0 24 24" className="user-empty-icon">
                      <path
                        d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
                        fill="currentColor"
                      />
                    </svg>
                    <span>{t('selectUser.emptyUsers')}</span>
                  </div>
                }
              >
                {/* 勾选列：表头全选（含半选态），单元格仅展示勾选态（选择由整行点击驱动） */}
                <WfTableColumn
                  width={50}
                  align="center"
                  title={
                    <WfCheckbox
                      checked={checkAllInfo.isChecked}
                      indeterminate={checkAllInfo.isIndeterminate}
                      onChange={(checked: boolean) => handleCheckAll(!!checked)}
                    />
                  }
                  cell={(_v: any, _i: number, record: any) => (
                    <WfCheckbox checked={!!record?.isChecked} />
                  )}
                />
                <WfTableColumn
                  title={t('between.handlerName')}
                  dataIndex="handlerName"
                  align="center"
                />
                <WfTableColumn
                  title={t('selectUser.permCode')}
                  dataIndex="handlerCode"
                  align="center"
                />
                <WfTableColumn
                  title={t('between.handlerStorageId')}
                  dataIndex="storageId"
                  align="center"
                  className="mobile-hide-col"
                />
                <WfTableColumn
                  title={t('selectUser.permGroup')}
                  dataIndex="groupName"
                  align="center"
                  className="mobile-hide-col"
                />
                <WfTableColumn
                  title={t('selectUser.createTime')}
                  dataIndex="createTime"
                  align="center"
                  width={160}
                  className="mobile-hide-col"
                  cell={(v: any) => <span>{parseTime(v)}</span>}
                />
              </WfTable>
              </div>

              {/* 底部操作栏：分页 */}
              <div className="table-footer">
                {total > 0 ? (
                  <WfPagination
                    current={queryParams.pageNum}
                    pageSize={queryParams.pageSize}
                    total={total}
                    size="small"
                    pageSizeSelector="dropdown"
                    onPageSizeChange={(size: number) => {
                      setQueryParam('pageSize', size)
                      setTimeout(() => getList(), 0)
                    }}
                    onChange={(current: number) => {
                      setQueryParam('pageNum', current)
                      setTimeout(() => getList(), 0)
                    }}
                  />
                ) : null}
              </div>
            </div>
          ) : null}
        </WfCol>
      </WfRow>
    </div>
  )
}
