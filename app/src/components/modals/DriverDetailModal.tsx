'use client'

import Link from 'next/link'
import { Modal } from '@/components/ui/Modal'
import { Icon } from '@/components/ui/Icon'
import { ScoreRing } from '@/components/ui/ScoreRing'
import { fmt } from '@/lib/format'
import { telHref } from '@/lib/phone'
import type { Driver, DriverVehicle } from '@/types'

/** รายละเอียดคนขับ: สถิติ 30 วัน รถประจำ และช่องทางติดต่อ (โทรได้จากมือถือ) */
export function DriverDetailModal({ driver: d, vehicle: v, onClose }: { driver: Driver; vehicle?: DriverVehicle; onClose: () => void }) {
  return (
    <Modal
      title={d.name}
      description="สถิติการขับขี่ 30 วันล่าสุด"
      size="sm"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            ปิด
          </button>
          <a className="btn btn-navy" href={telHref(d.phone)} data-autofocus>
            <Icon name="phone" size={16} />
            โทร {d.phone}
          </a>
        </>
      }
    >
      <div className="driver-card" style={{ boxShadow: 'none', padding: 0 }}>
        <div className="driver-head">
          <span className="avatar">{d.name.slice(0, 2)}</span>
          <div>
            <strong>คะแนน Eco-Driving</strong>
            <small>{d.score === null ? 'ยังไม่มีทริปในช่วง 30 วัน จึงยังไม่มีคะแนน' : 'จากทริปและเหตุการณ์การขับขี่จริง'}</small>
          </div>
          <ScoreRing score={d.score} />
        </div>
        <div className="mini-stats">
          <div>
            <b>{d.trips}</b>
            <span>ทริป</span>
          </div>
          <div>
            <b>{fmt(d.km)}</b>
            <span>กม.</span>
          </div>
          <div>
            <b>{d.events}</b>
            <span>เหตุการณ์</span>
          </div>
        </div>
      </div>
      <div className="v-facts" style={{ marginTop: 16, gridTemplateColumns: '1fr' }}>
        <div className="v-fact">
          <span>เบอร์โทร</span>
          <b>{d.phone}</b>
        </div>
        <div className="v-fact">
          <span>รถประจำ</span>
          <b>
            {v ? (
              <Link href={`/vehicles/${v.id}`} style={{ color: 'var(--blue)' }}>
                {v.id} · {v.model}
              </Link>
            ) : (
              'ยังไม่มีรถประจำ'
            )}
          </b>
        </div>
        {v && (
          <div className="v-fact">
            <span>ประสิทธิภาพ</span>
            <b>{v.efficiency ?? '-'} kWh/100 กม.</b>
          </div>
        )}
      </div>
    </Modal>
  )
}
