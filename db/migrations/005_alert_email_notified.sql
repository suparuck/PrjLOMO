-- แจ้งเตือนทางอีเมล: ตัวจองการส่งต่อแจ้งเตือน (กันส่งซ้ำเมื่อมีหลาย API อินสแตนซ์)
-- ใช้กับฐานข้อมูลที่สร้างไปแล้ว (ติดตั้งใหม่ใช้ db/init/01_schema.sql) รันซ้ำได้ปลอดภัย
--   docker compose exec -T db psql -U evm -d evmonitor -v ON_ERROR_STOP=1 < db/migrations/005_alert_email_notified.sql
alter table alerts add column if not exists email_notified_at timestamptz;
