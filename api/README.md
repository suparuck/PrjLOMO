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
| auth | `POST /auth/login` · `POST /auth/logout` · `GET /auth/me` |
| สาธารณะ | `GET /public/overview` (ตัวเลขรวม ไม่มีข้อมูลรายคัน — ใช้กับ Landing/Login) |
| รถ | `GET /vehicles` · `GET /vehicles/:id` (คนขับ กราฟ SoC 24 ชม. ทริป บำรุงรักษา) · `POST /vehicles` · `PATCH /vehicles/:id` · `POST /vehicles/:id/maintenance` · `POST /maintenance/:id/complete` |
| คนขับ | `GET /drivers` · `GET /drivers/events` · `POST /drivers` · `PATCH /drivers/:id` |
| การชาร์จ | `GET /stations` · `GET /charging/sessions` · `GET /charging/history` · `GET /charging/load` · `PATCH /charging/sessions/:vehicleId/target` · `POST /charging/sessions/:vehicleId/stop` |
| แจ้งเตือน | `GET /alerts` · `GET /alerts/stats` · `POST /alerts/:id/ack` · `POST /alerts/ack-all` · `GET/PATCH /alert-rules` · `GET /notification-channels` |
| รายงาน/แดชบอร์ด | `GET /reports?period=year\|q3\|sep&brand=all\|BYD\|MG` · `GET /reports/electrification` · `GET /ice-vehicles` · `GET /energy/week` · `GET /energy/summary` · `GET /sustainability` · `GET /battery/insights` |
| ตั้งค่า | `GET /org` · `GET/PUT /settings` · `GET /integrations` · `GET /users` · `POST /users/invite` · `GET/POST /api-keys` · `DELETE /api-keys/:id` |

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
cd api && npm test                    # 55 การทดสอบ — สร้างฐานข้อมูล evmonitor_test ใหม่จาก db/init/*.sql ทุกครั้ง
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
- **ยังไม่ทำ**: ตรวจ "รถออฟไลน์" อัตโนมัติ (ต้องมี job ตามเวลา) · ตอบรับคำเชิญ/ตั้งรหัสผ่านผู้ใช้ใหม่ · ส่งอีเมล/LINE/SMS จริง · เพิกถอน JWT
