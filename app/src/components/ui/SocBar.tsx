import { socClass } from '@/lib/status'

export function SocBar({ value, width = 64 }: { value: number; width?: number }) {
  return (
    <span className="soc">
      <span className="soc-track" style={{ width }}>
        <span className={`soc-fill ${socClass(value)}`} style={{ width: `${value}%` }} />
      </span>
      <b>{value}%</b>
    </span>
  )
}
