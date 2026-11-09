import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import SvgIcon from '@/components/SvgIcon'
import {
  WfForm, WfFormItem, WfInput, WfSelect, WfOption, WfRadioGroup, WfRadio,
  WfCheckboxGroup, WfCheckbox, WfRow, WfCol, WfInputNumber, WfTimePicker,
  WfDatePicker, WfTag, WfButton, WfDialog, WfTooltip, WfIcon,
} from '@/ui/components'
import SelectUser from './SelectUser'
import { handlerFeedback } from '@/api/flow/definition'
import { useI18n } from '@/i18n'
import type { SelectedHandlerItem } from '@/hooks/useUserPicker'

/**
 * 节点扩展属性动态表单（React 版，移植自 common/vue/nodeExtList.vue）。
 *
 * 按后端 nodeExt 定义（formList）动态渲染表单项，支持 7 种类型：
 * 1 单行输入 / 2 多行文本 / 3 下拉 / 4 单选或多选 / 5 办理人选择（弹窗）/ 6 数字 / 7 日期时间。
 *
 * 通过 ref 暴露 `validate()`（必填校验），供 PropertySetting 关闭抽屉前调用。
 *
 * 与 Vue 版的差异：
 * - `defineExpose({ validate })` -> `forwardRef` + `useImperativeHandle`；
 * - **不依赖 UI 库的 form.validate**：Vue 版调 `nodeExtRef.validate(cb)`（EP/antd 签名不一），
 *   React 版自带必填校验（按 item.must + 当前值判断），跨 UI 库一致；
 * - `v-model` -> 受控 value/onChange；`props.modelValue`（form.ext）变更用 `onChange` 回传父级；
 * - `initFormData` / `getHandlerFeedback` 在 `useEffect` 里跑（Vue 版在 setup 顶层同步调）。
 *
 * @author warm
 */
export interface NodeExtListProps {
  /** 扩展属性表单数据（form.ext，受控；变更经 onChange 回传） */
  value?: Record<string, any>
  /** 表单项列表（节点扩展属性定义） */
  formList?: any[]
  /** 只读 */
  disabled?: boolean
  /** 表单值变更（等价 Vue v-model 的 update） */
  onChange?: (value: Record<string, any>) => void
}

/** NodeExtList 通过 ref 暴露的契约 */
export interface NodeExtListHandle {
  validate: () => Promise<boolean>
}

const NodeExtList = forwardRef<NodeExtListHandle, NodeExtListProps>((props, ref) => {
  const { value = {}, formList = [], disabled = false, onChange } = props
  const { t } = useI18n()

  // 内部 form 镜像：既受控（跟随 value）又可即时更新
  const [form, setForm] = useState<Record<string, any>>({ ...value })
  // 办理人弹窗
  const [userVisible, setUserVisible] = useState(false)
  // 各 code 的办理人表格行（回显名称）
  const [permissionRows, setPermissionRows] = useState<Record<string, SelectedHandlerItem[]>>({})
  const [itemCode, setItemCode] = useState('')

  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  /** 更新单字段并回传父级 */
  const setField = useCallback((code: string, v: any) => {
    setForm((prev) => {
      const next = { ...prev, [code]: v }
      onChangeRef.current?.(next)
      return next
    })
  }, [])

  // 外部 value 变化时同步内部 form（如切换节点）
  const valueKey = JSON.stringify(value)
  useEffect(() => {
    setForm({ ...value })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueKey])

  // 初始化：数字类型字段转 number；type=5 办理人回显名称
  useEffect(() => {
    setForm((prev) => {
      const next = { ...prev }
      formList.forEach((item) => {
        const v = next[item.code]
        if (v !== undefined && v !== null && v !== '' && v !== 'null' && v !== 'undefined') {
          if (item.type === 6) {
            const numValue = Number(v)
            if (!isNaN(numValue)) next[item.code] = numValue
          }
        }
      })
      return next
    })

    // 办理人名称回显：type=5 且有值时，请求 handlerFeedback 拿名称
    const formMap = new Map<string, any>()
    formList.forEach((item) => formMap.set(item.code, item))
    const rowsUpdate: Record<string, SelectedHandlerItem[]> = {}
    Object.keys(value).forEach((key) => {
      const def = formMap.get(key)
      const v = value[key]
      if (v && Array.isArray(v) && v.length > 0 && def && def.type === 5) {
        handlerFeedback({ storageIds: v })
          .then((response: any) => {
            if (response.code === 200 && response.data) {
              setPermissionRows((prev) => ({ ...prev, [key]: response.data }))
            }
          })
          .catch(() => {})
        // 先用主键占位，回显名称到达后覆盖
        rowsUpdate[key] = v.map((id: any) => ({ storageId: id }))
      }
    })
    if (Object.keys(rowsUpdate).length) {
      setPermissionRows((prev) => ({ ...prev, ...rowsUpdate }))
    }
    // 仅当 formList / value 结构变化时重算
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(formList), valueKey])

  /** 打开办理人选择弹窗 */
  const openSelectDialog = useCallback((code: string) => {
    setItemCode(code)
    setUserVisible(true)
  }, [])

  /** 弹窗提交：写回主键数组 + 更新回显行 */
  const handleUserSelect = useCallback((checkedItemList: SelectedHandlerItem[]) => {
    const ids = checkedItemList.map((e) => e.storageId).filter((n) => n)
    setField(itemCode, ids)
    setPermissionRows((prev) => ({ ...prev, [itemCode]: checkedItemList }))
    setUserVisible(false)
  }, [itemCode, setField])

  /** 删除单个已选办理人 */
  const delPermission = useCallback((code: string, row: SelectedHandlerItem) => {
    setPermissionRows((prev) => {
      const list = (prev[code] ?? []).filter((e) => e.storageId !== row.storageId)
      const ids = list.map((e) => e.storageId).filter((n) => n)
      setField(code, ids)
      return { ...prev, [code]: list }
    })
  }, [setField])

  /** 必填校验（自带实现，不依赖 UI 库 form.validate） */
  const validate = useCallback(async (): Promise<boolean> => {
    for (const item of formList) {
      if (!item.must) continue
      const v = form[item.code]
      const empty =
        v === undefined ||
        v === null ||
        v === '' ||
        (Array.isArray(v) && v.length === 0)
      if (empty) return false
    }
    return true
  }, [formList, form])

  useImperativeHandle(ref, () => ({ validate }), [validate])

  /** 渲染单个表单项的控件（按 type 分支） */
  const renderControl = (item: any) => {
    const code = item.code
    const v = form[code]
    switch (item.type) {
      case 1:
        return (
          <WfInput
            value={v ?? ''}
            placeholder={item.desc}
            disabled={disabled}
            onChange={(val: any) => setField(code, typeof val === 'string' ? val : val?.target?.value ?? '')}
          />
        )
      case 2:
        return (
          <WfInput
            value={v ?? ''}
            rows={2}
            multiple
            placeholder={item.desc}
            disabled={disabled}
            onChange={(val: any) => setField(code, typeof val === 'string' ? val : val?.target?.value ?? '')}
          />
        )
      case 3:
        return (
          <WfSelect
            value={v}
            mode={item.multiple ? 'multiple' : undefined}
            hasClear
            placeholder={item.desc}
            disabled={disabled}
            style={{ width: 400 }}
            onChange={(val: any) => setField(code, val)}
          >
            {(item.dict ?? []).map((dItem: any) => (
              <WfOption key={dItem.value} value={dItem.value}>
                {dItem.label}
              </WfOption>
            ))}
          </WfSelect>
        )
      case 4: {
        const span = (item.dict ?? []).length < 3 ? undefined : 8
        return item.multiple ? (
          <WfCheckboxGroup
            value={Array.isArray(v) ? v : []}
            disabled={disabled}
            onChange={(val: any) => setField(code, val)}
          >
            <WfRow gutter={20}>
              {(item.dict ?? []).map((dItem: any, dIndex: number) => (
                <WfCol key={dIndex} span={span}>
                  <WfCheckbox value={String(dItem.value)}>{dItem.label}</WfCheckbox>
                </WfCol>
              ))}
            </WfRow>
          </WfCheckboxGroup>
        ) : (
          <WfRadioGroup
            value={v != null ? String(v) : undefined}
            disabled={disabled}
            onChange={(val: any) => setField(code, val)}
          >
            <WfRow gutter={20}>
              {(item.dict ?? []).map((dItem: any, dIndex: number) => (
                <WfCol key={dIndex} span={span}>
                  <WfRadio value={String(dItem.value)}>{dItem.label}</WfRadio>
                </WfCol>
              ))}
            </WfRow>
          </WfRadioGroup>
        )
      }
      case 5:
        return (
          <div>
            {(permissionRows[code] ?? []).map((row, rowIndex) => (
              <WfTag
                key={rowIndex}
                closable={!disabled}
                size="small"
                style={{ marginRight: 10, marginBottom: 5 }}
                onClose={() => delPermission(code, row)}
              >
                {row.handlerName || row.storageId}
              </WfTag>
            ))}
            {!disabled ? (
              <WfButton type="primary" onClick={() => openSelectDialog(code)}>
                {t('between.selectHandler')}
              </WfButton>
            ) : null}
          </div>
        )
      case 6:
        return (
          <WfInputNumber
            value={v}
            placeholder={item.desc}
            disabled={disabled}
            precision={item.precision ? item.precision : 0}
            step={item.step ? Number(item.step) : 1}
            min={item.min ? Number(item.min) : 0}
            style={{ width: 400, marginRight: 10, marginBottom: 5 }}
            onChange={(val: any) => setField(code, val)}
          />
        )
      case 7: {
        const isTimePicker = ['timepicker', 'timepickerrange'].includes(item.dateType)
        return isTimePicker ? (
          <WfTimePicker
            value={v}
            disabled={disabled}
            onChange={(val: any) => setField(code, val)}
          />
        ) : (
          <WfDatePicker
            value={v}
            type={item.dateType === 'daterange' || item.dateType === 'range' ? 'daterange' : undefined}
            hasClear
            disabled={disabled}
            placeholder={item.desc}
            onChange={(val: any) => setField(code, val)}
          />
        )
      }
      default:
        return null
    }
  }

  // 当前 code 的办理人弹窗数据
  const currentUserRows = itemCode ? permissionRows[itemCode] ?? [] : []

  return (
    <>
      <WfForm disabled={disabled} className="nodeExtForm">
        {formList.map((item, index) => (
          <WfFormItem
            key={index}
            required={!!item.must}
            label={
              <span>
                <span>{item.label}</span>
                {[4, 5].includes(item.type) ? (
                  <WfTooltip title={item.desc} placement="top">
                    <WfIcon size={14} style={{ marginLeft: 2, marginTop: 4 }}>
                      <SvgIcon iconClass="ep:warning-filled" />
                    </WfIcon>
                  </WfTooltip>
                ) : null}
                <span>：</span>
              </span>
            }
          >
            {renderControl(item)}
          </WfFormItem>
        ))}
      </WfForm>

      {/* 办理人选择弹窗（type=5） */}
      {userVisible ? (
        <WfDialog
          title={t('between.userSelectTitle')}
          visible={userVisible}
          width="80%"
          footer={false}
          onClose={() => setUserVisible(false)}
        >
          <SelectUser
            selectUser={Array.isArray(form[itemCode]) ? form[itemCode] : []}
            permissionRows={currentUserRows}
            onUserSelect={handleUserSelect}
          />
        </WfDialog>
      ) : null}
    </>
  )
})

NodeExtList.displayName = 'NodeExtList'

export default NodeExtList
