# EV Monitor — Design Handoff

สเปกสำหรับสร้างเว็บแอปจริงจากต้นแบบใน `design/prototype/`
ธีมอ้างอิง: หน้าโซลูชัน EV ของ Webfleet (navy + ขาว, CTA แดง, การ์ดเรียบ เส้นบาง)

---

## 1. หน้าและเส้นทาง (Routes)

| Route | ไฟล์ต้นแบบ | Layout | เนื้อหาหลัก |
|---|---|---|---|
| `/` | index.html | Public | Landing: nav, hero + mock แดชบอร์ด, การ์ดฟีเจอร์ 6 ใบ, split blocks 3 ชุด, stats band, FAQ accordion, CTA band, footer |
| `/login` | login.html | Auth | แบ่งจอซ้าย (ภาพ/ข้อความ) ขวา (ฟอร์มอีเมล รหัสผ่าน จดจำฉัน SSO) |
| `/dashboard` | dashboard.html | App | KPI 5 ใบ, แผนที่ย่อ, donut แบต + แถบ 3 ระดับ, ตารางรถ 7 แถว, กราฟพลังงานสลับ kWh/฿, แจ้งเตือนล่าสุด 5 รายการ, เซสชันชาร์จ, การ์ดความยั่งยืน + banner |
| `/map` | map.html | App (เต็มจอ) | รายการรถด้านซ้าย (ค้นหา + chips สถานะ), แผนที่เต็ม, overlay เปิด/ปิดชั้นข้อมูล (รถ, Depot, สาธารณะ, รัศมีระยะวิ่ง), กล่องสถิติลอย; คลิกรายการ → flyTo + popup |
| `/alerts` | alerts.html | App | KPI 4 ใบ, chips ระดับความรุนแรง + select ประเภท, รายการแจ้งเตือน (รับทราบทีละรายการ/ทั้งหมด), กฎแจ้งเตือน (switch), ช่องทางแจ้งเตือน |
| `/vehicles` | vehicles.html | App | KPI 4 ใบ, chips สถานะพร้อมจำนวน, ค้นหา, เรียงลำดับ, ส่งออก CSV, ปุ่มเพิ่มรถ, ตาราง 10 คอลัมน์, รองรับ `?q=` จากช่องค้นหาด้านบน |
| `/vehicles/:id` | vehicle.html?id= | App | gauge แบต, หัวข้อ + badge, 4 facts, กราฟ SoC 24 ชม., แผนที่ตำแหน่ง, ข้อมูลรถ, คนขับประจำ (ring score), บำรุงรักษา, ประวัติทริป |
| `/battery` | battery.html | App | KPI 4 ใบ, bar แนวนอน SoC/ระยะวิ่ง + เส้นเกณฑ์ 30%, รถที่ต้องชาร์จ, คำแนะนำ, แนวโน้ม SoH, ระยะวิ่งตามรุ่น, ตารางรายคัน |
| `/charging` | charging.html | App | KPI 4 ใบ, เซสชันที่กำลังชาร์จ (progress + เป้าหมาย), โหลดรายชั่วโมง (ไฮไลต์ On-Peak), การ์ดสถานี (กรอง Depot/สาธารณะ), ประวัติการชาร์จ |
| `/drivers` | drivers.html | App | KPI 4 ใบ, ตารางอันดับ (ค้นหา), donut ประเภทเหตุการณ์, การ์ดโปรไฟล์คนขับ |
| `/reports` | reports.html | App | ตัวกรองช่วงเวลา/รถ, ส่งออก PDF/Excel, แท็บ: `energy`, `co2`, `electrify`, `usage` (เปิดแท็บจาก hash ได้ เช่น `#electrify`) |
| `/settings` | settings.html | App | เมนูย่อยซ้าย (scroll-spy): องค์กร, เกณฑ์แจ้งเตือน (slider), การชาร์จและค่าไฟ, ผู้ใช้และสิทธิ์, การเชื่อมต่อ, ช่วยเหลือ |

Layout `App` = Sidebar (เมนู 3 กลุ่ม: ภาพรวม / ยานพาหนะ / การจัดการ, badge จำนวนแจ้งเตือนที่ยังไม่รับทราบ) + Topbar (ชื่อหน้า, คำอธิบาย, ค้นหา, กระดิ่ง, เมนูผู้ใช้) + Footer

---

## 2. คอมโพเนนต์ร่วม (ดึงจาก style.css / app.js)

`AppShell, Sidebar, Topbar, PublicNav, PublicFooter, Card (+ CardHeader), KpiCard, StatusBadge, SocBar, ProgressBar, Chip/ChipGroup, Segmented, Tabs, DataTable, SearchInput, Select, Switch, RangeField, Button (primary/navy/outline/ghost/light × sm/md/lg), Icon, ListItem, AlertRow, ChargingSessionCard, StationCard, DriverCard, ScoreRing, BatteryGauge, DonutChart, FleetMap (VehicleMarker, StationMarker, VehiclePopup), Banner, EmptyState`

Chart.js defaults ที่ต้องคงไว้: ฟอนต์ IBM Plex Sans Thai 12px, สีข้อความ `--muted`, กริด `#E6EBF1`, ไม่มีเส้นขอบแกน, tooltip พื้น `--ink` มุม 6px, legend แบบ point style

---

## 3. Data model (TypeScript)

```ts
type VehicleStatus = "driving" | "charging" | "parked" | "low" | "offline";
interface Vehicle { id: string; model: string; plate: string; driverId: string; soc: number; soh: number;
  range: number; speed: number; status: VehicleStatus; location: string; lat: number; lng: number;
  odometer: number; efficiency: number /* kWh/100km */; batteryKwh: number; }
interface Driver { id: string; name: string; phone: string; score: number; km: number; events: number; trips: number; }
interface Station { id: string; name: string; type: "depot" | "public"; network: string; lat: number; lng: number;
  ports: number; busy: number; power: string; pricePerKwh: number; }
interface ChargingSession { vehicleId: string; stationName: string; start: string; fromSoc: number; nowSoc: number;
  targetSoc: number; kw: number; kwh: number; cost: number; eta: string; }
interface ChargingHistory { vehicleId: string; stationName: string; date: string; duration: string; kwh: number;
  cost: number; fromSoc: number; toSoc: number; }
type AlertSeverity = "critical" | "warning" | "info";
type AlertType = "battery" | "charging" | "device" | "maint" | "driving" | "geofence";
interface Alert { id: number; severity: AlertSeverity; type: AlertType; title: string; text: string;
  vehicleId: string; time: string; acknowledged: boolean; }
interface IceVehicle { id: string; model: string; kmPerDay: number; maxKmPerDay: number; fuelPerMonth: number;
  readinessScore: number; recommendedEv: string; }
```
ข้อมูลตัวอย่างอยู่ใน `design/prototype/data.js` (ชื่อฟิลด์ในต้นแบบสั้นกว่า เช่น `driver`, `loc`, `odo`, `eff`, `sev`, `ack` — ให้ map เป็นชื่อด้านบน)

---

## 4. สิ่งที่ต้นแบบยังไม่ได้ทำ (ต้องสร้างในแอปจริง)
- ระบบ auth จริง + ป้องกัน route (ตอนนี้ปุ่ม login แค่ redirect)
- ฟอร์ม/โมดัล: เพิ่มรถ, เพิ่มคนขับ, เชิญผู้ใช้, ปรับเป้าหมายชาร์จ, หยุดชาร์จ (ต้องยืนยันก่อน)
- ส่งออก Excel/PDF จริง (ตอนนี้มีแค่ CSV ในหน้ารถ และ PDF ใช้ `window.print()`)
- บันทึกการตั้งค่า, สถานะรับทราบแจ้งเตือนแบบถาวร
- ข้อมูลเรียลไทม์ (WebSocket/polling ทุก 15–30 วินาที) สำหรับแผนที่ แบต และการชาร์จ
- Pagination ในตารางรถ, ตัวกรองรายงานให้มีผลกับกราฟ
- ตัวเลขสรุปบางตัวในต้นแบบเป็นค่าคงที่ (เช่น CO₂ 32.1 ตัน, TCO) — ต้องคำนวณจากข้อมูลจริง

---

## 5. แผนงานแนะนำ
1. **Setup** — scaffold Vite + React + TS, ย้าย tokens/ฟอนต์, ตั้ง ESLint/Prettier, `git init`
2. **Shell & UI kit** — AppShell, Sidebar, Topbar, Card, KpiCard, Badge, SocBar, Button, Table, Chips, Tabs, Icon
3. **Mock API** — types + `src/api/*` คืนข้อมูลจาก data.js (แบบ async)
4. **หน้าหลัก** — Dashboard, Vehicles, Vehicle detail, Map
5. **หน้ารอง** — Battery, Charging, Drivers, Alerts
6. **Reports & Settings**
7. **Landing & Login**
8. **ตรวจรับ** — responsive (1440 / 1024 / 390px), เทียบหน้าจอกับต้นแบบ, ไม่มี console error, `npm run build` ผ่าน

## 6. เกณฑ์ตรวจรับ
- ทุก route เปิดได้และหน้าตาตรงกับต้นแบบที่ 1440px และ 390px
- Interaction ในต้นแบบทำงานครบ (ค้นหา กรอง เรียง สลับกราฟ แท็บ รับทราบแจ้งเตือน ชั้นแผนที่ scroll-spy)
- ไม่มีสีหรือขนาดฟอนต์นอก token
- `npm run dev` และ `npm run build` ผ่านบน Windows

---

## 7. Prompt เริ่มต้นสำหรับ Claude Code

```
อ่าน CLAUDE.md และ design/HANDOFF.md แล้วเปิดดูต้นแบบใน design/prototype/
จากนั้นสร้างเว็บแอปจริงตาม stack ที่แนะนำ เริ่มจากเฟส 1–3 (Setup, Shell & UI kit, Mock API)
และทำหน้า Dashboard ให้เสร็จก่อนเป็นหน้าแรก ให้หน้าตาเหมือนต้นแบบ
ก่อนเขียนโค้ด สรุปแผนและโครงสร้างโฟลเดอร์ให้ดูก่อน
```
