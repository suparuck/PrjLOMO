import Link from 'next/link'
import { Icon, type IconName } from '../ui/Icon'
import { LinkButton } from '../ui/Button'
import { SocBar } from '../ui/SocBar'
import { socClass } from '@/lib/status'
import { fmt } from '@/lib/format'
import type { ChargingSession, IceVehicle } from '@/types'

const Brand = ({ size = 20 }: { size?: number }) => (
  <Link className="brand" href="/">
    <span className="brand-mark">
      <Icon name="bolt" size={size} />
    </span>
    <span className="brand-text">
      <strong>EV Monitor</strong>
      <small>Fleet Management</small>
    </span>
  </Link>
)

export function SiteNav() {
  return (
    <header className="site-nav">
      <div className="wrap-x">
        <Brand />
        <nav className="site-links">
          <a href="#solutions">โซลูชัน</a>
          <a href="#features">ฟีเจอร์</a>
          <a href="#electrify">เปลี่ยนเป็น EV</a>
          <a href="#faq">คำถามที่พบบ่อย</a>
        </nav>
        <div className="site-cta">
          <span className="site-phone">
            <Icon name="phone" size={15} />
            053-000-000
          </span>
          <LinkButton href="/login" size="md">
            เข้าสู่ระบบ
          </LinkButton>
          <a className="btn btn-primary" href="#demo">
            ขอเดโม
          </a>
        </div>
      </div>
    </header>
  )
}

export function Hero({
  online,
  total,
  avgSoc,
  monthCo2,
  rows,
}: {
  online: number
  total: number
  avgSoc: number
  monthCo2: number
  rows: { id: string; soc: number }[]
}) {
  const pins = [
    { top: '30%', left: '22%', bg: 'var(--blue)' },
    { top: '58%', left: '48%', bg: 'var(--green)' },
    { top: '22%', left: '70%', bg: 'var(--blue)' },
    { top: '70%', left: '80%', bg: 'var(--danger)' },
  ]
  return (
    <section className="hero">
      <div className="wrap-x">
        <div>
          <span className="eyebrow">
            <Icon name="leaf" size={16} />
            Electric Vehicle Fleet Management
          </span>
          <h1>
            บริหารกองยาน <em>รถยนต์ไฟฟ้า</em> ได้ครบในแพลตฟอร์มเดียว
          </h1>
          <p className="lead">
            ติดตามแบตเตอรี่ ระยะวิ่ง การชาร์จ และพฤติกรรมการขับแบบเรียลไทม์ ลดต้นทุนพลังงานและการปล่อยคาร์บอน พร้อมวางแผนเปลี่ยนรถสันดาปเป็น EV อย่างมั่นใจ
          </p>
          <div className="hero-cta">
            <a className="btn btn-primary btn-lg" href="#demo">
              นัดคุยกับผู้เชี่ยวชาญ EV
            </a>
            <LinkButton href="/dashboard" variant="light" size="lg" icon="dashboard" iconSize={18}>
              ดูตัวอย่างแดชบอร์ด
            </LinkButton>
          </div>
          <div className="hero-trust">
            <div>
              <b>-38%</b>
              <span>ต้นทุนพลังงานต่อกม.</span>
            </div>
            <div>
              <b>24/7</b>
              <span>ติดตามแบบเรียลไทม์</span>
            </div>
            <div>
              <b>6+</b>
              <span>เครือข่ายสถานีชาร์จ</span>
            </div>
          </div>
        </div>

        <div className="mock" aria-hidden="true">
          <div className="mock-bar">
            <i />
            <i />
            <i />
          </div>
          <div className="mock-body">
            <div className="mock-side">
              <span>
                <Icon name="bolt" size={16} />
              </span>
              {(['dashboard', 'map', 'battery', 'chart'] as IconName[]).map((n) => (
                <span key={n}>
                  <Icon name={n} />
                </span>
              ))}
            </div>
            <div className="mock-main">
              <div className="mock-kpis">
                <div className="mock-kpi">
                  <span>รถออนไลน์</span>
                  <b>
                    {online}/{total}
                  </b>
                </div>
                <div className="mock-kpi">
                  <span>แบตเฉลี่ย</span>
                  <b>{avgSoc}%</b>
                </div>
                <div className="mock-kpi">
                  <span>CO₂ ที่ลดได้</span>
                  <b>{monthCo2} t</b>
                </div>
              </div>
              <div className="mock-map">
                {pins.map((p, i) => (
                  <span key={i} className="mock-pin" style={{ top: p.top, left: p.left, background: p.bg }} />
                ))}
              </div>
              <div className="mock-rows">
                {rows.map((v) => (
                  <div className="mock-row" key={v.id}>
                    <b>{v.id}</b>
                    <span className="soc-track">
                      <span className={`soc-fill ${socClass(v.soc)}`} style={{ width: `${v.soc}%` }} />
                    </span>
                    {v.soc}%
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

const FEATURES: { icon: IconName; tone: string; title: string; text: string; href: string; link: string }[] = [
  { icon: 'battery', tone: 't-green', title: 'ติดตามแบตเตอรี่เรียลไทม์', text: 'เห็นระดับแบต (SoC) สุขภาพแบต (SoH) และระยะวิ่งคงเหลือของทุกคัน พร้อมแจ้งเตือนเมื่อแบตต่ำ', href: '/battery', link: 'ดูหน้าสถานะแบต' },
  { icon: 'map', tone: 't-blue', title: 'แผนที่สดและสถานีชาร์จ', text: 'ดูตำแหน่งรถทุกคันพร้อมสถานีชาร์จทั้งในองค์กรและสาธารณะบนแผนที่เดียว วางงานได้ไม่ต้องกังวลเรื่องระยะ', href: '/map', link: 'เปิดแผนที่สด' },
  { icon: 'bolt', tone: 't-amber', title: 'บริหารการชาร์จ', text: 'ติดตามเซสชันการชาร์จ พลังงาน (kWh) และค่าใช้จ่ายรายคัน รายสถานี ทั้ง Depot และเครือข่ายสาธารณะ', href: '/charging', link: 'ดูการชาร์จ' },
  { icon: 'users', tone: 't-navy', title: 'พฤติกรรมการขับขี่', text: 'คะแนนการขับแบบประหยัดพลังงาน เหตุการณ์เบรกแรง ขับเร็ว ช่วยให้คนขับใช้พลังงานคุ้มค่าขึ้น', href: '/drivers', link: 'ดูคนขับ' },
  { icon: 'leaf', tone: 't-green', title: 'รายงานคาร์บอนและความยั่งยืน', text: 'วัดปริมาณ CO₂ ที่ลดได้เทียบกับรถสันดาป พร้อมรายงานสำหรับ ESG และการเปิดเผยข้อมูลความยั่งยืน', href: '/reports', link: 'ดูรายงาน' },
  { icon: 'route', tone: 't-red', title: 'รายงานความพร้อมเปลี่ยนเป็น EV', text: 'วิเคราะห์ระยะทางต่อวันและต้นทุนรวม (TCO) ของรถสันดาป เพื่อหาคันที่ควรเปลี่ยนเป็นรถไฟฟ้าก่อน', href: '/reports#electrify', link: 'ดูรายงานความพร้อม' },
]

export function Features() {
  return (
    <section className="section" id="solutions">
      <div className="wrap-x">
        <div className="section-h">
          <span className="kicker">ทุกช่วงของการเปลี่ยนผ่านสู่ EV</span>
          <h2>ไม่ว่าจะเริ่มต้น หรือมีรถไฟฟ้าทั้งกองแล้ว เราช่วยให้คุ้มค่ากว่าเดิม</h2>
          <p>รวมรถไฟฟ้า ไฮบริด และรถสันดาปไว้บนแพลตฟอร์มเดียว เห็นภาพรวมการใช้พลังงาน ต้นทุน และการปล่อยคาร์บอนของทั้งองค์กร</p>
        </div>
        <div className="feat-grid" id="features">
          {FEATURES.map((f) => (
            <article className="feat" key={f.title}>
              <div className={`feat-ico ${f.tone}`}>
                <Icon name={f.icon} size={24} />
              </div>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
              <Link href={f.href}>
                {f.link} <Icon name="chevron" size={14} />
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

const Checks = ({ items }: { items: string[] }) => (
  <ul className="checks">
    {items.map((t) => (
      <li key={t}>
        <Icon name="check" />
        {t}
      </li>
    ))}
  </ul>
)

export function DetailBlocks({
  ice,
  session,
  sessionModel,
  kpis,
}: {
  ice: IceVehicle[]
  session: ChargingSession
  sessionModel: string
  kpis: { co2Tons: number; fuelSavingsK: number; weekKwh: number; efficiency: number }
}) {
  const sorted = [...ice].sort((a, b) => b.readinessScore - a.readinessScore)
  return (
    <section className="section alt" id="electrify">
      <div className="wrap-x">
        <div className="split">
          <div className="split-text">
            <span className="kicker">วางแผนการเปลี่ยนผ่าน</span>
            <h3>รู้ว่ารถคันไหนควรเปลี่ยนเป็นไฟฟ้าก่อน</h3>
            <p>รายงาน Fleet Electrification วิเคราะห์จากข้อมูลการใช้งานจริงของรถสันดาปแต่ละคัน แล้วแนะนำรุ่น EV ที่เหมาะกับระยะทางและงาน</p>
            <Checks items={['ระยะทางเฉลี่ยและสูงสุดต่อวันของแต่ละคัน', 'เปรียบเทียบค่าน้ำมันกับค่าไฟที่คาดการณ์', 'คะแนนความพร้อมและรุ่น EV ที่แนะนำ']} />
          </div>
          <div className="visual">
            <div className="card">
              <div className="card-h">
                <div>
                  <h3>ความพร้อมเปลี่ยนเป็น EV</h3>
                  <p>รถสันดาป {ice.length} คันในกองยาน</p>
                </div>
              </div>
              <div className="stat-rows">
                {sorted.map((c) => (
                  <div className="stat-row" key={c.id}>
                    <div className="top">
                      <span>
                        {c.model} · {c.id}
                      </span>
                      <b>{c.readinessScore}</b>
                    </div>
                    <div className="bar">
                      <div className={`bar-fill ${socClass(c.readinessScore)}`} style={{ width: `${c.readinessScore}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="split rev">
          <div className="split-text">
            <span className="kicker">วางงานและการชาร์จ</span>
            <h3>วางงานพร้อมสถานีชาร์จบนแผนที่ ไม่มีวันแบตหมดกลางทาง</h3>
            <p>ระบบคำนวณระยะวิ่งคงเหลือเทียบกับเส้นทาง และแสดงสถานีชาร์จที่ใกล้ที่สุดของเครือข่าย PEA VOLTA, EleXA, EA Anywhere และ PTT EV</p>
            <Checks items={['แจ้งเตือนแบตต่ำทันทีผ่านแอปและอีเมล', 'สถานะช่องชาร์จว่าง/ไม่ว่างของสถานี Depot', 'ประวัติการชาร์จและค่าใช้จ่ายรายคัน']} />
          </div>
          <div className="visual">
            <div className="card">
              <div className="session-top">
                <div>
                  <strong>
                    {session.vehicleId} · {sessionModel}
                  </strong>
                  <small>
                    {session.stationName} · {session.kw} kW · เริ่ม {session.start}
                  </small>
                </div>
                <div className="session-pct">{session.nowSoc}%</div>
              </div>
              <div className="charge-bar">
                <div className="charge-fill" style={{ width: `${session.nowSoc}%` }} />
                <div className="charge-target" style={{ left: `${session.targetSoc}%` }} />
              </div>
              <div className="session-meta">
                <div>
                  พลังงาน<b>{session.kwh} kWh</b>
                </div>
                <div>
                  ค่าใช้จ่าย<b>฿{session.cost}</b>
                </div>
                <div>
                  เป้าหมาย<b>{session.targetSoc}%</b>
                </div>
                <div>
                  เหลือ<b>{session.eta}</b>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="split">
          <div className="split-text">
            <span className="kicker">ลดต้นทุน ลดคาร์บอน</span>
            <h3>เห็นต้นทุนพลังงานและ CO₂ ที่ลดได้ทุกวัน</h3>
            <p>แดชบอร์ดพลังงานรวม kWh ค่าไฟ และประสิทธิภาพ kWh/100 กม. ของทั้งกองยาน พร้อมคำนวณคาร์บอนที่หลีกเลี่ยงได้เมื่อเทียบกับรถน้ำมัน</p>
            <Checks items={['รายงานรายวัน รายเดือน รายปี ส่งออก PDF/Excel', 'เปรียบเทียบประสิทธิภาพรายรุ่น รายคนขับ', 'พร้อมใช้สำหรับรายงาน ESG ขององค์กร']} />
          </div>
          <div className="visual">
            <div className="grid g-2">
              {(
                [
                  ['leaf', 't-green', 'CO₂ ที่ลดได้ (ปีนี้)', kpis.co2Tons, 'ตัน'],
                  ['coin', 't-blue', 'ประหยัดเทียบน้ำมัน', `฿${kpis.fuelSavingsK}`, 'K'],
                  ['bolt', 't-amber', 'พลังงานสัปดาห์นี้', fmt(kpis.weekKwh), 'kWh'],
                  ['speed', 't-navy', 'ประสิทธิภาพเฉลี่ย', kpis.efficiency, 'kWh/100'],
                ] as [IconName, string, string, string | number, string][]
              ).map(([ico, tone, label, value, unit]) => (
                <div className="card" key={label}>
                  <div className="kpi">
                    <div className={`kpi-ico ${tone}`}>
                      <Icon name={ico} size={22} />
                    </div>
                    <div>
                      <div className="kpi-label">{label}</div>
                      <div className="kpi-value">
                        {value}
                        <small>{unit}</small>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export function StatsBand({ vehicleCount, monthKwh }: { vehicleCount: number; monthKwh: number }) {
  return (
    <section className="stats-band">
      <div className="wrap-x">
        <div>
          <b>{vehicleCount}</b>
          <span>รถไฟฟ้าในระบบ</span>
        </div>
        <div>
          <b>{fmt(monthKwh)}</b>
          <span>kWh ต่อเดือน</span>
        </div>
        <div>
          <b>99.8%</b>
          <span>ความพร้อมใช้งานของระบบ</span>
        </div>
        <div>
          <b>&lt; 30 วิ</b>
          <span>ความถี่อัปเดตตำแหน่ง</span>
        </div>
      </div>
    </section>
  )
}

const FAQ = [
  ['ระบบรองรับรถยี่ห้อใดบ้าง?', 'รองรับรถไฟฟ้ายอดนิยมในไทย เช่น BYD, MG, ORA, Neta, Tesla รวมถึงรถสันดาปและไฮบริด โดยเชื่อมต่อผ่านอุปกรณ์ติดตาม (OBD/Telematics) หรือ API ของผู้ผลิต'],
  ['ใช้ร่วมกับรถน้ำมันที่มีอยู่ได้ไหม?', 'ได้ ระบบแสดงรถทุกประเภทบนแพลตฟอร์มเดียว และใช้ข้อมูลรถสันดาปเพื่อทำรายงานความพร้อมเปลี่ยนเป็น EV'],
  ['ข้อมูลแบตเตอรี่อัปเดตบ่อยแค่ไหน?', 'ระหว่างรถวิ่งอัปเดตทุก 15–30 วินาที ขณะจอดหรือชาร์จจะอัปเดตตามการเปลี่ยนแปลงของระดับแบต'],
  ['ส่งการแจ้งเตือนผ่านช่องทางใด?', 'แจ้งเตือนในเว็บ อีเมล SMS และ LINE Official Account ตั้งค่าเกณฑ์ได้เอง เช่น แบตต่ำกว่า 30% หรือรถออฟไลน์เกิน 30 นาที'],
  ['ข้อมูลปลอดภัยและเป็นไปตาม PDPA หรือไม่?', 'ข้อมูลเข้ารหัสทั้งระหว่างส่งและจัดเก็บ กำหนดสิทธิ์ผู้ใช้ตามบทบาท และมีบันทึกการเข้าถึงข้อมูลตำแหน่งของพนักงานขับรถ'],
]

export function Faq() {
  return (
    <section className="section" id="faq">
      <div className="wrap-x">
        <div className="section-h">
          <span className="kicker">คำถามที่พบบ่อย</span>
          <h2>สิ่งที่ผู้จัดการกองยานมักถาม</h2>
        </div>
        <div className="faq">
          {FAQ.map(([q, a], i) => (
            <details key={q} open={i === 0}>
              <summary>
                {q} <span><Icon name="chevron" /></span>
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

export function CtaBand() {
  return (
    <section className="section" id="demo" style={{ paddingTop: 0 }}>
      <div className="wrap-x">
        <div className="cta-band">
          <div>
            <h2>พร้อมเริ่มบริหารกองยาน EV แล้วหรือยัง?</h2>
            <p>นัดคุยกับผู้เชี่ยวชาญ หรือทดลองใช้แดชบอร์ดตัวอย่างได้ทันที</p>
          </div>
          <div className="flex wrap">
            <Link className="btn btn-white btn-lg" href="/login">
              ขอเดโม
            </Link>
            <LinkButton href="/dashboard" variant="light" size="lg">
              ดูแดชบอร์ด
            </LinkButton>
          </div>
        </div>
      </div>
    </section>
  )
}

export function SiteFooter() {
  return (
    <footer className="site-foot">
      <div className="wrap-x">
        <div className="foot-grid">
          <div>
            <Brand />
            <p>ระบบบริหารกองยานรถยนต์ไฟฟ้าสำหรับองค์กรในประเทศไทย</p>
          </div>
          <div>
            <h4>โซลูชัน</h4>
            <Link href="/dashboard">แดชบอร์ด</Link>
            <Link href="/map">แผนที่สด</Link>
            <Link href="/charging">การชาร์จ</Link>
            <Link href="/reports">รายงาน</Link>
          </div>
          <div>
            <h4>บริษัท</h4>
            <a href="#">เกี่ยวกับเรา</a>
            <a href="#">พาร์ทเนอร์</a>
            <a href="#">ร่วมงานกับเรา</a>
            <a href="#">ติดต่อ</a>
          </div>
          <div>
            <h4>ช่วยเหลือ</h4>
            <a href="#faq">คำถามที่พบบ่อย</a>
            <a href="#">คู่มือการใช้งาน</a>
            <a href="#">นโยบายความเป็นส่วนตัว</a>
            <a href="#">เงื่อนไขการใช้งาน</a>
          </div>
        </div>
        <div className="foot-bottom">
          <span>© 2026 EV Monitor. สงวนลิขสิทธิ์</span>
          <span>เชียงใหม่ ประเทศไทย</span>
        </div>
      </div>
    </footer>
  )
}
