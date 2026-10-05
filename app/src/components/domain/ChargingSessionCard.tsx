import type { ChargingSession } from '@/types'

export function ChargingSessionCard({ session: s, model }: { session: ChargingSession; model: string }) {
  return (
    <div className="session">
      <div className="session-top">
        <div>
          <strong>
            {s.vehicleId} · {model}
          </strong>
          <small>
            {s.stationName} · {s.kw} kW · เริ่ม {s.start}
          </small>
        </div>
        <div className="session-pct">{s.nowSoc}%</div>
      </div>
      <div className="charge-bar">
        <div className="charge-fill" style={{ width: `${s.nowSoc}%` }} />
        <div className="charge-target" style={{ left: `${s.targetSoc}%` }} />
      </div>
      <div className="session-meta">
        <div>
          พลังงาน<b>{s.kwh} kWh</b>
        </div>
        <div>
          ค่าใช้จ่าย<b>฿{s.cost}</b>
        </div>
        <div>
          เป้าหมาย<b>{s.targetSoc}%</b>
        </div>
        <div>
          เหลือ<b>{s.eta}</b>
        </div>
      </div>
    </div>
  )
}
