-- ตั้งค่าการรับอีเมลแจ้งเตือนรายบุคคล (alertEmail / loginFailed / newNetwork) — ไม่มีคีย์ = เปิด
-- ใช้กับฐานข้อมูลที่สร้างไปแล้ว (ติดตั้งใหม่ใช้ db/init/01_schema.sql) รันซ้ำได้ปลอดภัย
--   docker compose exec -T db psql -U evm -d evmonitor -v ON_ERROR_STOP=1 < db/migrations/011_notify_prefs.sql
alter table users add column if not exists notify_prefs jsonb not null default '{}'::jsonb;
