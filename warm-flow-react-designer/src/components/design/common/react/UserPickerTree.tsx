import { WfInput, WfTree } from '@/ui/components'
import { useI18n } from '@/i18n'

/**
 * 办理人选择器的组织树区（React 版，移植自 common/vue/UserPickerTree.vue）。
 *
 * 可折叠卡片：头部点击展开/收起，内含部门搜索框 + 组织树。
 *
 * 与 Vue 版的差异：
 * - **不再需要 ref 转发 filter / setCurrentKey**：Vue 版把搜索关键字存在子组件、父级要经
 *   `$refs.groupTreeRef.filter(val)` 命令式调 el-tree；React 版 groupName 由父级（useUserPicker）
 *   持有并以 props 下传，树筛选是**纯派生渲染**（按 groupName 过滤后传 dataSource），
 *   因此无命令式方法、无需 ref。setCurrentKey 同理——选中态由父级 queryParams.groupId 决定。
 * - `v-model:groupName` / `v-model:treeCollapsed` -> 受控 value + onChange 回调。
 * - `<transition name="tree-slide">` -> CSS 过渡由 .tree-content 的显隐样式承担（React 无 transition 组件）。
 *
 * @author warm
 */
export interface UserPickerTreeProps {
  /** 组织树数据（treeSelections） */
  groupOptions?: any
  /** 部门搜索关键字（父级持有） */
  groupName?: string
  /** 折叠状态 */
  treeCollapsed?: boolean
  /** 当前选中的部门 id（用于高亮，替代 Vue 的 setCurrentKey） */
  selectedId?: any
  onGroupNameChange?: (value: string) => void
  onTreeCollapsedChange?: (value: boolean) => void
  onNodeClick?: (data: any) => void
}

/** 按关键字递归过滤树（等价 Vue 版 el-tree 的 filterNodeMethod） */
function filterTree(list: any[], keyword: string): any[] {
  if (!Array.isArray(list)) return []
  if (!keyword) return list
  const out: any[] = []
  list.forEach((item) => {
    const children = item.children ? filterTree(item.children, keyword) : []
    const selfHit = String(item.name ?? '').indexOf(keyword) !== -1
    if (selfHit || children.length > 0) {
      out.push({ ...item, children: children.length ? children : item.children })
    }
  })
  return out
}

export default function UserPickerTree(props: UserPickerTreeProps) {
  const {
    groupOptions,
    groupName = '',
    treeCollapsed = false,
    selectedId,
    onGroupNameChange,
    onTreeCollapsedChange,
    onNodeClick,
  } = props

  const { t } = useI18n()

  const toggleCollapsed = () => onTreeCollapsedChange?.(!treeCollapsed)

  // 搜索关键字变化即重新过滤（纯派生，无需命令式 filter）
  const visibleTree = filterTree(groupOptions, groupName)

  return (
    <div className={`section-card tree-card${treeCollapsed ? ' tree-collapsed' : ''}`}>
      <div className="tree-header tree-header-clickable" onClick={toggleCollapsed}>
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="tree-icon">
          <path
            d="M15 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L15 2ZM18 20H6V4H14V9H18V20ZM8.5 12H10V17H8.5V12ZM11 12H12.5V17H11V12ZM13.5 12H15V17H13.5V12Z"
            fill="currentColor"
          />
        </svg>
        <span>{t('selectUser.orgTree')}</span>
        <span className="tree-collapse-toggle">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={`toggle-arrow${treeCollapsed ? '' : ' is-expanded'}`}
          >
            <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" fill="currentColor" />
          </svg>
        </span>
      </div>

      {!treeCollapsed ? (
        <div className="tree-content">
          <div className="tree-search">
            <WfInput
              value={groupName}
              placeholder={t('selectUser.searchDept')}
              hasClear
              onChange={(v: any) =>
                onGroupNameChange?.(typeof v === 'string' ? v : v?.target?.value ?? '')
              }
            />
          </div>
          <div className="tree-body">
            <WfTree
              dataSource={visibleTree}
              fieldNames={{ value: 'id', label: 'name', children: 'children' }}
              selectedKeys={selectedId != null ? [selectedId] : []}
              onNodeClick={onNodeClick}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}
