import Link from 'next/link'
import { ApiError } from '@/api'

/** สถานะระหว่างโหลด/ผิดพลาดของหน้า: แยก "ไม่มีสิทธิ์" (403) ออกจากข้อผิดพลาดอื่น เพื่อไม่ให้ค้างที่ "กำลังโหลด" */
export function PageLoading({ error }: { error?: Error | null }) {
  if (!error) return <div className="muted">กำลังโหลดข้อมูล…</div>
  const forbidden = error instanceof ApiError && error.status === 403
  return (
    <div className="card">
      <div className="empty">
        <h3>{forbidden ? 'ไม่มีสิทธิ์เข้าถึงหน้านี้' : 'โหลดข้อมูลไม่สำเร็จ'}</h3>
        <p>{forbidden ? 'บทบาทของคุณไม่สามารถดูข้อมูลส่วนนี้ได้' : error.message}</p>
        {forbidden && (
          <p style={{ marginTop: 12 }}>
            <Link className="btn btn-outline btn-sm" href="/reports">
              ไปที่รายงาน
            </Link>
          </p>
        )}
      </div>
    </div>
  )
}
