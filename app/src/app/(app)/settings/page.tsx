'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { PageLoading } from '@/components/ui/PageLoading'
import { api } from '@/api'
import { useAsync } from '@/hooks/useAsync'
import { Card, CardHeader } from '@/components/ui/Card'
import { Icon, type IconName } from '@/components/ui/Icon'
import { RangeField } from '@/components/ui/RangeField'
import { SearchInput } from '@/components/ui/SearchInput'
import { Pager, pagerOf } from '@/components/ui/Pager'
import { AuditLogSection } from '@/components/settings/AuditLogSection'
import { useDebounced } from '@/hooks/useDebounced'
import { Switch } from '@/components/ui/Switch'
import { InviteUserModal } from '@/components/modals/InviteUserModal'
import { InviteManageModal } from '@/components/modals/InviteManageModal'
import { ApiKeyModal } from '@/components/modals/ApiKeyModal'
import { ResetLinkModal } from '@/components/modals/ResetLinkModal'
import { UserEditModal } from '@/components/modals/UserEditModal'
import { useToast } from '@/components/ui/Toast'
import type { AppUser, Settings } from '@/types'

const SECTIONS: { id: string; label: string; icon: IconName }[] = [
  { id: 'org', label: 'องค์กร', icon: 'dashboard' },
  { id: 'alerts', label: 'เกณฑ์การแจ้งเตือน', icon: 'bell' },
  { id: 'charging', label: 'การชาร์จและค่าไฟ', icon: 'bolt' },
  { id: 'users', label: 'ผู้ใช้และสิทธิ์', icon: 'users' },
  { id: 'integrations', label: 'การเชื่อมต่อ', icon: 'plug' },
  { id: 'audit', label: 'บันทึกกิจกรรม', icon: 'clock' }, // เฉพาะ admin
  { id: 'support', label: 'ช่วยเหลือ', icon: 'help' },
]

/** JSON ที่เรียงคีย์คงที่ — ใช้เทียบค่าโดยไม่สนลำดับคีย์ */
const stable = (v: unknown): string =>
  JSON.stringify(v, (_k, val) => (val && typeof val === 'object' && !Array.isArray(val) ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => a.localeCompare(b))) : val))

// เผื่อความสูง topbar แบบ sticky เมื่อเลื่อนไปยังหัวข้อ
const anchor = { scrollMarginTop: 96 }

async function load() {
  const [settings, integrations] = await Promise.all([api.getSettings(), api.listIntegrations()])
  return { settings, integrations }
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
  const { data, error } = useAsync(load)
  // แยกจาก settings: เชิญผู้ใช้แล้วโหลดเฉพาะรายชื่อ ไม่ทับค่าที่ผู้ใช้กำลังแก้ในฟอร์ม
  // รายชื่อผู้ใช้แบ่งหน้า/ค้นหาที่ API (หน้าละ 10)
  const [userPage, setUserPage] = useState(1)
  const [userQ, setUserQ] = useState('')
  const dUserQ = useDebounced(userQ.trim(), 300)
  useEffect(() => setUserPage(1), [dUserQ])
  const { data: usersData, error: usersError, reload: reloadUsers } = useAsync(() => api.listUsersPage({ page: userPage, pageSize: 10, q: dUserQ }), [userPage, dUserQ])
  useEffect(() => {
    if (usersData && usersData.page > usersData.pages) setUserPage(usersData.pages)
  }, [usersData])
  const users = usersData?.items
  const toast = useToast()
  // เชิญผู้ใช้: โหลดรายชื่อทั้งหมดตอนกดเท่านั้น (ใช้ตรวจอีเมลซ้ำในฟอร์ม)
  const [inviting, setInviting] = useState<AppUser[] | null>(null)
  const [managingInvite, setManagingInvite] = useState<AppUser | null>(null)
  const [resetting, setResetting] = useState<AppUser | null>(null)
  const [editing, setEditing] = useState<AppUser | null>(null)
  const { data: me } = useAsync(() => api.getMe())
  const sections = SECTIONS.filter((s) => s.id !== 'audit' || me?.role === 'admin')
  // บัญชีที่ยังใช้รหัสผ่านตั้งต้น (admin เท่านั้นที่เรียกได้ — บทบาทอื่นได้ 403 ก็แค่ไม่แสดงป้าย)
  const { data: sec, reload: reloadSec } = useAsync(() => api.getSecurityStatus().catch(() => ({ defaultPasswordUsers: [], require2faAdmins: false, adminsWithout2fa: 0 })), [], { live: true })
  const [policyBusy, setPolicyBusy] = useState(false)
  async function toggleTwoFactorPolicy(v: boolean) {
    setPolicyBusy(true)
    const res = await api.setTwoFactorPolicy(v)
    setPolicyBusy(false)
    if (!res.ok) return toast(Object.values(res.errors)[0] ?? 'บันทึกไม่สำเร็จ', 'error')
    toast(v ? 'บังคับให้ผู้ดูแลทุกคนเปิด 2FA แล้ว' : 'ยกเลิกการบังคับ 2FA แล้ว')
    reloadSec()
  }
  const weakIds = new Set((sec?.defaultPasswordUsers ?? []).map((u) => u.id))
  const [managingKeys, setManagingKeys] = useState(false)
  const [testingLine, setTestingLine] = useState(false)
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
    sections.forEach((s) => {
      const el = document.getElementById(s.id)
      if (el) io.observe(el)
    })
    // ท้ายหน้า: หัวข้อสุดท้ายสั้นเกินกว่าจะเลื่อนถึงแถบตรวจจับ จึงกำหนดให้ active เอง
    const onScroll = () => {
      if (atBottom()) setActive(sections[sections.length - 1].id)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      io.disconnect()
      window.removeEventListener('scroll', onScroll)
    }
  }, [ready, sections.length])

  if (!form || !saved || !data || !users) return <PageLoading error={error ?? usersError} />

  // jsonb ใน PostgreSQL เรียงคีย์ใหม่ จึงเทียบแบบไม่สนลำดับคีย์
  const dirty = stable(form) !== stable(saved)
  const patch = <K extends keyof Settings>(key: K, v: Partial<Settings[K]>) => {
    setJustSaved(false)
    setForm((f) => (f ? { ...f, [key]: { ...f[key], ...v } } : f))
  }
  const testLine = async () => {
    setTestingLine(true)
    const res = await api.testLine()
    setTestingLine(false)
    toast(res.ok ? 'ส่งข้อความทดสอบเข้า LINE แล้ว' : (Object.values(res.errors)[0] ?? 'ส่งไม่สำเร็จ'), res.ok ? 'success' : 'error')
  }
  const save = async () => {
    const res = await api.saveSettings(form)
    if (!res.ok) {
      toast(Object.values(res.errors)[0] ?? 'บันทึกการตั้งค่าไม่สำเร็จ', 'error')
      return
    }
    setSaved(res.data)
    setForm(structuredClone(res.data))
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
        {sections.map((s) => (
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
          <SetRow title="สรุปรายวันทางอีเมล" text="ทุกเช้า 08:00 น. ถึงผู้ดูแลและผู้จัดการ (ปรับเวลาด้วย DIGEST_HOUR_TH)" checked={notify.dailyDigest} onChange={(v) => patch('notify', { dailyDigest: v })} />
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
              <div className="card-tools">
                <SearchInput value={userQ} onChange={setUserQ} placeholder="ค้นหาชื่อหรืออีเมล" minWidth={200} />
              <button type="button" className="btn btn-primary btn-sm" onClick={async () => setInviting(await api.listUsers())}>
                <Icon name="plus" size={15} />
                เชิญผู้ใช้
              </button>
              </div>
            }
          />
          <div style={{ padding: '0 22px' }}>
            <div className="set-row">
              <div>
                <strong>บังคับให้ผู้ดูแลระบบเปิดใช้ 2FA</strong>
                <p>
                  ผู้ดูแลที่ยังไม่เปิดใช้จะเข้าได้เฉพาะหน้า &quot;บัญชีของฉัน&quot; จนกว่าจะตั้งค่าเสร็จ
                  {sec && sec.adminsWithout2fa > 0 && sec.require2faAdmins ? ` (ตอนนี้ยังไม่เปิด ${sec.adminsWithout2fa} คน)` : ''}
                  {sec && !sec.require2faAdmins ? ' — ต้องเปิด 2FA ของบัญชีตัวเองก่อนจึงจะเปิดสวิตช์นี้ได้' : ''}
                </p>
              </div>
              <Switch label="บังคับให้ผู้ดูแลระบบเปิดใช้ 2FA" checked={!!sec?.require2faAdmins} onChange={toggleTwoFactorPolicy} disabled={policyBusy || !sec} />
            </div>
          </div>
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
                {users.map((u) => (
                  <tr key={u.email}>
                    <td>
                      <div className="veh">
                        <span className="avatar avatar-sm" style={u.color ? { background: u.color } : undefined}>
                          {u.initials}
                        </span>
                        <span>
                          <strong>
                            {u.name}
                            {u.twoFactorEnabled && (
                              <span className="badge s-charging" style={{ marginLeft: 8 }} title="เปิดการยืนยันตัวตนสองขั้นตอน">
                                2FA
                              </span>
                            )}
                            {weakIds.has(u.id) && (
                              <span className="badge s-low" style={{ marginLeft: 8 }} title="ยังใช้รหัสผ่านตั้งต้นของระบบ — ควรเปลี่ยนหรือปิดบัญชี">
                                รหัสตั้งต้น
                              </span>
                            )}
                          </strong>
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
                      {u.status === 'invited' ? (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setManagingInvite(u)}>
                          ลิงก์คำเชิญ
                        </button>
                      ) : (
                        <div className="flex" style={{ gap: 4 }}>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(u)}>
                            แก้ไข
                          </button>
                          {u.status === 'active' && (
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setResetting(u)}>
                              รีเซ็ตรหัสผ่าน
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {users.length === 0 && <div className="empty">ไม่พบผู้ใช้ที่ตรงกับคำค้น</div>}
          <Pager p={pagerOf(usersData!, setUserPage)} unit="คน" />
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
                  <div className="flex" style={{ gap: 8 }}>
                    {i.key === 'line' && (
                      <button type="button" className="btn btn-outline btn-sm" onClick={testLine} disabled={testingLine}>
                        {testingLine ? 'กำลังส่ง…' : 'ส่งทดสอบ'}
                      </button>
                    )}
                    <span className="badge s-charging">
                      <i />
                      เชื่อมต่อ
                    </span>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={i.key === 'api' ? () => setManagingKeys(true) : i.key === 'line' ? () => toast('ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN และ LINE_TO ในไฟล์ .env แล้วรีสตาร์ต API (ดูวิธีใน api/README.md)', 'error') : undefined}
                  >
                    {i.actionLabel ?? 'ตั้งค่า'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>

        {me?.role === 'admin' && <AuditLogSection />}

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
                <b className="v-fact-text">support@evmonitor.co.th</b>
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

      {managingKeys && <ApiKeyModal onClose={() => setManagingKeys(false)} />}
      {resetting && <ResetLinkModal user={resetting} onClose={() => setResetting(null)} />}
      {editing && (
        <UserEditModal
          user={editing}
          isSelf={editing.id === me?.id}
          onClose={() => setEditing(null)}
          onSaved={(u) => {
            setEditing(null)
            reloadUsers()
            toast(u.status === 'disabled' ? `ปิดใช้งานบัญชี ${u.email} แล้ว` : `บันทึกข้อมูลของ ${u.email} แล้ว`)
          }}
        />
      )}
      {managingInvite && (
        <InviteManageModal
          user={managingInvite}
          onClose={() => setManagingInvite(null)}
          onChanged={(action) => {
            reloadUsers()
            if (action === 'cancelled') {
              toast(`ยกเลิกคำเชิญของ ${managingInvite.email} แล้ว`)
              setManagingInvite(null)
            }
          }}
        />
      )}
      {inviting && (
        <InviteUserModal
          users={inviting}
          onClose={() => setInviting(null)}
          onDone={(u) => {
            setInviting(null)
            reloadUsers()
            toast(`สร้างคำเชิญถึง ${u.email} แล้ว — นำลิงก์ไปส่งให้ผู้ถูกเชิญ`)
          }}
        />
      )}
    </div>
  )
}
