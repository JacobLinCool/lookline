import Link from 'next/link'
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'link'
export type ButtonSize = 'sm' | 'md' | 'lg'

const base =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm font-medium ' +
  'transition-[background-color,color,border-color,transform] duration-150 ease-out ' +
  'active:translate-y-px disabled:pointer-events-none disabled:opacity-40 ' +
  '[&_svg]:size-4 [&_svg]:shrink-0'

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-ink text-paper hover:bg-ink/85',
  secondary: 'border border-line bg-card text-ink hover:border-ink',
  ghost: 'text-ink hover:bg-mist',
  link: 'h-auto px-0 text-ink underline decoration-line underline-offset-4 hover:decoration-ink',
}

const sizes: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-[13px]',
  md: 'h-10 px-4 text-[14px]',
  lg: 'h-12 px-5 text-[15px]',
}

export interface ButtonStyleOptions {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Stretch to the container width. */
  full?: boolean
  className?: string
}

/** Class string for a button-like element (use on `<button formAction>` or third-party links). */
export function buttonClasses({
  variant = 'primary',
  size = 'md',
  full,
  className,
}: ButtonStyleOptions = {}): string {
  return cn(
    base,
    variants[variant],
    variant === 'link' ? '' : sizes[size],
    full && 'w-full',
    className,
  )
}

interface ButtonOwnProps extends ButtonStyleOptions {
  /** Leading icon (a lucide icon element); sized to 16px automatically. */
  icon?: ReactNode
  /** Trailing icon. */
  iconEnd?: ReactNode
  children?: ReactNode
}

type LinkButtonProps = ButtonOwnProps & { href: string } & Omit<
    AnchorHTMLAttributes<HTMLAnchorElement>,
    'href' | 'className' | 'children'
  >
type NativeButtonProps = ButtonOwnProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'>

export type ButtonProps = LinkButtonProps | NativeButtonProps

/**
 * One ink button per page; everything else is secondary, ghost or a link. Renders a Next
 * `<Link>` when `href` is given, otherwise a `<button>` (defaults to `type="button"`).
 */
export function Button(props: ButtonProps) {
  if ('href' in props) {
    const { variant, size, full, className, icon, iconEnd, children, href, ...anchor } = props
    return (
      <Link href={href} className={buttonClasses({ variant, size, full, className })} {...anchor}>
        {icon}
        {children}
        {iconEnd}
      </Link>
    )
  }
  const { variant, size, full, className, icon, iconEnd, children, type, ...button } = props
  return (
    <button
      type={type ?? 'button'}
      className={buttonClasses({ variant, size, full, className })}
      {...button}
    >
      {icon}
      {children}
      {iconEnd}
    </button>
  )
}
