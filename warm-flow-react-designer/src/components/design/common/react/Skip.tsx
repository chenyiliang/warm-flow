import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import {
  WfForm, WfFormItem, WfInput, WfSelect, WfOption,
} from '@/ui/components'
import { getFramework } from '@/utils/auth'
import { useI18n } from '@/i18n'

/**
 * 边（跳转）属性面板（React 版，移植自 common/vue/skip.vue）。
 *
 * 字段：跳转名称、跳转类型（PASS / REJECT）、跳转条件（条件名 + 条件方式 + 条件值）。
 * 条件方式含普通比较符（gt/ge/eq/ne/lt/le/like/notLike）与框架表达式（Spring Boot 的
 * default/spel、Solon 的 snel），表达式类走「单一宽输入框」布局（expressFlag）。
 *
 * 与 Vue 版的差异：
 * - **skipCondition 的组装**：Vue 版用 `watch(form, deep)` 监听整个 form 并回写
 *   `n.skipCondition`（直接改父对象）；React 改为在 `useEffect([conditionType, condition,
 *   conditionValue])` 里算出 skipCondition 并经 `onChange` 回传父级，语义等价但显式。
 * - **校验**：Vue 版用 el-form 的 rules + validator 回调（EP/antd 签名不一）；React 版自带
 *   `validate()`（经 ref 暴露），按 conditionType 选对应校验函数，跨 UI 库一致。
 * - `getFramework()` 为同步读取（来自 utils/auth，与 Vue 版共用同一份实现）。
 *
 * @author warm
 */
export interface SkipProps {
  /** 边表单数据（受控） */
  value?: Record<string, any>
  /** 只读 */
  disabled?: boolean
  /** 是否显示跳转条件（串行 / 包含网关的出边才显示） */
  skipConditionShow?: boolean
  /** 表单值变更 */
  onChange?: (value: Record<string, any>) => void
  /** 自定义扩展点（透出 form / disabled） */
  nodeFormExtra?: (ctx: { form: Record<string, any>; disabled: boolean }) => React.ReactNode
}

/** Skip 通过 ref 暴露的契约 */
export interface SkipHandle {
  validate: () => Promise<boolean>
}

/** 表达式类条件方式：走单一宽输入框 */
const EXPRESS_TYPES = ['spel', 'default', 'snel']

const Skip = forwardRef<SkipHandle, SkipProps>((props, ref) => {
  const { value = {}, disabled = false, skipConditionShow = true, onChange, nodeFormExtra } = props
  const { t } = useI18n()

  const framework = getFramework()
  const expressFlag = EXPRESS_TYPES.includes(value.conditionType)

  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const setField = (key: string, v: any) => {
    onChangeRef.current?.({ ...value, [key]: v })
  }

  /**
   * 组装 skipCondition 字符串（对齐 Vue 版 watch 逻辑）。
   * 表达式类（spel/default/snel）：`type@@value`；比较符类：`type@@condition|value`。
   */
  useEffect(() => {
    const conditionType = value.conditionType
    if (!conditionType) return
    let skipCondition = conditionType + '@@'
    if (!EXPRESS_TYPES.some((x) => conditionType.startsWith(x))) {
      skipCondition += (value.condition ?? '') + '|'
    }
    skipCondition += value.conditionValue ?? ''
    if (skipCondition !== value.skipCondition) {
      onChangeRef.current?.({ ...value, skipCondition })
    }
    // 仅在三个条件字段变化时重算；value 整体变化由父级驱动
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.conditionType, value.condition, value.conditionValue])

  // —— 校验函数（对齐 Vue 版 validateDefault / validateSpel / validateSnel）——
  function validateDefault(v: any): string | null {
    const s = String(v ?? '').replace('default@@', '').replace('=', '').trim()
    if (!s) return t('skip.defaultRequired')
    if (!/^\$\{.*\}$/.test(s)) return t('skip.defaultFormat')
    return null
  }
  function validateSpel(v: any): string | null {
    const s = String(v ?? '').replace('spel@@', '').replace('=', '').trim()
    if (!s) return t('skip.spelRequired')
    if (!/^#\{.*\}$/.test(s)) return t('skip.spelFormat')
    return null
  }
  function validateSnel(v: any): string | null {
    const s = String(v ?? '').replace('snel@@', '').replace('=', '').trim()
    if (!s) return t('skip.snelRequired')
    if (!/^#\{.*\}$/.test(s)) return t('skip.snelFormat')
    return null
  }

  /** 校验：仅表达式类条件有格式要求（对齐 Vue 版 rules.skipCondition 的 computed 分支） */
  const validate = async (): Promise<boolean> => {
    const type = value.conditionType
    if (!type) return true
    // 校验对象是组装后的完整 skipCondition（与 Vue 版 prop 绑定一致）
    const target = value.skipCondition ?? ''
    let err: string | null = null
    if (type === 'default') err = validateDefault(target)
    else if (type === 'spel') err = validateSpel(target)
    else if (type === 'snel') err = validateSnel(target)
    return err === null
  }

  // 经 ref 暴露 validate，供 PropertySetting 关闭抽屉前调用
  useImperativeHandle(ref, () => ({ validate }), [validate])

  /** 条件方式变更（切换普通 / 表达式布局） */
  const changeOper = (obj: string) => {
    setField('conditionType', obj)
  }

  /** 清空条件方式：连带清空条件名 / 值 / 组装结果（对齐 Vue 版 handleClear） */
  const handleClear = () => {
    onChangeRef.current?.({
      ...value,
      conditionType: '',
      condition: '',
      conditionValue: '',
      skipCondition: '',
    })
  }

  /** 条件值输入框的占位提示（按条件方式给示例） */
  function getConditionDescription() {
    switch (value.conditionType) {
      case 'default':
        return t('skip.descDefault')
      case 'spel':
        return t('skip.descSpel')
      case 'snel':
        return t('skip.descSnel')
      default:
        return t('common.pleaseInput')
    }
  }

  return (
    <div className="skip-wrapper">
      <WfForm className="skipForm" disabled={disabled}>
        <div className="base-settings-section">
          <div className="base-settings-content">
            {skipConditionShow ? (
              <WfFormItem label={t('skip.nameLabel')}>
                <WfInput
                  value={value.skipName ?? ''}
                  placeholder={t('skip.namePlaceholder')}
                  disabled={disabled}
                  onChange={(v: any) =>
                    setField('skipName', typeof v === 'string' ? v : v?.target?.value ?? '')
                  }
                />
              </WfFormItem>
            ) : null}

            <WfFormItem label={t('skip.typeLabel')}>
              <WfSelect
                value={value.skipType}
                disabled={disabled}
                onChange={(v: any) => setField('skipType', v)}
              >
                <WfOption value="PASS">{t('skip.typePass')}</WfOption>
                <WfOption value="REJECT">{t('skip.typeReject')}</WfOption>
              </WfSelect>
            </WfFormItem>

            {skipConditionShow ? (
              <WfFormItem label={t('skip.conditionLabel')}>
                {/* 普通比较符：条件名（变量）单独一栏 */}
                {!expressFlag ? (
                  <WfInput
                    value={value.condition ?? ''}
                    placeholder={t('skip.conditionName')}
                    disabled={disabled}
                    style={{ width: '30%' }}
                    onChange={(v: any) =>
                      setField('condition', typeof v === 'string' ? v : v?.target?.value ?? '')
                    }
                  />
                ) : null}
                <WfSelect
                  value={value.conditionType}
                  placeholder={t('skip.conditionTypePlaceholder')}
                  disabled={disabled}
                  hasClear
                  style={{ width: expressFlag ? '18%' : '25%', marginLeft: '1%' }}
                  onChange={(v: any) => changeOper(v)}
                >
                  <WfOption value="gt">{t('skip.opGt')}</WfOption>
                  <WfOption value="ge">{t('skip.opGe')}</WfOption>
                  <WfOption value="eq">{t('skip.opEq')}</WfOption>
                  <WfOption value="ne">{t('skip.opNe')}</WfOption>
                  <WfOption value="lt">{t('skip.opLt')}</WfOption>
                  <WfOption value="le">{t('skip.opLe')}</WfOption>
                  <WfOption value="like">{t('skip.opLike')}</WfOption>
                  <WfOption value="notLike">{t('skip.opNotLike')}</WfOption>
                  {framework === 'SPRING_BOOT' ? (
                    <WfOption value="default">{t('skip.opDefault')}</WfOption>
                  ) : null}
                  {framework === 'SPRING_BOOT' ? <WfOption value="spel">spel</WfOption> : null}
                  {framework === 'SOLON' ? <WfOption value="snel">snel</WfOption> : null}
                </WfSelect>
                <WfInput
                  value={value.conditionValue ?? ''}
                  placeholder={getConditionDescription()}
                  disabled={disabled}
                  style={{ width: expressFlag ? '80%' : '43%', marginLeft: '1%' }}
                  onChange={(v: any) =>
                    setField('conditionValue', typeof v === 'string' ? v : v?.target?.value ?? '')
                  }
                />
              </WfFormItem>
            ) : null}

            {/* 自定义扩展点（边/skip） */}
            {nodeFormExtra ? nodeFormExtra({ form: value, disabled }) : null}
          </div>
        </div>
      </WfForm>
    </div>
  )
})

Skip.displayName = 'Skip'

export default Skip
