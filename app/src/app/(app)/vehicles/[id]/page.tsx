import { Card } from '@/components/ui/Card'

export default function VehicleDetailSoon({ params }: { params: { id: string } }) {
  return (
    <Card>
      <div className="empty">
        <h3>รถ {decodeURIComponent(params.id)}</h3>
        <p>หน้ารายละเอียดรถกำลังพัฒนา — จะเพิ่มในเฟสถัดไป</p>
      </div>
    </Card>
  )
}
