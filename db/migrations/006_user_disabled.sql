-- ปิดใช้งานบัญชีผู้ใช้: เพิ่มสถานะ 'disabled' (เข้าสู่ระบบไม่ได้ session ที่มีอยู่ใช้ไม่ได้ทันที แต่เก็บบัญชีไว้เปิดใหม่ได้)
-- ใช้กับฐานข้อมูลที่สร้างไปแล้ว (ติดตั้งใหม่ใช้ db/init/01_schema.sql) รันซ้ำได้ปลอดภัย
--   docker compose exec -T db psql -U evm -d evmonitor -v ON_ERROR_STOP=1 < db/migrations/006_user_disabled.sql
alter type user_status add value if not exists 'disabled';
