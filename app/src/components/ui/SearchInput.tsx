'use client'

import { Icon } from './Icon'

export function SearchInput({
  value,
  onChange,
  placeholder,
  minWidth,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  /** ค่าเริ่มต้นตาม CSS (240px) */
  minWidth?: number
}) {
  return (
    <label className="search-input" style={minWidth !== undefined ? { minWidth } : undefined}>
      <Icon name="search" size={16} />
      <input type="search" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}
