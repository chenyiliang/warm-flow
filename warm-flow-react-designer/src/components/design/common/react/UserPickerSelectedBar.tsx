import { WfTag, WfTooltip, WfButton } from '@/ui/components'
import { useI18n } from '@/i18n'
import type { SelectedHandlerItem } from '@/hooks/useUserPicker'

/**
 * 办理人选择器的「已选」提示条（React 版，移植自 common/vue/UserPickerSelectedBar.vue）。
 *
 * 内嵌在表格卡片底部：显示已选数量 + 前若干个标签（可单个删除），超过 8 个折叠为「+N 更多」
 * 并用 tooltip 展开全部；右侧「清空」按钮。
 *
 * 与 Vue 版的差异：
 * - `computed` visibleTags -> 直接 slice（每次渲染算，开销可忽略）；
 * - emit('close') / emit('clear') -> onClose / onClear 回调 props；
 * - el-tag 的 closable + @close -> 用 WfTag 的关闭能力（适配器映射到 Fusion Tag.Closeable）。
 *
 * @author warm
 */
export interface UserPickerSelectedBarProps {
  /** 已选办理人行 */
  selected?: SelectedHandlerItem[]
  /** 删除单个已选 */
  onClose?: (storageId: any) => void
  /** 清空全部已选 */
  onClear?: () => void
}

// 已选标签显示策略：超过 8 个时只显示前 8 个 + "+N 更多"
const VISIBLE_TAGS_COUNT = 8

export default function UserPickerSelectedBar(props: UserPickerSelectedBarProps) {
  const { selected = [], onClose, onClear } = props
  const { t } = useI18n()

  if (selected.length === 0) return null

  const visibleTags = selected.slice(0, VISIBLE_TAGS_COUNT)
  const overflow = selected.length > VISIBLE_TAGS_COUNT

  return (
    <div className="selected-inline-bar">
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="bar-icon">
        <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z" fill="currentColor" />
      </svg>
      <span>
        {t('selectUser.selectedPrefix')} <strong>{selected.length}</strong> {t('selectUser.selectedUnit')}
      </span>

      {!overflow ? (
        <div className="selected-mini-tags">
          {visibleTags.map((tag) => (
            <WfTag
              key={tag.storageId}
              closable
              size="small"
              className="mini-tag"
              onClose={() => onClose?.(tag.storageId)}
            >
              {tag.handlerName || tag.storageId}
            </WfTag>
          ))}
        </div>
      ) : (
        <div className="selected-mini-tags selected-overflow">
          {visibleTags.map((tag) => (
            <WfTag
              key={tag.storageId}
              closable
              size="small"
              className="mini-tag"
              onClose={() => onClose?.(tag.storageId)}
            >
              {tag.handlerName || tag.storageId}
            </WfTag>
          ))}
          <WfTooltip
            placement="top"
            title={
              <div className="tooltip-tag-list">
                {selected.map((tag) => (
                  <div className="tooltip-item" key={tag.storageId}>
                    {tag.handlerName || tag.storageId}
                  </div>
                ))}
              </div>
            }
          >
            <WfTag className="mini-tag more-tag" size="small">
              +{selected.length - VISIBLE_TAGS_COUNT} {t('selectUser.more')}
            </WfTag>
          </WfTooltip>
        </div>
      )}

      <WfButton text warning size="small" className="clear-all-btn" onClick={onClear}>
        {t('selectUser.clear')}
      </WfButton>
    </div>
  )
}
