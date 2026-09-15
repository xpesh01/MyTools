import type { ComponentProps, ReactNode } from 'react'
import { useClipboard } from '../hooks/useClipboard.ts'
import { cx } from '../lib/cx.ts'
import './ui.css'

/**
 * Небольшой набор общих элементов, из которых собираются страницы инструментов.
 * Новому инструменту достаточно импортировать нужное отсюда — стили подтянутся сами.
 */

type ButtonProps = ComponentProps<'button'> & {
  variant?: 'primary' | 'secondary' | 'ghost'
}

export function Button({ variant = 'secondary', className, ...rest }: ButtonProps) {
  return <button type="button" className={cx('btn', `btn--${variant}`, className)} {...rest} />
}

export function CopyButton({ value, label = 'Копировать' }: { value: string; label?: string }) {
  const { copied, copy } = useClipboard()

  return (
    <Button
      variant="ghost"
      className={cx('btn--compact', copied && 'btn--done')}
      disabled={!value}
      onClick={() => void copy(value)}
    >
      {copied ? 'Скопировано' : label}
    </Button>
  )
}

export function Field({
  label,
  hint,
  action,
  children,
}: {
  label: string
  hint?: ReactNode
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="field">
      <div className="field__head">
        <span className="field__label">{label}</span>
        {action}
      </div>
      {children}
      {hint && <p className="field__hint">{hint}</p>}
    </div>
  )
}

export function TextArea({ className, ...rest }: ComponentProps<'textarea'>) {
  return <textarea spellCheck={false} className={cx('textarea', className)} {...rest} />
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  label?: string
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={cx('segmented__item', option.value === value && 'segmented__item--active')}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="checkbox">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  )
}

export function Callout({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'success' | 'error'
  children: ReactNode
}) {
  return <p className={cx('callout', `callout--${tone}`)}>{children}</p>
}

export function Stats({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="stats">
      {items.map((item) => (
        <div key={item.label} className="stats__item">
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="toolbar">{children}</div>
}
