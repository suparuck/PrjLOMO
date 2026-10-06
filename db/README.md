# ฐานข้อมูล EV Monitor (PostgreSQL 16)

container แยกต่างหาก สร้างจาก `db/Dockerfile` สคริปต์ใน `init/` ทำงาน **ครั้งเดียวตอน volume ว่าง** (ตามลำดับชื่อไฟล์):

| ไฟล์ | เนื้อหา |
|---|---|
| `01_schema.sql` | ตาราง ชนิดแจงนับ index trigger และ view |
| `02_reference.sql` | ค่าตั้งต้นของระบบ: ตั้งค่าองค์กร ผู้ใช้เดโม รุ่นรถ สถานีชาร์จ กฎแจ้งเตือน การเชื่อมต่อ ค่าสมมติฐานรายงาน |
| `03_demo_data.sql` | ข้อมูลเดโมที่ย้ายมาจาก mockup เดิม (รถ 12 คัน คนขับ 12 คน ทริป 733 เที่ยง ฯลฯ) — **ลบ/ไม่รันเมื่อใช้งานจริง** |

```bash
docker compose down -v && docker compose up -d --build   # ล้างข้อมูลทั้งหมดแล้วสร้างใหม่จากสคริปต์
docker compose exec db psql -U evm -d evmonitor           # เข้า psql
```

> เวลาในข้อมูลเดโมสร้างแบบ **สัมพันธ์กับ `now()` ตอน init** (เช่น "เริ่มชาร์จ 25 นาทีก่อน") ข้อมูลสถิติ 30 วัน (ทริป/เหตุการณ์ขับขี่) จะลดลงเมื่อเวลาผ่านไปหากไม่มีข้อมูลใหม่ส่งเข้ามา — รีเซ็ตด้วยคำสั่งด้านบนเมื่อต้องการข้อมูลเดโมสด

## โครงสร้าง

```
app_settings (แถวเดียว)        ตั้งค่าองค์กร/เกณฑ์แจ้งเตือน/การชาร์จ + เมืองและจุดกึ่งกลางแผนที่
users, api_keys                 ผู้ใช้ (bcrypt ผ่าน pgcrypto) และ API key (เก็บ sha256)
integrations                    การเชื่อมต่อกับระบบภายนอก

vehicle_models ← vehicles ─┬─ vehicle_telemetry   ประวัติ telemetry (สถานะล่าสุดอยู่ในแถว vehicles)
        drivers ───────────┤  trips               ทริปที่จบแล้ว (ผลรวมเป็นสถิติ 30 วันของคนขับ)
                           ├─ driving_events      เบรกแรง/ขับเร็ว/เร่งแรง/จอดติดเครื่องนาน
                           ├─ maintenance_tasks   งานบำรุงรักษา
                           └─ charging_sessions → stations   (active | completed | stopped)
charging_load                   โหลดการชาร์จรายชั่วโมง (kW)
alerts, alert_rules, notification_channels
energy_daily, energy_monthly    พลังงาน/ค่าใช้จ่าย/CO₂ (รายเดือนรายคัน → ตัวกรองยี่ห้อมีผลจริง)
fleet_soh_monthly, ice_vehicles, tco_items, report_config   ข้อมูลรายงานและค่าสมมติฐาน
v_driver_stats (view)           km/ทริป/เหตุการณ์ 30 วันของคนขับ คำนวณจากตารางจริง
```

กฎที่บังคับในฐานข้อมูลเอง (ไม่พึ่งแค่ API): รถ 1 คันมีเซสชันที่ `active` ได้ครั้งเดียว (unique partial index) · คนขับ 1 คนประจำรถได้ 1 คัน · ทะเบียน/เบอร์โทร/อีเมลไม่ซ้ำ · ช่วงค่าของ SoC/ความจุแบต/คะแนน · เซสชัน `active` ต้องไม่มี `ended_at` และกลับกัน

## อัปเกรดฐานข้อมูลที่มีอยู่แล้ว

สคริปต์ใน `init/` รันเฉพาะตอนสร้าง volume ใหม่ — ฐานข้อมูลที่รันอยู่ให้รันไฟล์ใน `db/migrations/` ตามลำดับ (เขียนให้รันซ้ำได้ปลอดภัย; `init/` เป็นเวอร์ชันล่าสุดเสมอ):

```bash
docker compose exec -T db psql -U evm -d evmonitor -v ON_ERROR_STOP=1 < db/migrations/001_invite_tokens.sql
```

| ไฟล์ | เปลี่ยนอะไร |
|---|---|
| `001_invite_tokens.sql` | ตอบรับคำเชิญ: เพิ่ม `users.invite_token_hash`, `users.invite_expires_at` |
| `002_password_reset.sql` | ลืม/เปลี่ยนรหัสผ่าน: เพิ่ม `users.session_version` และตาราง `password_resets` |
| `003_report_schedules.sql` | ตั้งเวลาส่งรายงานทางอีเมล: ตาราง `report_schedules` |

## ข้อควรระวังด้านความปลอดภัย

- ผู้ใช้เดโมใน `02_reference.sql` ใช้รหัสผ่าน `demo1234` — **เปลี่ยนหรือลบก่อนขึ้นระบบจริง**
- รหัสผ่านฐานข้อมูลมาจาก `.env` (`POSTGRES_PASSWORD`) พอร์ตเปิดที่ `127.0.0.1` เท่านั้น
- ข้อมูลอยู่ใน named volume `pgdata` — สำรองด้วย `docker compose exec db pg_dump -U evm evmonitor > backup.sql`
