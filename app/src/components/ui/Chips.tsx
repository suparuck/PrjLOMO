'use client'

export function Chips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string; count?: number }[]
  value: T
  onChange: (k: T) => void
}) {
  return (
    <div className="chips">
      {options.map((o) => (
        <button key={o.key} className={`chip${o.key === value ? ' active' : ''}`} onClick={() => onChange(o.key)}>
          {o.label}
          {o.count !== undefined && <> <em>{o.count}</em></>}
        </button>
      ))}
    </div>
  )
}
