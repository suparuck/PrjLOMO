# ฐานข้อมูล EV Monitor (PostgreSQL 16)

container แยกต่างหาก สร้างจาก `db/Dockerfile` สคริปต์ใน `init/` ทำงาน **ครั้งเดียวตอน volume ว่าง** (ตามลำดับชื่อไฟล์):

| ไฟล์ | เนื้อหา |
|---|---|
| `01_schema.sql` | ตาราง ชนิดแจงนับ index trigger และ view |
| `02_reference.sql` | ค่าตั้งต้นที่ **ทุกการติดตั้งต้องมี**: ตั้งค่าองค์กร (ชื่อกลาง กรุงเทพฯ) รุ่นรถ กฎแจ้งเตือน ช่องทางแจ้งเตือน การเชื่อมต่อ (ยังไม่เชื่อมสิ่งใด) ค่าสมมติฐานรายงาน — ไม่มีผู้ใช้/รถ/คนขับ/สถานี |
| `03_demo.sh` | ตัวควบคุมตอน init: `SEED_DEMO=true` (ค่าเริ่มต้น) รัน `demo/demo_seed.sql` · `SEED_DEMO=false` = **กองยานว่างเปล่า** · ตั้งชื่อองค์กร/เมือง/จุดกึ่งกลางแผนที่จาก `ORG_NAME` `FLEET_NAME` `ORG_CITY` `ORG_LAT` `ORG_LNG` |
| `../demo/demo_seed.sql` | ข้อมูลเดโม: ปรับองค์กรเป็นเชียงใหม่ ผู้ใช้เดโม 3 คน สถานีชาร์จ 6 แห่ง รถ 12 คัน คนขับ 12 คน ทริป 733 เที่ยว ประวัติ แจ้งเตือน ฯลฯ (เวลาสัมพันธ์กับ `now()` ตอน init) — ไม่ถูกรันเมื่อ `SEED_DEMO=false` |

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
| `006_user_disabled.sql` | ปิดใช้งานบัญชีผู้ใช้: เพิ่มค่า `disabled` ให้ enum `user_status` |
| `005_alert_email_notified.sql` | แจ้งเตือนทางอีเมล: เพิ่ม `alerts.email_notified_at` |
| `004_alert_line_notified.sql` | แจ้งเตือนผ่าน LINE: เพิ่ม `alerts.line_notified_at` |
| `003_report_schedules.sql` | ตั้งเวลาส่งรายงานทางอีเมล: ตาราง `report_schedules` |

## ข้อควรระวังด้านความปลอดภัย

- ผู้ใช้เดโมใน `02_reference.sql` ใช้รหัสผ่าน `demo1234` — **เปลี่ยนหรือลบก่อนขึ้นระบบจริง**
- รหัสผ่านฐานข้อมูลมาจาก `.env` (`POSTGRES_PASSWORD`) พอร์ตเปิดที่ `127.0.0.1` เท่านั้น
- ข้อมูลอยู่ใน named volume `pgdata` — สำรองอัตโนมัติด้วย service `backup` (หัวข้อถัดไป) และ **ไฟล์สำรองมีข้อมูลส่วนบุคคลกับรหัสผ่านที่แฮชแล้ว ต้องเก็บรักษาเท่ากับฐานข้อมูลจริง**

## สำรองและกู้คืนฐานข้อมูล

service `backup` (เริ่มพร้อม `docker compose up -d`) ทำ `pg_dump` ทุกวันตอน **ตี 2 เวลาไทย** (และสำรองทันทีตอนเริ่มครั้งแรก) เก็บที่ `./backups` บนเครื่องโฮสต์:

- ไฟล์ชื่อ `evmonitor-YYYYMMDD-HHMMSS.dump` (เวลา UTC) รูปแบบ custom บีบอัด — เขียนเป็นไฟล์ชั่วคราวแล้วค่อยเปลี่ยนชื่อ และ **ตรวจว่าอ่านกลับได้ + มีข้อมูลตารางครบ** ก่อนนับว่าสำเร็จ (ไฟล์เสีย/ว่างจะไม่ถูกเก็บ)
- เก็บย้อนหลัง **14 วัน** แต่ **อย่างน้อย 3 ไฟล์ล่าสุดเสมอ** (กันลบจนเหลือศูนย์ถ้าระบบสำรองหยุดไปนาน) ปรับได้ด้วย `BACKUP_KEEP_DAYS` / `BACKUP_KEEP_MIN` / `BACKUP_HOUR_TH` / `BACKUP_DIR` ใน `.env`
- ล้มเหลวจะลองใหม่ทุก 15 นาที สูงสุด 4 ครั้ง; `docker compose ps` แสดง `backup` เป็น **unhealthy** ถ้าไม่มีไฟล์สำรองที่ใหม่กว่า 26 ชั่วโมง
- ไฟล์มีสิทธิ์อ่านได้เฉพาะเจ้าของ (`0600`) ใน container (บน Windows/ดิสก์ที่ไม่รองรับสิทธิ์ ให้ป้องกันที่โฟลเดอร์เอง)

```bash
docker compose logs backup                                  # ดูผลการสำรอง
docker compose exec -T backup sh /backup/backup.sh          # สำรองเดี๋ยวนี้
docker compose exec -T backup sh /backup/verify.sh          # ทดสอบกู้คืนจริง (ลงฐานข้อมูลชั่วคราว เทียบจำนวนแถว แล้วลบ)
docker compose exec -T backup sh /backup/restore.sh         # กู้ไฟล์ล่าสุดลงฐานข้อมูลใหม่ evmonitor_restore (ไม่แตะข้อมูลจริง)
docker compose exec -T backup sh /backup/restore.sh /backups/evmonitor-20261006-135143.dump
```

> **Windows + Git Bash:** Git Bash แปลง path ที่ขึ้นต้นด้วย `/` เป็น path ของ Windows จนคำสั่งข้างบนพัง ให้ตั้ง `MSYS_NO_PATHCONV=1` นำหน้า (หรือใช้ PowerShell/CMD ซึ่งไม่เป็น)

**กู้คืนจริงเมื่อข้อมูลหาย** (ทับฐานข้อมูลจริง — ข้อมูลปัจจุบันหายทั้งหมด):

```bash
docker compose stop api web                                 # ต้องไม่มีใครต่ออยู่
docker compose exec -T -e RESTORE_OVER_LIVE=yes-overwrite-live backup sh /backup/restore.sh /backups/<ไฟล์>.dump
docker compose start api web
```

หลังกู้ ถ้าเป็นไฟล์จากรุ่น schema เก่ากว่าปัจจุบัน ให้รัน migration ที่ขาดใน `db/migrations/` ตามลำดับ

**ข้อจำกัดที่ต้องรู้**
- ไฟล์สำรองอยู่ **เครื่องเดียวกับฐานข้อมูล** — ดิสก์เสีย/เครื่องหาย/ถูกเข้ารหัสด้วยแรนซัมแวร์ ก็หายพร้อมกัน ต้อง **คัดลอก `./backups` ออกไปเก็บนอกเครื่อง** เป็นระยะ (เช่น `robocopy`/`rsync`/object storage) และ `BACKUP_DIR` ควรชี้ไปดิสก์คนละลูกกับ volume ของฐานข้อมูล
- ไฟล์ **ไม่ได้เข้ารหัส** — ถ้าส่งออกนอกเครื่องให้เข้ารหัสระหว่างส่ง/เก็บ (เช่น `age`, `gpg`, หรือการเข้ารหัสของที่เก็บปลายทาง)
- สำรองแบบ logical วันละครั้ง: ข้อมูลหลังรอบสำรองล่าสุดอาจหายได้สูงสุด ~24 ชม. (ไม่ใช่ point-in-time recovery — ถ้าต้องการต้องเปิด WAL archiving)
- ทดสอบกู้คืนด้วย `verify.sh` เป็นระยะ (เช่นทุกเดือน และหลังเปลี่ยน schema) — ไฟล์สำรองที่ไม่เคยทดสอบกู้ยังไม่ถือว่าสำรองแล้ว
