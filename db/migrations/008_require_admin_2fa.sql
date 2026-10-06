-- นโยบายบังคับ 2FA สำหรับผู้ดูแลระบบ (ตั้งที่ตั้งค่า > ความปลอดภัย) — ใช้กับฐานข้อมูลที่สร้างไปแล้ว รันซ้ำได้ปลอดภัย
--   docker compose exec -T db psql -U evm -d evmonitor -v ON_ERROR_STOP=1 < db/migrations/008_require_admin_2fa.sql
alter table app_settings add column if not exists require_admin_2fa boolean not null default false;
