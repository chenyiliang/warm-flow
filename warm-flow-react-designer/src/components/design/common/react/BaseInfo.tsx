import {
  forwardRef, useEffect, useImperativeHandle, useRef, useState, useCallback,
} from 'react'
import SvgIcon from '@/components/SvgIcon'
import {
  WfForm, WfFormItem, WfInput, WfRadioGroup, WfRadio, WfSwitch, WfTreeSelect,
  WfButton, WfTable, WfTableColumn, WfSelect, WfOption,
} from '@/ui/components'
import { listenerList } from '@/api/flow/definition'
import { useI18n } from '@/i18n'

/**
 * 基础信息表单（React 版，移植自 common/vue/baseInfo.vue）。
 *
 * 承载流程定义的基础字段：流程名 / 流程编码 / 设计器模型（经典 CLASSICS / 仿钉钉 MIMIC）/
 * 流程分类 / 自定义表单开关 / 表单路径 / 监听器行。
 *
 * 通过 ref 暴露与 Vue 版一致的契约（`defineExpose({ getFormData, validate })`）：
 * - `validate(): Promise<boolean>` —— 必填校验，失败时透出 invalid fields 给上层 validate-error；
 * - `getFormData()` —— 收集表单（把 listenerRows 折叠回 listenerType / listenerPath 字符串）。
 *
 * 与 Vue 版的实现差异：
 * - **校验不依赖 UI 库的 form.validate**：EP 的 `formRef.validate(cb)` 签名随适配器而异
 *   （antd 仅回传布尔），React 版改为**自带必填校验**，直接按 rules 检查 form state，
 *   跨 UI 库行为一致，不再依赖适配器暴露 validate。
 * - `v-model` -> 受控 `value` + `onChange`；`watch(props.logicJson)` -> `useEffect([logicJson])`。
 *
 * @author warm
 */
export interface BaseInfoProps {
  /** 当前流程 JSON（含 flowName / modelValue / category 等初值） */
  logicJson?: Record<string, any>
  /** 流程分类树数据 */
  categoryList?: any[]
  /** 表单路径下拉数据 */
  formPathList?: any[]
  /** 流程定义 id（有值=编辑既有定义，禁止切换模型） */
  definitionId?: string | number | null
  /** 只读 */
  disabled?: boolean
  /** 流程名变更回调（等价 Vue emit('update:flow-name')） */
  onFlowNameUpdate?: (flowName: string) => void
  /** 设计器模型变更回调（等价 Vue emit('update:model-value')） */
  onModelValueUpdate?: () => void
  /** 校验失败回调，透出 invalid fields（等价 Vue emit('validate-error')） */
  onValidateError?: (fields?: Record<string, any>) => void
}

/** BaseInfo 通过 ref 暴露的命令式契约（对齐 Vue defineExpose） */
export interface BaseInfoHandle {
  /** 必填校验：通过 resolve(true)，失败透出 fields 并 resolve(false) */
  validate: () => Promise<boolean>
  /** 收集表单数据（含把 listenerRows 折叠回 listenerType / listenerPath） */
  getFormData: () => Record<string, any>
}

interface ListenerRow {
  listenerType: string
  listenerPath: string
}

interface BaseInfoForm {
  id: any
  flowCode: string
  flowName: string
  modelValue: string
  category: string
  formCustom: string
  formPath: string
  listenerType: string
  listenerPath: string
  listenerRows: ListenerRow[]
}

const EMPTY_FORM: BaseInfoForm = {
  id: null,
  flowCode: '',
  flowName: '',
  modelValue: '',
  category: '',
  formCustom: 'N',
  formPath: '',
  listenerType: '',
  listenerPath: '',
  listenerRows: [],
}

/** 把 listenerType（逗号分隔）/ listenerPath（@@ 分隔）拆成行数组 */
function parseListenerRows(listenerType?: string, listenerPath?: string): ListenerRow[] {
  if (!listenerType) return []
  const types = listenerType.split(',')
  const paths = (listenerPath ?? '').split('@@')
  return types.map((type, index) => ({ listenerType: type, listenerPath: paths[index] ?? '' }))
}

const BaseInfo = forwardRef<BaseInfoHandle, BaseInfoProps>((props, ref) => {
  const {
    logicJson = {},
    categoryList = [],
    formPathList = [],
    definitionId = null,
    disabled = false,
    onFlowNameUpdate,
    onModelValueUpdate,
    onValidateError,
  } = props

  const { t } = useI18n()

  const [form, setForm] = useState<BaseInfoForm>({ ...EMPTY_FORM })
  // 监听器可选项（listenerList 接口返回）
  const [listenerVo, setListenerVo] = useState<any[]>([])

  // 回调存盒子，避免 useEffect / 校验闭包捕获旧回调
  const cbRef = useRef({ onFlowNameUpdate, onModelValueUpdate, onValidateError })
  cbRef.current = { onFlowNameUpdate, onModelValueUpdate, onValidateError }

  // logicJson 变化时同步到表单（对齐 Vue watch(props.logicJson, ...)）
  useEffect(() => {
    if (logicJson && Object.keys(logicJson).length > 0) {
      setForm((prev) => {
        const next: BaseInfoForm = { ...prev, ...logicJson } as BaseInfoForm
        // 自定义表单为「是/否」开关：新建流程 definition.formCustom 可能为 null，
        // 会覆盖默认值导致开关失去取值并触发 required 校验，此处兜底回「否」
        if (!next.formCustom) next.formCustom = 'N'
        next.listenerRows = parseListenerRows(next.listenerType, next.listenerPath)
        return next
      })
    }
    // 仅在 logicJson 引用变化时同步（由 FlowDesigner 在数据装配后传入）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logicJson])

  // 拉取监听器列表
  useEffect(() => {
    listenerList()
      .then((response: any) => {
        if (response.code === 200 && response.data) {
          setListenerVo(response.data)
        }
      })
      .catch(() => {})
  }, [])

  /** 单字段更新 */
  const setField = useCallback(<K extends keyof BaseInfoForm>(key: K, value: BaseInfoForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }, [])

  /** 流程名变更：同步到表单并通知父组件 */
  const handleFlowNameChange = useCallback((value: string) => {
    // Fusion Input 的 onChange 回传字符串；EP 回传事件对象，此处兼容两者
    const name = typeof value === 'string' ? value : (value as any)?.target?.value ?? ''
    setField('flowName', name)
    cbRef.current.onFlowNameUpdate?.(name)
  }, [setField])

  /** 设计器模型变更：切换后由父组件重建画布 */
  const handleModelChange = useCallback((value: string) => {
    setForm((prev) => ({ ...prev, modelValue: value }))
    cbRef.current.onModelValueUpdate?.()
  }, [])

  /** 监听器路径变化：级联更新类型（在 listenerVo 中匹配 path -> type） */
  const handleListenerPathChange = useCallback((path: string, index: number) => {
    setForm((prev) => {
      const rows = [...prev.listenerRows]
      const row = { ...rows[index] }
      row.listenerPath = path
      if (!path) {
        // 清空时，也清空类型
        row.listenerType = ''
      } else {
        const matched = listenerVo.find((item) => item.path === path)
        row.listenerType = matched?.type ?? ''
      }
      rows[index] = row
      return { ...prev, listenerRows: rows }
    })
  }, [listenerVo])

  const handleListenerTypeChange = useCallback((type: string, index: number) => {
    setForm((prev) => {
      const rows = [...prev.listenerRows]
      rows[index] = { ...rows[index], listenerType: type }
      return { ...prev, listenerRows: rows }
    })
  }, [])

  const handleAddRow = useCallback(() => {
    setForm((prev) => ({
      ...prev,
      listenerRows: [...prev.listenerRows, { listenerType: '', listenerPath: '' }],
    }))
  }, [])

  const handleDeleteRow = useCallback((index: number) => {
    setForm((prev) => ({
      ...prev,
      listenerRows: prev.listenerRows.filter((_, i) => i !== index),
    }))
  }, [])

  /**
   * 必填校验（自带实现，不依赖 UI 库 form.validate）。
   * 规则对齐 Vue 版 rules：modelValue / flowCode / flowName 必填。
   */
  const validate = useCallback(async (): Promise<boolean> => {
    const errors: Record<string, string> = {}
    if (!form.modelValue) errors.modelValue = t('baseInfo.ruleModelRequired')
    if (!form.flowCode) errors.flowCode = t('baseInfo.ruleFlowCodeRequired')
    if (!form.flowName) errors.flowName = t('baseInfo.ruleFlowNameRequired')

    const valid = Object.keys(errors).length === 0
    if (!valid) {
      // 透出校验失败字段，供上层 FlowDesigner 转发 validate-error 事件
      cbRef.current.onValidateError?.(errors)
    }
    return valid
  }, [form, t])

  /** 收集表单数据（把 listenerRows 折叠回 listenerType / listenerPath 字符串） */
  const getFormData = useCallback((): Record<string, any> => {
    const listenerType = form.listenerRows.map((row) => row.listenerType).join(',')
    const listenerPath = form.listenerRows.map((row) => row.listenerPath).join('@@')
    return { ...form, listenerType, listenerPath }
  }, [form])

  // 暴露契约（等价 Vue defineExpose({ getFormData, validate })）
  useImperativeHandle(ref, () => ({ validate, getFormData }), [validate, getFormData])

  // 编辑既有定义时禁止切换模型（与 Vue 版 :disabled="!!definitionId" 一致）
  const modelDisabled = !!definitionId || disabled

  return (
    <div className="wf-base-info">
      <WfForm disabled={disabled}>
        <WfFormItem label={t('baseInfo.flowName')} required>
          <WfInput
            value={form.flowName}
            placeholder={t('baseInfo.flowNamePlaceholder')}
            maxLength={100}
            onChange={handleFlowNameChange}
          />
        </WfFormItem>

        <WfFormItem label={t('baseInfo.flowCode')} required>
          <WfInput
            value={form.flowCode}
            placeholder={t('baseInfo.flowCodePlaceholder')}
            maxLength={100}
            disabled={!!definitionId || disabled}
            onChange={(v: any) =>
              setField('flowCode', typeof v === 'string' ? v : v?.target?.value ?? '')
            }
          />
        </WfFormItem>

        <WfFormItem label={t('baseInfo.model')} required>
          <WfRadioGroup
            value={form.modelValue}
            disabled={modelDisabled}
            onChange={handleModelChange}
            className="radio-card-group"
          >
            <WfRadio value="CLASSICS">
              <span className="radio-card-content">
                <SvgIcon iconClass="classic" className="model-icon" />
                <span className="radio-card-info">
                  <span className="radio-card-title">{t('baseInfo.modelClassic')}</span>
                  <span className="radio-card-desc">{t('baseInfo.modelClassicDesc')}</span>
                </span>
              </span>
            </WfRadio>
            <WfRadio value="MIMIC">
              <span className="radio-card-content">
                <SvgIcon iconClass="mimic" className="model-icon" />
                <span className="radio-card-info">
                  <span className="radio-card-title">{t('baseInfo.modelMimic')}</span>
                  <span className="radio-card-desc">{t('baseInfo.modelMimicDesc')}</span>
                </span>
              </span>
            </WfRadio>
          </WfRadioGroup>
          <div className="radio-card-warning">{t('baseInfo.modelSwitchWarning')}</div>
        </WfFormItem>

        <WfFormItem label={t('baseInfo.category')}>
          <WfTreeSelect
            value={form.category}
            dataSource={categoryList}
            placeholder={t('baseInfo.categoryPlaceholder')}
            disabled={disabled}
            onChange={(v: any) => setField('category', v ?? '')}
          />
        </WfFormItem>

        <WfFormItem label={t('baseInfo.formCustom')}>
          <WfSwitch
            checked={form.formCustom === 'Y'}
            disabled={disabled}
            checkedChildren={t('common.yes')}
            unCheckedChildren={t('common.no')}
            onChange={(checked: boolean) => setField('formCustom', checked ? 'Y' : 'N')}
          />
          <span className="form-tip">
            {form.formCustom === 'Y' ? t('baseInfo.formCustomTipY') : t('baseInfo.formCustomTipN')}
          </span>
        </WfFormItem>

        {form.formCustom === 'N' ? (
          <WfFormItem label={t('baseInfo.formPath')}>
            <WfTreeSelect
              value={form.formPath}
              dataSource={formPathList}
              placeholder={t('baseInfo.formPathPlaceholder')}
              disabled={disabled}
              onChange={(v: any) => setField('formPath', v ?? '')}
            />
          </WfFormItem>
        ) : (
          <WfFormItem label={t('baseInfo.formKey')}>
            <WfTreeSelect
              value={form.formPath}
              dataSource={formPathList}
              placeholder={t('baseInfo.categoryPlaceholder')}
              disabled={disabled}
              onChange={(v: any) => setField('formPath', v ?? '')}
            />
          </WfFormItem>
        )}

        {/* 监听器配置（分区标题用 sectionListener，与 Vue 版一致） */}
        <div className="form-section">
          <div className="section-title">{t('baseInfo.sectionListener')}</div>
          <WfFormItem className="listenerItem">
            <WfTable dataSource={form.listenerRows} emptyContent={t('baseInfo.listenerEmpty')}>
              {/* 类型：固定四选项（开始 / 分派 / 完成 / 创建），非自由输入 */}
              <WfTableColumn
                title={t('common.type')}
                dataIndex="listenerType"
                width={160}
                cell={(type: string, index: number) => (
                  <WfSelect
                    value={type}
                    placeholder={t('baseInfo.listenerTypePlaceholder')}
                    disabled={disabled}
                    onChange={(v: any) => handleListenerTypeChange(v ?? '', index)}
                  >
                    <WfOption value="start">{t('start.listenerStart')}</WfOption>
                    <WfOption value="assignment">{t('start.listenerAssignment')}</WfOption>
                    <WfOption value="finish">{t('start.listenerFinish')}</WfOption>
                    <WfOption value="create">{t('start.listenerCreate')}</WfOption>
                  </WfSelect>
                )}
              />
              {/* 路径：可输入类路径，选项来自 listenerList 接口（label=description, value=path） */}
              <WfTableColumn
                title={t('baseInfo.listenerPathLabel')}
                dataIndex="listenerPath"
                cell={(path: string, index: number) => (
                  <WfSelect
                    value={path}
                    placeholder={t('baseInfo.listenerPathPlaceholder')}
                    disabled={disabled}
                    showSearch
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
            {!disabled ? (
              <WfButton className="add-row-btn" onClick={handleAddRow}>
                {t('common.addRow')}
              </WfButton>
            ) : null}
          </WfFormItem>
        </div>
      </WfForm>
    </div>
  )
})

BaseInfo.displayName = 'BaseInfo'

export default BaseInfo
