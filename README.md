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

## เปิดใช้ HTTPS (Caddy)

service `caddy` เป็น reverse proxy ที่ขอและต่ออายุใบรับรอง Let's Encrypt ให้เอง ไม่ทำงานโดยปริยาย (โปรไฟล์ `https`):

1. ให้โดเมนของคุณ (เช่น `ev.company.co.th`) ชี้ DNS มาที่เครื่องนี้ และเปิดพอร์ต **80 และ 443** สู่อินเทอร์เน็ต (พอร์ต 80 จำเป็นต่อการออกใบรับรอง)
2. ตั้งค่าใน `.env` **ทั้งชุดนี้พร้อมกัน**:

```bash
DOMAIN=ev.company.co.th
ACME_EMAIL=ops@company.co.th          # แนะนำ: Let's Encrypt แจ้งเตือนเมื่อใบรับรองใกล้หมดอายุ
COOKIE_SECURE=true                    # cookie เข้าสู่ระบบส่งเฉพาะผ่าน HTTPS
APP_BASE_URL=https://ev.company.co.th # ลิงก์ในอีเมล (คำเชิญ/รีเซ็ตรหัส/รายงาน)
TRUST_FORWARDED_FOR=true              # เว็บใช้ IP ผู้เรียกจริงที่ Caddy ตั้งให้ (rate limit ต่อ IP)
WEB_BIND=127.0.0.1                    # ปิดการเข้าเว็บแบบ HTTP ตรงจากภายนอก — เข้าได้ผ่าน Caddy เท่านั้น
NEXT_PUBLIC_DEMO_LOGIN=               # เว้นว่าง (ไม่เติมรหัสเดโมในฟอร์ม)
```

3. `docker compose --profile https up -d` แล้วเปิด `https://<DOMAIN>` (HTTP จะถูกเปลี่ยนเป็น HTTPS อัตโนมัติ และส่ง HSTS)

**ทดสอบในเครื่องโดยไม่มีโดเมน:** ใช้ `DOMAIN=localhost` (ค่าเริ่มต้น) — Caddy ออกใบรับรองจาก CA ภายในของตัวเอง เบราว์เซอร์จะเตือนว่าไม่น่าเชื่อถือจนกว่าจะนำ root CA ของ Caddy (ใน volume `caddy_data` ที่ `/data/caddy/pki/authorities/local/root.crt`) ไปเชื่อถือ — ทดสอบด้วย `curl -k https://localhost` ได้ทันที

หมายเหตุ: ใบรับรองและกุญแจอยู่ใน volume `caddy_data` **อย่าลบ** (ขอใหม่บ่อยจะชนเพดานของ Let's Encrypt) · Caddy เขียนทับ `X-Forwarded-For` ด้วย IP ผู้เรียกจริง (ค่าที่ผู้โจมตีใส่มาไม่ผ่าน) และไม่หน่วงสตรีมเรียลไทม์ (SSE) · ถ้ามี reverse proxy/load balancer ของคุณอยู่หน้า Caddy อีกชั้น ต้องตั้งให้ส่ง IP จริงต่อมาและปรับ `header_up` ใน `proxy/Caddyfile` ให้ใช้ค่านั้น (ดู SECURITY.md)

## พัฒนา

```bash
docker compose up -d db api          # รันเฉพาะ db + api ใน Docker
cd app && npm install && API_INTERNAL_URL=http://localhost:4000 AUTH_SECRET=<ค่าเดียวกับ .env> npm run dev
cd api && npm test                   # ดูวิธีตั้งค่าใน api/README.md
```

## สถานะ

เฟส 1–8 ของ `design/HANDOFF.md` เสร็จ + ฟอร์ม/โมดัล + **ฐานข้อมูลจริงและ API** (แทน mock เดิมทั้งหมด) ข้อมูลที่เพิ่ม/แก้ผ่านหน้าเว็บบันทึกถาวรใน PostgreSQL
มี job ตรวจรถออฟไลน์ การตอบรับคำเชิญ (ลิงก์ใช้ครั้งเดียว) และลืม/เปลี่ยนรหัสผ่าน (อีเมลผ่าน SMTP; เดโมใช้ Mailpit: ตั้ง `SMTP_URL=smtp://mailpit:1025` ใน `.env` แล้ว `docker compose --profile demo up -d` อ่านอีเมลที่ http://localhost:8025) แล้ว
ที่ยังไม่ทำ: ส่งออก Excel/PDF จริง · pagination · SMS จริง — ดู `CLAUDE.md`
