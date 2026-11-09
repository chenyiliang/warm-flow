import { useMemo, useState } from 'react'
import SvgIcon from '@/components/SvgIcon'
import {
  WfForm, WfFormItem, WfInput, WfSelect, WfOption, WfTable, WfTableColumn, WfButton,
} from '@/ui/components'
import { useI18n } from '@/i18n'

/**
 * 开始节点属性面板（React 版，移植自 common/vue/start.vue）。
 *
 * 两个页签：基础设置（节点编码 / 名称）+ 监听器（类型 + 路径的行表格）。
 *
 * 与 Vue 版的差异：
 * - `computed` tabsList -> `useMemo`（依赖 t，随语言切换重建）；
 * - `v-model="form.xxx"` -> 受控 value + onChange（回传父级）；
 * - 监听器行表格用 `WfTable` + `WfTableColumn`，`#default` 作用域插槽 -> Fusion 的 `cell` render-prop；
 * - Vue 版在 setup 顶层用 `form.value.listenerRows.push/splice` 直接改父对象；React 改为
 *   不可变更新 + `onChange` 回传（父级写回 lf.setProperties）。
 *
 * @author warm
 */
export interface StartProps {
  /** 节点表单数据（受控） */
  value?: Record<string, any>
  /** 只读 */
  disabled?: boolean
  /** 表单值变更 */
  onChange?: (value: Record<string, any>) => void
  /** 自定义扩展点（透出 form / disabled） */
  nodeFormExtra?: (ctx: { form: Record<string, any>; disabled: boolean }) => React.ReactNode
}

// Tab 图标（单路径 SVG，viewBox 0 0 24 24，跟随 tab 文字色 currentColor）
const TAB_ICONS = {
  base: 'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z',
  listener: 'M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z',
}

export default function Start(props: StartProps) {
  const { value = {}, disabled = false, onChange, nodeFormExtra } = props
  const { t } = useI18n()

  const [tabsValue, setTabsValue] = useState('1')

  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768

  const tabsList = useMemo(
    () => [
      { name: '1', label: t('start.tabBase'), iconPath: TAB_ICONS.base },
      { name: '2', label: t('start.tabListener'), iconPath: TAB_ICONS.listener },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t]
  )

  const setField = (key: string, v: any) => {
    onChange?.({ ...value, [key]: v })
  }

  // 监听器行：value.listenerRows（父级 propertySetting 已初始化，缺省给一行空）
  const listenerRows: any[] = Array.isArray(value.listenerRows) && value.listenerRows.length
    ? value.listenerRows
    : [{}]

  const updateListenerRow = (index: number, patch: Record<string, any>) => {
    const next = listenerRows.map((row, i) => (i === index ? { ...row, ...patch } : row))
    setField('listenerRows', next)
  }

  const handleAddRow = () => {
    setField('listenerRows', [...listenerRows, { listenerType: '', listenerPath: '' }])
  }

  const handleDeleteRow = (index: number) => {
    setField('listenerRows', listenerRows.filter((_, i) => i !== index))
  }

  return (
    <div className="start">
      {/* 现代化页签 */}
      <div className="modern-tabs-wrapper">
        <div className="modern-tabs">
          {tabsList.map((item) => (
            <div
              key={item.name}
              className={`modern-tab-item${tabsValue === item.name ? ' is-active' : ''}`}
              onClick={() => setTabsValue(item.name)}
            >
              <svg className="tab-icon" viewBox="0 0 24 24">
                <path d={item.iconPath} fill="currentColor" />
              </svg>
              <span className="tab-label">{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 基础设置 */}
      <div style={{ display: tabsValue === '1' ? 'block' : 'none' }} className="tabPane">
        <WfForm className="startForm" disabled={disabled}>
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
                  disabled={disabled}
                  onChange={(v: any) =>
                    setField('nodeName', typeof v === 'string' ? v : v?.target?.value ?? '')
                  }
                />
              </WfFormItem>
              {/* 自定义扩展点 */}
              {nodeFormExtra ? nodeFormExtra({ form: value, disabled }) : null}
            </div>
          </div>
        </WfForm>
      </div>

      {/* 监听器 */}
      <div style={{ display: tabsValue === '2' ? 'block' : 'none' }} className="tabPane tabPane-full">
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
                title={t('start.listenerPath')}
                dataIndex="listenerPath"
                cell={(path: string, index: number) => (
                  <WfInput
                    value={path ?? ''}
                    placeholder={t('common.pleaseInput')}
                    disabled={disabled}
                    onChange={(v: any) =>
                      updateListenerRow(index, {
                        listenerPath: typeof v === 'string' ? v : v?.target?.value ?? '',
                      })
                    }
                  />
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
    </div>
  )
}
