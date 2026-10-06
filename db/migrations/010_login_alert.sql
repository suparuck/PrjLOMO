-- แจ้งเตือนเจ้าของบัญชีทางอีเมลเมื่อมีคนพยายามเข้าสู่ระบบผิดซ้ำ: เก็บเวลาที่แจ้งล่าสุด (กันส่งถี่/ถูกใช้สแปมกล่องจดหมายเจ้าของ)
-- ใช้กับฐานข้อมูลที่สร้างไปแล้ว (ติดตั้งใหม่ใช้ db/init/01_schema.sql) รันซ้ำได้ปลอดภัย
--   docker compose exec -T db psql -U evm -d evmonitor -v ON_ERROR_STOP=1 < db/migrations/010_login_alert.sql
alter table users add column if not exists login_alert_at timestamptz;
