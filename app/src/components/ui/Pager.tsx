'use client'

import type { Pagination } from '@/hooks/usePagination'

/** แถบเปลี่ยนหน้า: "แสดง a–b จาก n" + ก่อนหน้า / เลขหน้า / ถัดไป (ซ่อนเมื่อมีหน้าเดียว แต่ยังบอกจำนวนรวม) */
export function Pager({ p, unit, className = '' }: { p: Pick<Pagination, 'page' | 'pages' | 'total' | 'from' | 'to' | 'setPage'>; unit: string; className?: string }) {
  // แสดงเลขหน้ารอบหน้าปัจจุบัน (สูงสุด 5 ปุ่ม) พร้อมหน้าแรก/สุดท้ายเสมอ
  const nums = Array.from({ length: p.pages }, (_, i) => i + 1).filter((n) => n === 1 || n === p.pages || Math.abs(n - p.page) <= 1)
  return (
    <div className={`pager ${className}`.trim()}>
      <span className="small muted" role="status">
        {p.total === 0 ? `ไม่มี${unit}` : `แสดง ${p.from}–${p.to} จาก ${p.total} ${unit}`}
      </span>
      {p.pages > 1 && (
        <nav className="flex" aria-label="เปลี่ยนหน้า">
          <button type="button" className="btn btn-outline btn-sm" disabled={p.page === 1} onClick={() => p.setPage(p.page - 1)}>
            ก่อนหน้า
          </button>
          {nums.map((n, i) => (
            <span key={n} className="flex" style={{ gap: 6 }}>
              {i > 0 && n - nums[i - 1] > 1 && <span className="muted">…</span>}
              <button
                type="button"
                className={`btn btn-sm ${n === p.page ? 'btn-navy' : 'btn-outline'}`}
                aria-current={n === p.page ? 'page' : undefined}
                aria-label={`หน้า ${n}`}
                onClick={() => p.setPage(n)}
              >
                {n}
              </button>
            </span>
          ))}
          <button type="button" className="btn btn-outline btn-sm" disabled={p.page === p.pages} onClick={() => p.setPage(p.page + 1)}>
            ถัดไป
          </button>
        </nav>
      )}
    </div>
  )
}
