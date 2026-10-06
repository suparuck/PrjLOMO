# PrjLOMO — EV Monitor (EV Fleet Management Web App)

## สถานะโครงการ
- ขั้นออกแบบเสร็จแล้ว: ต้นแบบ HTML/CSS/JS แบบคงที่ 12 หน้า อยู่ใน `design/prototype/`
- ระบบมี 3 container แยกกัน: `db/` (PostgreSQL 16, schema+seed ใน `db/init/*.sql`) · `api/` (Fastify+TypeScript, REST + /ingest, OpenAPI ที่ /docs) · `app/` (เว็บ Next.js เรียก API ผ่านพร็อกซี /api/v1) — รายละเอียดใน README ของแต่ละโฟลเดอร์
- เฟส 1–8 ของ HANDOFF + modal/ฟอร์ม 5 รายการ + ฐานข้อมูลและ API จริง เสร็จแล้ว (ไม่มี mock ในเว็บอีก) ข้อมูลที่เพิ่ม/แก้บันทึกถาวรใน PostgreSQL
- มี job ตรวจรถออฟไลน์ใน API (`api/src/services/jobs.ts`, ทุก 60 วินาที, เกณฑ์จากหน้าตั้งค่า) และการตอบรับคำเชิญ (ลิงก์ `/invite/<โทเคน>` ใช้ครั้งเดียว อายุ 7 วัน), ลืมรหัสผ่าน (`/forgot-password` → ลิงก์ `/reset-password/<โทเคน>` ใช้ครั้งเดียว 60 นาที) และเปลี่ยนรหัสผ่านที่ `/account` — เปลี่ยน/รีเซ็ตรหัสแล้ว session ทุกเครื่องหลุด (`users.session_version`; guard ของ API อ่านผู้ใช้จากฐานข้อมูลทุก request) — ข้อมูลเดโมไม่มี telemetry จึงต้องเปิดตัวจำลอง `docker compose --profile demo up -d` ไม่เช่นนั้นรถจะออฟไลน์หมดใน ~30 นาที
- ยังไม่ทำ: SMS, ส่งออก PDF แบบไฟล์จากเซิร์ฟเวอร์ (ตอนนี้ PDF = พิมพ์หน้ารายงานด้วย print CSS; Excel สร้างที่ API ด้วย exceljs: `GET /reports/export?kind=report|esg&period&brand`), LINE/SMS (อีเมลคำเชิญและลืมรหัสผ่านส่งผ่าน SMTP_URL — ไม่ตั้งค่า = ไม่ส่ง ผู้ดูแลส่งลิงก์คำเชิญ/รีเซ็ตเองจากหน้าตั้งค่า)
- ตั้งเวลาส่งรายงาน: ตาราง `report_schedules` (เวลาไทย รายวัน/สัปดาห์/เดือน) · job ใน `startJobs` ทุก 60 วินาที ส่งอีเมลสรุปตัวเลข (ข้อความล้วน + ลิงก์หน้ารายงาน + แนบ Excel ฉบับเต็ม `api/src/services/reportXlsx.ts` — สร้างไฟล์ไม่ได้ก็ส่งอีเมลสรุปโดยไม่แนบ) ผ่านตัวส่งอีเมลเดียวกับลืมรหัสผ่าน — ไม่ตั้ง SMTP_URL = บันทึกตารางได้แต่ส่งไม่ได้ (UI แจ้ง); จัดการได้เฉพาะ manager ขึ้นไป
- แบ่งหน้าฝั่ง API (opt-in: ส่ง `page` มาถึงได้ซอง `{items,total,page,pageSize,pages,summary?}` ไม่ส่งได้อาร์เรย์เดิม; `pageSize` ≤ 100): `GET /vehicles` (q, status, sort + summary ทั้งกอง), `GET /alerts` (severity, type + summary ตามระดับ), `GET /charging/history`, `GET /drivers` (q + อันดับรวม + รถประจำ + summary), `GET /users` (q) — helper ที่ `api/src/lib/paging.ts`, เว็บใช้ `api.list*Page` + `Pager`/`pagerOf`
- แจ้งเตือนเข้า LINE: Messaging API push (LINE Notify ปิดแล้ว) ตั้ง `LINE_CHANNEL_ACCESS_TOKEN` + `LINE_TO` ใน `.env` (ไม่ตั้ง = ไม่ส่ง; สถานะ "เชื่อมต่อ" ในหน้าตั้งค่าตามค่าจริง) — job อ่านตาราง `alerts` ทุก 15 วินาที (`api/src/services/lineNotify.ts`) ส่งเฉพาะระดับวิกฤต/เตือน รวมเป็นข้อความเดียวต่อรอบ จอง `alerts.line_notified_at` กันซ้ำ ไม่แตะแจ้งเตือนที่มีก่อนเริ่มระบบ ไม่ส่งของที่เก่ากว่า 10 นาที และเคารพสวิตช์ `notify.line`; แผนฟรีของ LINE มีโควตาข้อความต่อเดือน
- อีเมลแจ้งเตือนเหตุการณ์: job เดียวกับ LINE (ตรวจทุก 15 วินาที, `api/src/services/emailNotify.ts`) ส่งให้ admin/manager ที่ active ฉบับเดียวต่อคนต่อรอบ (ระดับวิกฤต/เตือน) ผ่านตัวส่งอีเมลเดียวกับลืมรหัสผ่าน (ต้องตั้ง SMTP_URL) จอง `alerts.email_notified_at` กันซ้ำ ไม่แตะของที่มีก่อนเริ่มระบบ/เก่ากว่า 10 นาที เคารพสวิตช์ `notify.email`; ยังไม่มีการเลือกรับ/ไม่รับรายบุคคล และสวิตช์ `dailyDigest` ยังไม่ทำงาน
- แก้ไขผู้ใช้ (admin): `PATCH /users/:id` เปลี่ยนชื่อ/บทบาท/เปิด-ปิดบัญชี (`users.status = disabled`) — ปิดแล้ว session หลุดทันที เข้าสู่ระบบ/ลืมรหัส/รีเซ็ตไม่ได้ เปิดใหม่ใช้รหัสเดิมได้; ห้ามเปลี่ยนบทบาท/ปิดบัญชีตัวเอง และต้องเหลือ admin ที่ใช้งานอยู่ ≥ 1 คน (ล็อกแถว admin ในทรานแซกชัน); ผู้ที่ยังไม่ตอบรับคำเชิญแก้ไม่ได้
- เรียลไทม์: API มี `GET /stream` (SSE) ส่งเหตุการณ์ `change` (ไม่มีเนื้อข้อมูล) เมื่อมีคำขอแก้ข้อมูลสำเร็จหรือ job ตั้งรถออฟไลน์ → เว็บ (`LiveProvider`) สั่งให้หน้าที่ใช้ `useAsync(fn, deps, { live: true })` โหลดซ้ำเงียบ ๆ; ใช้ได้เฉพาะ API อินสแตนซ์เดียว (บัสอยู่ในหน่วยความจำ — ขยายหลายอินสแตนซ์ให้ย้ายไป Postgres LISTEN/NOTIFY)
- สำรองฐานข้อมูล: service `backup` ใน compose (สคริปต์ `db/backup/*.sh`) `pg_dump` รายวันตี 2 เวลาไทย → `./backups` (`BACKUP_DIR`) เก็บ 14 วัน/อย่างน้อย 3 ไฟล์ ตรวจไฟล์ก่อนนับว่าสำเร็จ healthcheck แจ้ง unhealthy ถ้าไฟล์เก่ากว่า 26 ชม.; `verify.sh` ทดสอบกู้คืนจริง, `restore.sh` ค่าเริ่มต้นกู้ลงฐานข้อมูลใหม่ (กู้ทับของจริงต้องตั้ง `RESTORE_OVER_LIVE=yes-overwrite-live`); ไฟล์สำรองอยู่เครื่องเดียวกับฐานข้อมูลและไม่เข้ารหัส — ดู `db/README.md`; สคริปต์ `.sh` ต้องเป็น LF (บังคับใน `.gitattributes`); Git Bash บน Windows ต้องตั้ง `MSYS_NO_PATHCONV=1` ตอน `docker compose exec ... sh /backup/...`
- Next 16: `params` ของ dynamic route เป็น **Promise** — server component ต้อง `await params`, client component ใช้ `use(params)` (ถ้าเขียน `params.id` ตรง ๆ จะได้ undefined แบบเงียบ ๆ ไม่ error ตอน build; เคยทำให้หน้ารายละเอียดรถ/คำเชิญ/รีเซ็ตรหัสพัง)
- HTTPS: service `caddy` (โปรไฟล์ `https`, `proxy/Caddyfile`) — ใบรับรอง Let's Encrypt อัตโนมัติ, HSTS, เขียนทับ `X-Forwarded-For`; ต้องตั้ง `.env` ทั้งชุด (`DOMAIN`, `ACME_EMAIL`, `COOKIE_SECURE=true`, `APP_BASE_URL=https://…`, `TRUST_FORWARDED_FOR=true`, `WEB_BIND=127.0.0.1`) ดู README หัวข้อ "เปิดใช้ HTTPS"; ทดสอบในเครื่องด้วย `DOMAIN=localhost` + `curl -k`
- ติดตั้งแบบกองยานว่างเปล่า: `SEED_DEMO=false` (+ `ORG_NAME`/`FLEET_NAME`/`ORG_CITY`/`ORG_LAT`/`ORG_LNG`) ใน `.env` ก่อนสร้างฐานข้อมูลครั้งแรก — `db/init/02_reference.sql` = ค่าอ้างอิงที่ทุกติดตั้งต้องมี (ไม่มีผู้ใช้/รถ/คนขับ/สถานี), `db/init/03_demo.sh` เลือกรัน `db/demo/demo_seed.sql` (ข้อมูลเดโมทั้งหมด รวมผู้ใช้ `demo1234`) ตาม `SEED_DEMO` (ค่าเริ่มต้น true); เทสต์: `startApp({ demo: false })` + `api/test/empty-fleet.test.ts`; **ทุกหน้าเว็บต้องรับมือข้อมูลว่างได้** (ไม่หารด้วยศูนย์ → แสดง "–" ไม่ใช่ NaN) — เพิ่มหน้าใหม่ต้องเช็กกรณีนี้; สถานีชาร์จจัดการได้ที่หน้า "การชาร์จ" (`POST/PATCH/DELETE /stations`, manager ขึ้นไป, รหัส S<ลำดับ> สร้างอัตโนมัติ, ลบไม่ได้ถ้ามีประวัติการชาร์จ) รถสันดาปและ TCO จัดการได้ที่รายงาน > ความพร้อมเปลี่ยนเป็น EV (`POST/PATCH/DELETE /ice-vehicles`, `GET/PUT /tco` — manager ขึ้นไป; `PUT /tco` แทนที่ทั้งชุด 1–12 รายการ, คะแนนความพร้อมกรอกเอง) และ **ไม่มี ingest endpoint สำหรับสร้างสถานี** (มีแต่ `PUT /ingest/stations/:id/occupancy`)
- บัญชีตั้งต้น: CLI `docker compose exec api node dist/cli.js create-admin|set-password|list-users|check-defaults|retire-defaults` (`api/src/cli.ts`, ตรรกะใน `services/accounts.ts`, ถามรหัสผ่านแบบซ่อนใน `lib/prompt.ts`, รหัสผ่านไม่รับทาง argv) — รหัสตั้งต้น `demo1234` อยู่ใน `lib/defaults.ts` + `DEFAULT_PASSWORDS` ของเว็บ (แก้คู่กัน) และถูกห้ามใช้ทุกช่องทาง; `GET /security/status` (admin) + แบนเนอร์ใน `AppShell` + ป้าย "รหัสตั้งต้น" ในตารางผู้ใช้; ไม่มีหน้า /setup บนเว็บโดยตั้งใจ (ใครเข้าถึงก่อนจะยึดระบบได้)
- ความปลอดภัย: อ่าน `SECURITY.md` ก่อนขึ้น production (ผลทบทวน สิ่งที่แก้แล้ว และรายการที่ต้องทำ: HTTPS, รหัสเดโม, สำรองฐานข้อมูล ฯลฯ); ล็อกอินจำกัดทั้งต่อ IP (30/นาที) และรายบัญชี (20 ผิด/15 นาที, `api/src/lib/loginGuard.ts`); `TRUST_PROXY_HOPS` (API) และ `TRUST_FORWARDED_FOR` (เว็บ) ต้องตั้งให้ตรงกับโครงสร้างพร็อกซีจริง
- การเปลี่ยน schema: แก้ `db/init/01_schema.sql` (ติดตั้งใหม่) **และ** เพิ่มไฟล์ใน `db/migrations/` (ฐานข้อมูลที่รันอยู่) — init รันเฉพาะตอน volume ว่าง
- รัน: `cp .env.example .env` (ตั้ง POSTGRES_PASSWORD, AUTH_SECRET) แล้ว `docker compose up --build -d` · ทดสอบ API: `cd api && npm test` (ดูวิธีตั้งค่าใน api/README.md)
- กฎซ้ำสองที่ที่ต้องแก้คู่กัน: validators ใน `app/src/lib/validators.ts` ↔ `api/src/lib/validators.ts`; AUTH_SECRET ต้องเหมือนกันทั้ง api และ web
- สเปกการส่งต่องานแบบละเอียด: `design/HANDOFF.md` — **อ่านไฟล์นี้ก่อนเริ่มงานทุกครั้ง**

## แหล่งอ้างอิงหลัก (Source of truth)
- หน้าตา/เลย์เอาต์: ไฟล์ `design/prototype/*.html` — แอปจริงต้องหน้าตาเหมือนต้นแบบ
- ระบบดีไซน์ (สี ตัวอักษร ระยะ คอมโพเนนต์): `design/prototype/style.css` (ตัวแปร CSS ใน `:root`)
- โครงเมนู ไอคอน helper: `design/prototype/app.js` (`NAV`, `ICON_PATHS`, `STATUS`, `socClass`)
- รูปแบบข้อมูลและข้อมูลตัวอย่าง: `design/prototype/data.js`

## Stack ที่ใช้จริง (ผู้ใช้สั่งเปลี่ยนจาก Vite เป็น Next.js)
- Next.js 16 (App Router) + React 19 + TypeScript (อัปเกรดจาก 14 เพื่อปิดช่องโหว่ — ดู `SECURITY.md`); ตัวกรองคำขอคือ `app/src/proxy.ts` (เดิมชื่อ middleware) ซึ่งตรวจ session และเก็บกวาด `X-Forwarded-For` ก่อนส่งต่อ API; lint ใช้ ESLint 9 flat config (`app/eslint.config.mjs`, `npm run lint` = `eslint src`)
- กราฟ: Chart.js + react-chartjs-2 · แผนที่: Leaflet + react-leaflet (tiles: OpenStreetMap — CARTO ต้องใช้ API key)
- สไตล์: `app/src/styles/tokens.css` (ตัวแปรทั้งหมด รวมสี/ขนาดฟอนต์ที่แตกออกจากต้นแบบ) + `global.css` (คลาสจากต้นแบบ) — **ไม่ใช้ Tailwind** เว้นแต่ผู้ใช้ขอ; ห้ามใส่ค่า hex/rgba/font-size ดิบนอก `tokens.css`
- ข้อมูล: `app/src/api/` เรียก API จริง (http.ts) แล้วแปลง DTO เป็นรูปที่หน้าเว็บใช้ (mappers.ts) · Backend: Fastify 5 + PostgreSQL 16 (ดู api/README.md)

## กฎการทำงาน
- ข้อความบนหน้าจอเป็นภาษาไทย ใช้ฟอนต์ IBM Plex Sans Thai
- ใช้ค่าสีจาก token เท่านั้น ห้าม hardcode สีใหม่ — CTA หลักสีแดง `--red`, แถบเมนู `--navy-900`
- สถานะรถมี 5 แบบ: driving, charging, parked, low, offline (สี/ชื่อไทยตาม `STATUS` ใน app.js)
- เกณฑ์แบต: ≥70% ดี (เขียว), 30–69% ปานกลาง (เหลือง), <30% ต่ำ (แดง)
- ต้องใช้ได้บนมือถือ: sidebar กลายเป็น off-canvas ที่ ≤900px (ดู media query ใน style.css)
- ใช้ไอคอนเส้นชุดเดียวกับต้นแบบ (หรือ lucide-react ที่หน้าตาใกล้เคียง) ห้ามใช้อีโมจิ
- เครื่องพัฒนาเป็น Windows — ใช้คำสั่ง/สคริปต์ที่รันบน Windows ได้
- ทำทีละเฟสตาม `design/HANDOFF.md` ตรวจหน้าจอเทียบต้นแบบก่อนปิดแต่ละเฟส
