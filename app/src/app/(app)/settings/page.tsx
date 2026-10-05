'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { api } from '@/api'
import { useAsync } from '@/hooks/useAsync'
import { Card, CardHeader } from '@/components/ui/Card'
import { Icon, type IconName } from '@/components/ui/Icon'
import { RangeField } from '@/components/ui/RangeField'
import { Switch } from '@/components/ui/Switch'
import type { Settings } from '@/types'

const SECTIONS: { id: string; label: string; icon: IconName }[] = [
  { id: 'org', label: 'องค์กร', icon: 'dashboard' },
  { id: 'alerts', label: 'เกณฑ์การแจ้งเตือน', icon: 'bell' },
  { id: 'charging', label: 'การชาร์จและค่าไฟ', icon: 'bolt' },
  { id: 'users', label: 'ผู้ใช้และสิทธิ์', icon: 'users' },
  { id: 'integrations', label: 'การเชื่อมต่อ', icon: 'plug' },
  { id: 'support', label: 'ช่วยเหลือ', icon: 'help' },
]

// เผื่อความสูง topbar แบบ sticky เมื่อเลื่อนไปยังหัวข้อ
const anchor = { scrollMarginTop: 96 }

async function load() {
  const [settings, users, integrations] = await Promise.all([api.getSettings(), api.listUsers(), api.listIntegrations()])
  return { settings, users, integrations }
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  )
}

function SetRow({ title, text, checked, onChange }: { title: string; text: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="set-row">
      <div>
        <strong>{title}</strong>
        <p>{text}</p>
      </div>
      <Switch label={title} checked={checked} onChange={onChange} />
    </div>
  )
}

export default function SettingsPage() {
  const { data } = useAsync(load)
  const [saved, setSaved] = useState<Settings | null>(null)
  const [form, setForm] = useState<Settings | null>(null)
  const [justSaved, setJustSaved] = useState(false)
  const [active, setActive] = useState('org')

  useEffect(() => {
    if (data) {
      setSaved(data.settings)
      setForm(structuredClone(data.settings))
    }
  }, [data])

  // เลื่อนไปยังหัวข้อตาม hash (เช่น /settings#support) หลังข้อมูลโหลดเสร็จ
  const ready = !!form
  useEffect(() => {
    if (!ready) return
    const id = window.location.hash.replace('#', '')
    if (id) document.getElementById(id)?.scrollIntoView()
  }, [ready])

  // scroll-spy: ไฮไลต์เมนูย่อยตามหัวข้อที่อยู่กลางจอ
  useEffect(() => {
    if (!ready) return
    const atBottom = () => window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && !atBottom() && setActive(e.target.id)),
      { rootMargin: '-40% 0px -55% 0px' },
    )
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id)
      if (el) io.observe(el)
    })
    // ท้ายหน้า: หัวข้อสุดท้ายสั้นเกินกว่าจะเลื่อนถึงแถบตรวจจับ จึงกำหนดให้ active เอง
    const onScroll = () => {
      if (atBottom()) setActive(SECTIONS[SECTIONS.length - 1].id)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      io.disconnect()
      window.removeEventListener('scroll', onScroll)
    }
  }, [ready])

  if (!form || !saved || !data) return <div className="muted">กำลังโหลดข้อมูล…</div>

  const dirty = JSON.stringify(form) !== JSON.stringify(saved)
  const patch = <K extends keyof Settings>(key: K, v: Partial<Settings[K]>) => {
    setJustSaved(false)
    setForm((f) => (f ? { ...f, [key]: { ...f[key], ...v } } : f))
  }
  const save = async () => {
    const s = await api.saveSettings(form)
    setSaved(s)
    setJustSaved(true)
  }
  const cancel = () => {
    setForm(structuredClone(saved))
    setJustSaved(false)
  }

  const { org, thresholds: th, notify, charging } = form
  const text = (key: keyof Settings['org'], label: string) => (
    <Field label={label}>
      <input className="input" value={org[key]} onChange={(e) => patch('org', { [key]: e.target.value })} />
    </Field>
  )

  return (
    <div className="settings-layout">
      <nav className="settings-nav">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className={active === s.id ? 'active' : ''}>
            <Icon name={s.icon} size={16} />
            {s.label}
          </a>
        ))}
      </nav>

      <div className="grid" style={{ gap: 20 }}>
        <section className="card" id="org" style={anchor}>
          <CardHeader title="ข้อมูลองค์กร" sub="ใช้แสดงในรายงานและการแจ้งเตือน" />
          <div className="form-grid">
            {text('name', 'ชื่อองค์กร')}
            {text('fleetName', 'ชื่อกองยาน')}
            <Field label="เขตเวลา">
              <select className="select" value={org.timezone} onChange={(e) => patch('org', { timezone: e.target.value })}>
                <option>Asia/Bangkok (UTC+07:00)</option>
              </select>
            </Field>
            <Field label="หน่วยระยะทาง">
              <select className="select" value={org.distanceUnit} onChange={(e) => patch('org', { distanceUnit: e.target.value })}>
                <option>กิโลเมตร</option>
                <option>ไมล์</option>
              </select>
            </Field>
            <Field label="ภาษา">
              <select className="select" value={org.language} onChange={(e) => patch('org', { language: e.target.value })}>
                <option>ไทย</option>
                <option>English</option>
              </select>
            </Field>
            <Field label="สกุลเงิน">
              <select className="select" value={org.currency} onChange={(e) => patch('org', { currency: e.target.value })}>
                <option>บาท (฿)</option>
              </select>
            </Field>
          </div>
        </section>

        <section className="card" id="alerts" style={anchor}>
          <CardHeader title="เกณฑ์การแจ้งเตือน" sub="ปรับระดับที่ระบบจะแจ้งเตือน" />
          <div className="form-grid">
            <RangeField label="แบตต่ำ (แจ้งเตือน)" min={10} max={50} value={th.lowBattery} format={(v) => `${v}%`} onChange={(v) => patch('thresholds', { lowBattery: v })} />
            <RangeField label="แบตต่ำมาก (วิกฤต)" min={5} max={30} value={th.criticalBattery} format={(v) => `${v}%`} onChange={(v) => patch('thresholds', { criticalBattery: v })} />
            <RangeField label="ความเร็วสูงสุด" hint="กม./ชม." min={60} max={140} step={5} value={th.maxSpeed} onChange={(v) => patch('thresholds', { maxSpeed: v })} />
            <RangeField label="รถออฟไลน์นานกว่า" min={5} max={120} step={5} value={th.offlineMinutes} format={(v) => `${v} น.`} onChange={(v) => patch('thresholds', { offlineMinutes: v })} />
          </div>
          <div className="divider" />
          <SetRow title="แจ้งเตือนทางอีเมล" text="ส่งสรุปเหตุการณ์วิกฤตทันที" checked={notify.email} onChange={(v) => patch('notify', { email: v })} />
          <SetRow title="แจ้งเตือนผ่าน LINE Official Account" text="ส่งเข้ากลุ่มผู้จัดการกองยาน" checked={notify.line} onChange={(v) => patch('notify', { line: v })} />
          <SetRow title="SMS ถึงคนขับ" text="เมื่อแบตต่ำมากระหว่างการเดินทาง" checked={notify.sms} onChange={(v) => patch('notify', { sms: v })} />
          <SetRow title="สรุปรายวันทางอีเมล" text="ทุกวันเวลา 08:00 น." checked={notify.dailyDigest} onChange={(v) => patch('notify', { dailyDigest: v })} />
        </section>

        <section className="card" id="charging" style={anchor}>
          <CardHeader title="การชาร์จและค่าไฟ" sub="ใช้คำนวณต้นทุนในรายงาน" />
          <div className="form-grid">
            <Field label="อัตราค่าไฟ Depot">
              <select className="select" value={charging.tariff} onChange={(e) => patch('charging', { tariff: e.target.value })}>
                <option>TOU (On-Peak / Off-Peak)</option>
                <option>อัตราปกติ</option>
              </select>
            </Field>
            <Field label="ค่าไฟ Off-Peak (฿/kWh)">
              <input className="input" inputMode="decimal" value={charging.offPeak} onChange={(e) => patch('charging', { offPeak: e.target.value })} />
            </Field>
            <Field label="ค่าไฟ On-Peak (฿/kWh)">
              <input className="input" inputMode="decimal" value={charging.onPeak} onChange={(e) => patch('charging', { onPeak: e.target.value })} />
            </Field>
            <Field label="เป้าหมายชาร์จเริ่มต้น">
              <select className="select" value={charging.defaultTarget} onChange={(e) => patch('charging', { defaultTarget: e.target.value })}>
                <option>80%</option>
                <option>90%</option>
                <option>100%</option>
              </select>
            </Field>
          </div>
          <div className="divider" />
          <SetRow title="ตั้งเวลาชาร์จอัจฉริยะ" text="เริ่มชาร์จที่ Depot อัตโนมัติหลัง 22:00 น." checked={charging.smartSchedule} onChange={(v) => patch('charging', { smartSchedule: v })} />
          <SetRow title="จำกัดกำลังไฟรวมของ Depot" text="ไม่เกิน 150 kW เพื่อหลีกเลี่ยงค่า Demand Charge" checked={charging.demandLimit} onChange={(v) => patch('charging', { demandLimit: v })} />
        </section>

        <section className="card flush" id="users" style={anchor}>
          <CardHeader
            title="ผู้ใช้และสิทธิ์"
            sub="กำหนดบทบาทการเข้าถึงข้อมูล"
            actions={
              <button className="btn btn-primary btn-sm">
                <Icon name="plus" size={15} />
                เชิญผู้ใช้
              </button>
            }
          />
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>ผู้ใช้</th>
                  <th>บทบาท</th>
                  <th>สิทธิ์</th>
                  <th>เข้าใช้ล่าสุด</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((u) => (
                  <tr key={u.email}>
                    <td>
                      <div className="veh">
                        <span className="avatar" style={{ width: 34, height: 34, fontSize: 11, ...(u.color ? { background: u.color } : {}) }}>
                          {u.initials}
                        </span>
                        <span>
                          <strong>{u.name}</strong>
                          <small>{u.email}</small>
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${u.roleBadge}`}>{u.role}</span>
                    </td>
                    <td>{u.permissions}</td>
                    <td>{u.lastSeen}</td>
                    <td>
                      <button className="btn btn-ghost btn-sm">แก้ไข</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card" id="integrations" style={anchor}>
          <CardHeader title="การเชื่อมต่อ" sub="อุปกรณ์ติดตาม เครือข่ายชาร์จ และระบบภายนอก" />
          <div className="grid g-2" style={{ gap: 12 }}>
            {data.integrations.map((i) => (
              <div className="integration" key={i.key}>
                <span className="logo-box" style={{ background: i.color }}>
                  {i.logo}
                </span>
                <div className="li-body">
                  <strong>{i.name}</strong>
                  <p>{i.text}</p>
                </div>
                {i.connected ? (
                  <span className="badge s-charging">
                    <i />
                    เชื่อมต่อ
                  </span>
                ) : (
                  <button className="btn btn-outline btn-sm">{i.actionLabel}</button>
                )}
              </div>
            ))}
          </div>
        </section>

        <Card>
          <div id="support" style={anchor}>
            <CardHeader title="ช่วยเหลือ" sub="ทีมซัพพอร์ตพร้อมช่วยตลอด 24 ชั่วโมง" />
            <div className="grid g-3" style={{ gap: 12 }}>
              <div className="v-fact">
                <span>โทร</span>
                <b>053-000-000</b>
              </div>
              <div className="v-fact">
                <span>อีเมล</span>
                <b style={{ fontSize: 14 }}>support@evmonitor.co.th</b>
              </div>
              <div className="v-fact">
                <span>เวอร์ชันระบบ</span>
                <b>v2.0.0</b>
              </div>
            </div>
          </div>
        </Card>

        <div className="flex" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-outline" onClick={cancel} disabled={!dirty}>
            ยกเลิก
          </button>
          <button className="btn btn-primary" onClick={save} disabled={!dirty && !justSaved}>
            {justSaved && !dirty ? (
              <>
                <Icon name="check" size={16} />
                บันทึกแล้ว
              </>
            ) : (
              'บันทึกการเปลี่ยนแปลง'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
