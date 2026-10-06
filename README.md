# EV Monitor

ระบบบริหารกองยานรถยนต์ไฟฟ้า — 3 container แยกกัน

```
 เบราว์เซอร์ ──► web  (Next.js 14)  ──/api/v1/*──►  api  (Fastify + TypeScript)  ──►  db  (PostgreSQL 16)
                :3000   หน้าเว็บ + พร็อกซี              :4000  REST + OpenAPI /docs         :5433 (เฉพาะเครื่องนี้)
                                                         ▲
                       อุปกรณ์ / ระบบภายนอก ──── X-API-Key ── /api/v1/ingest/*
```

| โฟลเดอร์ | หน้าที่ |
|---|---|
| [`db/`](db/README.md) | PostgreSQL: schema + ข้อมูลตั้งต้น/เดโม (สคริปต์ init) |
| [`api/`](api/README.md) | REST API: อ่าน/จัดการข้อมูล + `/ingest/*` ให้ระบบภายนอกส่งข้อมูลเข้า + สิทธิ์ตามบทบาท |
| `app/` | เว็บ Next.js: เรียก API ผ่าน `/api/v1` ใน origin เดียวกัน (cookie httpOnly ไม่ต้องตั้ง CORS) |
| `design/` | ต้นแบบ HTML และสเปก (`design/HANDOFF.md`) |

## เริ่มใช้งาน

```bash
cp .env.example .env     # แล้วตั้ง POSTGRES_PASSWORD และ AUTH_SECRET (ดูวิธีสุ่มค่าในไฟล์)
docker compose up --build -d
```

- เว็บ: http://localhost:3000 (ปรับพอร์ตด้วย `WEB_PORT`) — เข้าสู่ระบบเดโม `admin@evmonitor.co.th` / `demo1234`
  (ฟอร์มเติมให้อัตโนมัติเมื่อตั้ง `NEXT_PUBLIC_DEMO_LOGIN=อีเมล:รหัสผ่าน` ใน `.env`)
- เอกสาร API: http://localhost:4000/docs
- **รถเดโมจะเป็น "ออฟไลน์" หลังไม่มีข้อมูลเข้าเกิน 30 นาที** (job ตรวจออฟไลน์ของ API) — เปิดตัวจำลอง telemetry ด้วย `docker compose --profile demo up -d`
- ล้างข้อมูลแล้วสร้างใหม่จากข้อมูลเดโม: `docker compose down -v && docker compose up --build -d`

ผู้ใช้เดโม (รหัสผ่านเดียวกัน): `admin@evmonitor.co.th` (admin) · `prasit@company.co.th` (manager) · `wanna@company.co.th` (viewer — เห็นเฉพาะรายงาน)
**ข้อมูลเดโมและรหัสผ่านนี้ต้องลบ/เปลี่ยนก่อนใช้งานจริง** (ดู `db/README.md`)

## พัฒนา

```bash
docker compose up -d db api          # รันเฉพาะ db + api ใน Docker
cd app && npm install && API_INTERNAL_URL=http://localhost:4000 AUTH_SECRET=<ค่าเดียวกับ .env> npm run dev
cd api && npm test                   # ดูวิธีตั้งค่าใน api/README.md
```

## สถานะ

เฟส 1–8 ของ `design/HANDOFF.md` เสร็จ + ฟอร์ม/โมดัล + **ฐานข้อมูลจริงและ API** (แทน mock เดิมทั้งหมด) ข้อมูลที่เพิ่ม/แก้ผ่านหน้าเว็บบันทึกถาวรใน PostgreSQL
มี job ตรวจรถออฟไลน์ การตอบรับคำเชิญ (ลิงก์ใช้ครั้งเดียว) และลืม/เปลี่ยนรหัสผ่าน (อีเมลผ่าน SMTP; เดโมใช้ Mailpit: ตั้ง `SMTP_URL=smtp://mailpit:1025` ใน `.env` แล้ว `docker compose --profile demo up -d` อ่านอีเมลที่ http://localhost:8025) แล้ว
ที่ยังไม่ทำ: ส่งออก Excel/PDF จริง · อัปเดตเรียลไทม์ในหน้าเว็บ (ตอนนี้ต้องรีเฟรช) · pagination · LINE/SMS จริง และอีเมลคำเชิญ (ลิงก์คำเชิญต้องส่งต่อเอง) — ดู `CLAUDE.md`
