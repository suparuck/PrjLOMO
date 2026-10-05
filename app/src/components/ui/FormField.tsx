import type { ReactNode } from 'react'

export interface ControlProps {
  id: string
  'aria-invalid'?: true
  'aria-describedby'?: string
}

/** ฟิลด์ฟอร์มพร้อมข้อความผิดพลาด/คำแนะนำ — ส่ง props เข้าถึงได้ (id, aria-*) ให้ control ผ่าน render */
export function FormField({
  name,
  label,
  error,
  hint,
  required = false,
  render,
}: {
  name: string
  label: string
  error?: string
  hint?: string
  required?: boolean
  render: (p: ControlProps) => ReactNode
}) {
  const id = `f-${name}`
  const msgId = `${id}-msg`
  const describedBy = error || hint ? msgId : undefined
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      {render({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })}
      {error ? (
        <span className="field-error" id={msgId} role="alert">
          {error}
        </span>
      ) : (
        hint && (
          <span className="hint" id={msgId}>
            {hint}
          </span>
        )
      )}
    </div>
  )
}

/** โฟกัสฟิลด์แรกที่มีข้อผิดพลาด (ตามลำดับที่ส่งมา) */
export function focusFirstError(order: string[], errors: Record<string, string>) {
  const key = order.find((k) => errors[k])
  if (key) document.getElementById(`f-${key}`)?.focus()
}
