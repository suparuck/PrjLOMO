import type { Station } from '@/types'

export function StationCard({ station: s, onEdit }: { station: Station; onEdit?: () => void }) {
  const free = s.ports - s.busy
  return (
    <div className="session">
      <div className="session-top">
        <div>
          <strong>{s.name}</strong>
          <small>
            {s.network} · {s.power}
          </small>
        </div>
        <span className={`badge ${free ? 's-charging' : 's-low'}`}>
          <i />
          {free ? `ว่าง ${free}` : 'เต็ม'}
        </span>
        {onEdit && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onEdit} aria-label={`แก้ไขสถานี ${s.name}`}>
            แก้ไข
          </button>
        )}
      </div>
      <div className="flex" style={{ gap: 6, marginBottom: 12 }}>
        {Array.from({ length: s.ports }, (_, i) => (
          <span
            key={i}
            title={`ช่อง ${i + 1}`}
            style={{ flex: 1, height: 8, borderRadius: 4, background: i < s.busy ? 'var(--amber)' : 'var(--green)' }}
          />
        ))}
      </div>
      <dl className="kv small">
        <dt>ช่องชาร์จ</dt>
        <dd>
          {s.busy}/{s.ports} ใช้งาน
        </dd>
        <dt>ราคา</dt>
        <dd>฿{s.pricePerKwh} / kWh</dd>
        <dt>ประเภท</dt>
        <dd>{s.type === 'depot' ? 'Depot องค์กร' : 'สาธารณะ'}</dd>
      </dl>
    </div>
  )
}
