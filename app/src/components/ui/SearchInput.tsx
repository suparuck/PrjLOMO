'use client'

import { Icon } from './Icon'

export function SearchInput({
  value,
  onChange,
  placeholder,
  fill = false,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  fill?: boolean
}) {
  return (
    <label className="search-input" style={fill ? { minWidth: 0 } : undefined}>
      <Icon name="search" size={16} />
      <input type="search" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}
