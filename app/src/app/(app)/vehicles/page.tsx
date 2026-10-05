import { Suspense } from 'react'
import { VehiclesView } from './VehiclesView'

// useSearchParams ต้องอยู่ใน Suspense ตอน build แบบ static
export default function VehiclesPage() {
  return (
    <Suspense fallback={<div className="muted">กำลังโหลดข้อมูล…</div>}>
      <VehiclesView />
    </Suspense>
  )
}
