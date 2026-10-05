import type { ReactNode } from 'react'
import Link from 'next/link'
import { Icon, type IconName } from './Icon'

type Variant = 'primary' | 'navy' | 'outline' | 'ghost' | 'light'
type Size = 'sm' | 'md' | 'lg'

const cls = (variant: Variant, size: Size) => `btn btn-${variant}${size === 'md' ? '' : ` btn-${size}`}`

export function LinkButton({
  href,
  variant = 'outline',
  size = 'sm',
  icon,
  iconSize = 15,
  children,
}: {
  href: string
  variant?: Variant
  size?: Size
  icon?: IconName
  iconSize?: number
  children: ReactNode
}) {
  return (
    <Link className={cls(variant, size)} href={href}>
      {icon && <Icon name={icon} size={iconSize} />}
      {children}
    </Link>
  )
}
