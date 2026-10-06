'use client'

import { useEffect, useState } from 'react'
import { api } from '@/api'
import { useAsync } from '@/hooks/useAsync'
import { useDebounced } from '@/hooks/useDebounced'
import { CardHeader } from '@/components/ui/Card'
import { Pager, pagerOf } from '@/components/ui/Pager'
import { SearchInput } from '@/components/ui/SearchInput'
import { formatDayTime } from '@/lib/time'
import type { AuditCategory } from '@/types'

const CATEGORIES: { key: '' | AuditCategory; label: string }[] = [
  { key: '', label: 'ทุกหมวด' },
  { key: 'security', label: 'ความปลอดภัย' },
  { key: 'users', label: 'ผู้ใช้และสิทธิ์' },
  { key: 'config', label: 'การตั้งค่า' },
  { key: 'data', label: 'ข้อมูลกองยาน' },
]
const BADGE: Record<AuditCategory, string> = { security: 's-low', users: 's-driving', config: 's-parked', data: 's-charging' }

/** บันทึกกิจกรรม (admin เท่านั้น): ใครทำอะไรกับอะไรเมื่อไหร่จากที่ไหน — อ่านอย่างเดียว เก็บ 1 ปี (AUDIT_KEEP_DAYS) */
export function AuditLogSection() {
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [category, setCategory] = useState<'' | AuditCategory>('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const dq = useDebounced(q.trim(), 300)
  useEffect(() => setPage(1), [dq, category, from, to])
  const { data, error } = useAsync(() => api.listAuditLog({ page, pageSize: 15, q: dq, category, from, to }), [page, dq, category, from, to], { live: true })
  useEffect(() => {
    if (data && data.page > data.pages) setPage(data.pages)
  }, [data])

  return (
    <section className="card flush" id="audit" style={{ scrollMarginTop: 96 }}>
      <CardHeader
        title="บันทึกกิจกรรม"
        sub="ใครทำอะไรกับอะไรเมื่อไหร่ — เฉพาะผู้ดูแลระบบ อ่านอย่างเดียว แก้ไขหรือลบเองไม่ได้ (ระบบล้างรายการที่เก่ากว่า 1 ปี)"
        actions={
          <div className="card-tools" style={{ flexWrap: 'wrap' }}>
            <SearchInput value={q} onChange={setQ} placeholder="ค้นหาผู้ทำ เป้าหมาย" minWidth={180} />
            <select className="select" aria-label="หมวด" value={category} onChange={(e) => setCategory(e.target.value as '' | AuditCategory)}>
              {CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
            <input className="input" type="date" aria-label="ตั้งแต่วันที่" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
            <input className="input" type="date" aria-label="ถึงวันที่" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
          </div>
        }
      />
      {error && (
        <p className="field-error" role="alert" style={{ padding: '0 22px' }}>
          โหลดบันทึกกิจกรรมไม่สำเร็จ
        </p>
      )}
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>เวลา</th>
              <th>ผู้ทำ</th>
              <th>การกระทำ</th>
              <th>เป้าหมาย</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((r) => (
              <tr key={r.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{formatDayTime(r.at)}</td>
                <td>{r.actorEmail ?? <span className="muted">ระบบ/ไม่ทราบ</span>}</td>
                <td>
                  <span className={`badge ${BADGE[r.category]}`}>{r.categoryLabel}</span> {r.label}
                  {r.detail.fields && r.detail.fields.length > 0 && <small className="muted" style={{ display: 'block' }}>ฟิลด์: {r.detail.fields.slice(0, 5).join(', ')}{r.detail.fields.length > 5 ? ` +${r.detail.fields.length - 5}` : ''}</small>}
                </td>
                <td>{r.target ?? '–'}</td>
                <td>{r.ip ?? '–'}</td>
              </tr>
            ))}
            {data && data.items.length === 0 && (
              <tr>
                <td colSpan={5} className="muted" style={{ textAlign: 'center' }}>
                  ไม่พบบันทึกที่ตรงกับเงื่อนไข
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {data && <Pager p={pagerOf(data, setPage)} unit="รายการ" />}
    </section>
  )
}
