'use client'

import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

/**
 * หน้าต่างโมดัลที่เข้าถึงได้: role=dialog, ปิดด้วย ESC/คลิกพื้นหลัง/ปุ่ม X,
 * ล็อกการเลื่อนพื้นหลัง, วน Tab ภายในหน้าต่าง และคืน focus ไปที่ปุ่มที่เปิดเมื่อปิด
 * dismissible=false ใช้ระหว่างกำลังบันทึก เพื่อกันปิดกลางคัน
 */
export function Modal({
  title,
  description,
  onClose,
  children,
  footer,
  size = 'md',
  dismissible = true,
}: {
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md'
  dismissible?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descId = useId()

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const first = ref.current?.querySelector<HTMLElement>('[data-autofocus]') ?? ref.current?.querySelector<HTMLElement>(FOCUSABLE)
    ;(first ?? ref.current)?.focus()
    return () => {
      document.body.style.overflow = overflow
      previous?.focus?.()
    }
  }, [])

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape' && dismissible) {
      e.stopPropagation()
      onClose()
      return
    }
    if (e.key !== 'Tab' || !ref.current) return
    const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && dismissible && onClose()}>
      <div
        ref={ref}
        className={`modal${size === 'sm' ? ' sm' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <div className="modal-h">
          <div>
            <h3 id={titleId}>{title}</h3>
            {description && <p id={descId}>{description}</p>}
          </div>
          <button type="button" className="icon-btn" aria-label="ปิด" onClick={onClose} disabled={!dismissible}>
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="modal-b">{children}</div>
        {footer && <div className="modal-f">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}
