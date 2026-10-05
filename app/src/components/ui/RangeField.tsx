'use client'

export function RangeField({
  label,
  hint,
  min,
  max,
  step = 1,
  value,
  format = String,
  onChange,
}: {
  label: string
  hint?: string
  min: number
  max: number
  step?: number
  value: number
  format?: (v: number) => string
  onChange: (v: number) => void
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <div className="range-row">
        <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
        <output>{format(value)}</output>
      </div>
      {hint && <span className="hint">{hint}</span>}
    </div>
  )
}
