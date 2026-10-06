# EV Monitor API

REST API (Node.js 22 · Fastify 5 · TypeScript · PostgreSQL) — container แยกจากเว็บและฐานข้อมูล
เอกสาร interactive (OpenAPI/Swagger UI): **http://localhost:4000/docs** · ตรวจสุขภาพ: `GET /healthz`

## การยืนยันตัวตนและสิทธิ์

| ผู้เรียก | วิธี | ใช้กับ |
|---|---|---|
| ผู้ใช้ในเว็บ | cookie `ev_session` (httpOnly) จาก `POST /api/v1/auth/login` หรือ `Authorization: Bearer <JWT>` | endpoint ปกติ |
| อุปกรณ์/ระบบภายนอก | ส่วนหัว `X-API-Key: evm_...` (สร้างที่ **ตั้งค่า → การเชื่อมต่อ → สร้างคีย์** หรือ `POST /api-keys`) | `/api/v1/ingest/*` เท่านั้น |

บทบาท `viewer` < `manager` < `admin` (บังคับที่ API ทุก request):
**viewer** ดูรายงาน · **manager** ใช้งานปฏิบัติการทั้งหมด (รถ คนขับ ชาร์จ แจ้งเตือน) · **admin** เพิ่ม: แก้ตั้งค่า เชิญผู้ใช้ จัดการ API key
การตรวจสิทธิ์ทำก่อนตรวจ body เสมอ (ผู้ไม่มีสิทธิ์ได้ 401/403 ไม่ใช่ 400) · login จำกัด 10 ครั้ง/นาที/IP · API key เก็บเป็น sha256 ไม่เก็บคีย์เต็ม

ข้อผิดพลาดทุกชนิดมีรูปแบบเดียวกัน: `{ "error": { "code", "message", "fields": { "<ฟิลด์>": "<ข้อความ>" } } }`
(`400` รูปแบบข้อมูล · `401/403` สิทธิ์ · `404` ไม่พบ · `409` ค่าซ้ำ · `422` ผิดกฎของระบบ · `429` เรียกถี่เกิน)

## Endpoint

**อ่าน/จัดการข้อมูล** (prefix `/api/v1`)

| กลุ่ม | Endpoint |
|---|---|
| แบ่งหน้า | `GET /vehicles` · `GET /alerts` · `GET /charging/history` · `GET /drivers` (`q`; มี `rank` อันดับรวม รถประจำ และ `summary`) · `GET /users` (`q`) ส่ง `?page=1&pageSize=10` (≤100) ได้ซอง `{items,total,page,pageSize,pages}`; รถรองรับ `q` `status` `sort` (+`summary` ทั้งกอง), แจ้งเตือนรองรับ `severity` `type` (+`summary` ตามระดับ); ไม่ส่ง `page` = อาร์เรย์เดิม |
| ตั้งเวลาส่งรายงาน | `GET/POST /report-schedules` · `PUT/DELETE /report-schedules/:id` · `POST /report-schedules/:id/send-now` (manager ขึ้นไป) |
| LINE | `POST /integrations/line/test` (admin) ส่งข้อความทดสอบ; `GET /integrations` แสดงสถานะ LINE ตามการตั้งค่า token จริง |
| realtime | `GET /stream` (SSE: เหตุการณ์ `change` เมื่อข้อมูลเปลี่ยน — ต้องล็อกอิน; ตัดสตรีมเมื่อ session ถูกเพิกถอน) |
| auth | `POST /auth/login` · `POST /auth/logout` · `GET /auth/me` · `POST /auth/invite/lookup` · `POST /auth/invite/accept` (ผู้ถูกเชิญ ไม่ต้องล็อกอิน) · `POST /auth/change-password` (ล็อกอินอยู่) · `POST /auth/forgot-password` · `POST /auth/reset/lookup` · `POST /auth/reset/accept` (ไม่ต้องล็อกอิน) |
| สาธารณะ | `GET /public/overview` (ตัวเลขรวม ไม่มีข้อมูลรายคัน — ใช้กับ Landing/Login) |
| รถ | `GET /vehicles` · `GET /vehicles/:id` (คนขับ กราฟ SoC 24 ชม. ทริป บำรุงรักษา) · `POST /vehicles` · `PATCH /vehicles/:id` · `POST /vehicles/:id/maintenance` · `POST /maintenance/:id/complete` |
| คนขับ | `GET /drivers` · `GET /drivers/events` · `POST /drivers` · `PATCH /drivers/:id` |
| การชาร์จ | `GET /stations` · `GET /charging/sessions` · `GET /charging/history` · `GET /charging/load` · `PATCH /charging/sessions/:vehicleId/target` · `POST /charging/sessions/:vehicleId/stop` |
| แจ้งเตือน | `GET /alerts` · `GET /alerts/stats` · `POST /alerts/:id/ack` · `POST /alerts/ack-all` · `GET/PATCH /alert-rules` · `GET /notification-channels` |
| รายงาน/แดชบอร์ด | `GET /reports?period=year\|q3\|sep&brand=all\|BYD\|MG` · `GET /reports/electrification` · `GET /ice-vehicles` · `GET /energy/week` · `GET /energy/summary` · `GET /sustainability` · `GET /battery/insights` |
| ตั้งค่า | `GET /org` · `GET/PUT /settings` · `GET /integrations` · `GET /users` · `POST /users/invite` · `POST /users/:id/invite-link` · `POST /users/:id/reset-link` · `DELETE /users/:id` (ยกเลิกคำเชิญ) · `GET/POST /api-keys` · `DELETE /api-keys/:id` |

**ส่งข้อมูลเข้า** (`X-API-Key`) — แต่ละอันอัปเดตตารางหลัก *และ* ผลต่อเนื่อง

| Endpoint | ทำอะไร |
|---|---|
| `POST /ingest/telemetry` | ชุด telemetry ≤500 รายการ: บันทึกประวัติ → อัปเดตสถานะล่าสุด → คำนวณสถานะ (ชาร์จ > แบตต่ำ > ขับ > จอด) และระยะวิ่งคงเหลือ → **สร้างแจ้งเตือนอัตโนมัติ** เมื่อแบตข้ามเกณฑ์ต่ำ/วิกฤต หรือความเร็วเกินกำหนด (ตามกฎที่เปิดอยู่, ไม่แจ้งซ้ำ) · ข้อมูลที่เก่ากว่าสถานะล่าสุดเก็บประวัติแต่ไม่ย้อนสถานะ · รายการเสียถูกข้ามและรายงานใน `rejected` |
| `POST /ingest/charging/sessions` · `PATCH …/:vehicleId` · `POST …/:vehicleId/complete` | เริ่ม / อัปเดตความคืบหน้า / จบเซสชันชาร์จ (สถานะรถและแจ้งเตือนตามวงจร) |
| `PUT /ingest/stations/:id/occupancy` · `PUT /ingest/charging/load` | ช่องชาร์จที่ถูกใช้ · โหลดรายชั่วโมง |
| `POST /ingest/trips` · `POST /ingest/driving-events` · `PUT /ingest/drivers/:id/score` | ทริป (เข้าสถิติคนขับ 30 วัน) · เหตุการณ์การขับขี่ · คะแนน Eco-Driving |
| `PATCH /ingest/vehicles/:id` | SoH / เลขไมล์ |
| `PUT /ingest/energy/daily` · `PUT /ingest/energy/monthly` | พลังงานและค่าใช้จ่ายรายวัน / รายเดือนรายคัน (ใช้ในรายงาน) |
| `POST /ingest/alerts` | แจ้งเตือนจากระบบภายนอก |

```bash
curl -X POST http://localhost:4000/api/v1/ingest/telemetry \
  -H "X-API-Key: $INGEST_API_KEY" -H "Content-Type: application/json" \
  -d '{"readings":[{"vehicleId":"EV-001","soc":84,"speedKmh":52,"lat":18.79,"lng":98.99,"odometerKm":18450}]}'
```

> บน Windows: เมื่อ body มี **ภาษาไทย** อย่าส่งผ่าน `-d` ใน PowerShell/Git Bash (shell เข้ารหัสผิดจนกลายเป็น `?`) ให้เก็บเป็นไฟล์ UTF-8 แล้วใช้ `--data-binary @file.json`

## รัน / ทดสอบ

```bash
docker compose up --build -d          # ทั้งระบบ (root)
cd api && npm run dev                 # dev: ต้องมี DATABASE_URL และ AUTH_SECRET ใน environment
cd api && npm test                    # 70 การทดสอบ — สร้างฐานข้อมูล evmonitor_test ใหม่จาก db/init/*.sql ทุกครั้ง
```

ชุดทดสอบเชื่อม `postgres://evm:evm_dev@localhost:5433/postgres` โดยปริยาย — ตั้ง `TEST_ADMIN_URL` ให้ตรงกับรหัสผ่านใน `.env`
(`TEST_ADMIN_URL=postgres://evm:<POSTGRES_PASSWORD>@localhost:5433/postgres npm test`)

| ตัวแปร | ความหมาย |
|---|---|
| `DATABASE_URL` | ที่อยู่ PostgreSQL (จำเป็น) |
| `AUTH_SECRET` | คีย์เซ็น JWT ≥16 ตัวอักษร — **ต้องเหมือนกับของ web** (จำเป็น) |
| `INGEST_API_KEY` | ถ้าตั้ง จะสร้าง API key ตั้งต้นตอนเริ่ม (ถ้ายังไม่มี) |
| `COOKIE_SECURE` | `true` เมื่อใช้ HTTPS |
| `PORT` `HOST` `LOG_LEVEL` | ค่าเริ่มต้น `4000` `0.0.0.0` `info` |

## ข้อควรรู้ในการออกแบบ

- **รหัสผ่านตรวจในฐานข้อมูล** ด้วย bcrypt (`pgcrypto.crypt`) — API ไม่ต้องมีไลบรารี hash และไม่เห็น hash
- **JWT HS256 เซ็นด้วย `AUTH_SECRET`** ที่ API ออกให้ ส่วนเว็บ (middleware) ตรวจลายเซ็นด้วยคีย์เดียวกันเพื่อกันเข้าหน้า สิทธิ์จริงบังคับที่ API · ยังไม่มี token revocation (หมดอายุเองใน 12 ชม./30 วันถ้าจดจำ)
- **กฎซ้ำกับเว็บ**: `src/lib/validators.ts` ตรงกับ `app/src/lib/validators.ts` (เว็บใช้แจ้งผิดทันที API เป็นผู้ตัดสิน) — แก้กฎต้องแก้ทั้งสองที่
- **ค่าที่ยังเป็นการประมาณ** (ระบุในโค้ดและ `report_config`): อัตราการใช้งานรถในรายงาน (ประมาณจากเลขไมล์) · ระยะวิ่งใช้งานจริง = 86% ของสเปก · % เทียบปีก่อน/ช่วงก่อนที่ยังไม่มีข้อมูลย้อนหลัง
- **ยังไม่ทำ**: LINE/SMS จริง · ล็อกอินล้มเหลวซ้ำแล้วล็อกบัญชี (ตอนนี้จำกัดด้วย rate limit ต่อ IP)

## คำเชิญผู้ใช้

1. admin เรียก `POST /users/invite` → สร้างผู้ใช้สถานะ `invited` พร้อมโทเคนใช้ครั้งเดียว อายุ 7 วัน (คืน `inviteToken` **ครั้งเดียว** ฐานข้อมูลเก็บเฉพาะ sha256)
2. ถ้าตั้ง `SMTP_URL` ระบบส่งอีเมลคำเชิญให้เอง (คำตอบมี `emailed: true`; ส่งไม่สำเร็จไม่ทำให้การเชิญล้ม) — ไม่เช่นนั้น admin นำลิงก์ `<เว็บ>/invite/<โทเคน>` ไปส่งเอง
3. ผู้ถูกเชิญเปิดลิงก์ → เว็บเรียก `POST /auth/invite/lookup` ตรวจลิงก์ → กรอกชื่อ/รหัสผ่าน (≥8 ตัว มีทั้งตัวอักษรและตัวเลข) → `POST /auth/invite/accept` เปิดใช้บัญชี ตั้ง cookie เข้าสู่ระบบทันที และทำให้โทเคนใช้ซ้ำไม่ได้
4. ลิงก์หาย/หมดอายุ: `POST /users/:id/invite-link` สร้างใหม่ (ลิงก์เดิมใช้ไม่ได้ทันที) · `DELETE /users/:id` ยกเลิกคำเชิญ (ลบผู้ใช้ที่ใช้งานแล้วไม่ได้ → 409)

โทเคนส่งใน body ของ POST เสมอ (ไม่อยู่ใน URL ของ API) เพื่อไม่ให้ติด access log · ลิงก์ผิด/ถูกใช้แล้ว → 404 · หมดอายุ → 410 · ตอบรับจำกัด 10 ครั้ง/นาที/IP

## Job ตรวจรถออฟไลน์

ทำงานในโปรเซส API ทุก `OFFLINE_CHECK_INTERVAL_SECONDS` (ค่าเริ่มต้น 60, `0` = ปิด) — รถที่ไม่ส่ง telemetry นานกว่า **เกณฑ์ `offlineMinutes` ในหน้าตั้งค่า** (ปริยาย 30 นาที) จะถูกตั้งเป็น `offline` และสร้างแจ้งเตือน "รถออฟไลน์" หนึ่งรายการ (ตามกฎ `offline` ที่เปิดอยู่; ไม่แจ้งซ้ำถ้ามีของเดิมที่ยังไม่รับทราบ)
- รถที่ยังไม่เคยส่งข้อมูลเลย (`last_seen_at` ว่าง เช่น เพิ่งเพิ่มใหม่) ไม่ถูกแตะ
- รถส่งข้อมูลกลับมา → สถานะคำนวณใหม่เองใน `POST /ingest/telemetry` (ไม่ต้องมี job ฝั่งกลับมาออนไลน์)
- ใช้ advisory lock ในฐานข้อมูล: รัน API หลายอินสแตนซ์ได้ จะมีเพียงตัวเดียวที่ตรวจในแต่ละรอบ
- **ข้อมูลเดโมไม่มี telemetry ไหลเข้า** รถทั้งกองจึงถูกตั้งเป็นออฟไลน์หลังผ่านไปเกินเกณฑ์ — เปิดตัวจำลองเพื่อให้เดโมมีชีวิต: `docker compose --profile demo up -d` (`api/src/simulate.ts` ส่งข้อมูลผ่าน `/ingest/telemetry` ด้วย API key จริงทุก 30 วินาที เฉพาะรถที่ยังออนไลน์)

## เปลี่ยนรหัสผ่านและลืมรหัสผ่าน

- **session ถูกเพิกถอนได้**: ใน JWT มี `sv` = `users.session_version`; guard ทุกเส้นทางอ่านผู้ใช้จากฐานข้อมูลทุก request (บทบาท/สถานะ/`sv` ต้องตรง) — เปลี่ยน/รีเซ็ตรหัสผ่าน เปลี่ยนบทบาท หรือลบบัญชี มีผลทันที (ตอบ 401/403)
- **เปลี่ยนรหัสผ่าน** `POST /auth/change-password` (ต้องล็อกอิน): ส่ง `currentPassword` + `newPassword`; รหัสปัจจุบันผิดตอบ **422** (ไม่ใช่ 401 เพราะเว็บจะพาไปหน้าล็อกอิน); สำเร็จแล้ว `sv` +1 ทุกเครื่องหลุด และออก cookie ใหม่ให้เครื่องที่เปลี่ยน
- **ลืมรหัสผ่าน** `POST /auth/forgot-password`: ตอบ `{ok:true}` เหมือนกันเสมอ (ไม่บอกว่ามีอีเมลนี้หรือไม่ และส่งอีเมลในพื้นหลังเพื่อไม่ให้เวลาตอบรั่ว); ส่งเฉพาะบัญชี `active`; ผู้ใช้หนึ่งคนขอได้ไม่เกิน 3 ลิงก์ใน 15 นาที; rate limit 5 ครั้ง/นาที/IP
- **ลิงก์รีเซ็ต** `<APP_BASE_URL>/reset-password/<โทเคน>`: ใช้ครั้งเดียว อายุ 60 นาที เก็บเฉพาะ sha256 ส่งโทเคนใน body (ไม่อยู่ใน URL ของ API); `POST /auth/reset/lookup` ตรวจลิงก์ (404 ไม่ถูกต้อง/ใช้แล้ว, 410 หมดอายุ) → `POST /auth/reset/accept` ตั้งรหัสใหม่ ลิงก์อื่นที่ค้างของผู้ใช้นั้นดับ และทุก session หลุด
- **ผู้ดูแลช่วยรีเซ็ต** `POST /users/:id/reset-link` (admin): ได้ลิงก์ใช้ครั้งเดียวไปส่งต่อเอง — ผู้ดูแลไม่เห็น/ตั้งรหัสผ่านแทนผู้ใช้
- **อีเมล** (`api/src/services/mailer.ts`): `SMTP_URL` → ส่งผ่าน SMTP; `MAIL_MODE=log` เขียนอีเมลลง log (เฉพาะพัฒนา — ลิงก์รีเซ็ตจะอยู่ใน log); ไม่ตั้งอะไร = **ไม่ส่ง** (ปลอดภัยไว้ก่อน). ลิงก์สร้างจาก `APP_BASE_URL` เท่านั้น ไม่เชื่อ Host/Origin ของ request. เดโม: compose มี `mailpit` ใน profile `demo` (อ่านอีเมลที่ http://localhost:8025)

## แจ้งเตือนเข้า LINE

- ใช้ **LINE Messaging API (push)** — LINE Notify ปิดบริการแล้ว ต้องมี LINE Official Account: สร้าง Messaging API channel ใน LINE Developers Console แล้วออก *Channel access token (long-lived)*
- ตั้งใน `.env`: `LINE_CHANNEL_ACCESS_TOKEN` และ `LINE_TO` (userId / groupId / roomId ที่จะรับข้อความ — บอทต้องเป็นเพื่อนหรืออยู่ในกลุ่มนั้น) แล้วรีสตาร์ต API; ไม่ตั้ง = ไม่ส่ง
- ส่งเฉพาะแจ้งเตือนระดับ **วิกฤต/เตือน** ที่เกิดใหม่ (ไม่เกิน 10 นาที และเกิดหลังระบบเริ่มทำงาน) รวมเป็นข้อความเดียวต่อรอบ (ตรวจทุก 15 วินาที) เพื่อประหยัดโควตา — แผนฟรีของ LINE จำกัดจำนวนข้อความต่อเดือน
- เปิด/ปิดได้ที่ ตั้งค่า > เกณฑ์การแจ้งเตือน (สวิตช์ LINE) · ปุ่ม "ส่งทดสอบ" ที่ ตั้งค่า > การเชื่อมต่อ (admin) ใช้โควตา 1 ข้อความ
- token อยู่ใน environment ของ API เท่านั้น ไม่เก็บในฐานข้อมูลและไม่ส่งออกทาง API/log
