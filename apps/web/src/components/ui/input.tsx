import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import { cn } from '@/lib/cn'

const control =
  'w-full rounded-sm border border-line bg-card px-3 text-ink placeholder:text-muted ' +
  'transition-colors hover:border-muted focus:border-ink focus:outline-none ' +
  'disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-accent'

export type InputSize = 'md' | 'lg'

const inputSizes: Record<InputSize, string> = {
  md: 'h-10 text-[14px]',
  lg: 'h-14 px-4 text-[17px] md:h-16 md:px-5 md:text-[19px]',
}

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: InputSize
}

/** Text input. `size="lg"` is the one-sentence field on the home page. */
export function Input({ size = 'md', className, ...rest }: InputProps) {
  return <input className={cn(control, inputSizes[size], className)} {...rest} />
}

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>

export function Textarea({ className, rows = 4, ...rest }: TextareaProps) {
  return (
    <textarea
      rows={rows}
      className={cn(control, 'resize-y py-2 text-[14px] leading-relaxed', className)}
      {...rest}
    />
  )
}

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  /** Convenience: pass options instead of `<option>` children. */
  options?: SelectOption[]
  placeholder?: string
}

const chevron =
  "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236d6e69' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E"

export function Select({ options, placeholder, className, children, style, ...rest }: SelectProps) {
  return (
    <select
      className={cn(control, 'h-10 appearance-none bg-no-repeat pr-9 text-[14px]', className)}
      style={{
        backgroundImage: `url("${chevron}")`,
        backgroundSize: '16px 16px',
        backgroundPosition: 'right 0.6rem center',
        ...style,
      }}
      {...rest}
    >
      {placeholder ? (
        <option value="" disabled>
          {placeholder}
        </option>
      ) : null}
      {options?.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
      {children}
    </select>
  )
}

export interface FieldProps {
  label: ReactNode
  htmlFor?: string
  hint?: ReactNode
  error?: ReactNode
  className?: string
  children: ReactNode
}

/** Label + control + hint/error. Labels are sentence case; hints answer a real question. */
export function Field({ label, htmlFor, hint, error, className, children }: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-[12px] text-accent">{error}</p>
      ) : hint ? (
        <p className="text-[12px] text-muted">{hint}</p>
      ) : null}
    </div>
  )
}

export interface SegmentedOption {
  value: string
  label: ReactNode
  disabled?: boolean
}

/**
 * Button-like radio row for sizes and small choices: every option visible, the chosen one in ink.
 * Native radios underneath, so it posts through any form.
 */
export function Segmented({
  name,
  options,
  defaultValue,
  disabled,
  className,
}: {
  name: string
  options: SegmentedOption[]
  defaultValue?: string
  disabled?: boolean
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)} role="radiogroup">
      {options.map((option) => (
        <label
          key={option.value}
          className={cn(
            'inline-flex h-9 min-w-11 cursor-pointer items-center justify-center rounded-sm border border-line bg-card px-3 text-[13px] font-medium transition-colors',
            'hover:border-ink has-checked:border-ink has-checked:bg-ink has-checked:text-paper',
            'has-disabled:cursor-not-allowed has-disabled:opacity-40',
          )}
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            defaultChecked={option.value === defaultValue}
            disabled={disabled || option.disabled}
            className="sr-only"
          />
          {option.label}
        </label>
      ))}
    </div>
  )
}
