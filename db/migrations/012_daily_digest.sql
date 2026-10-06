-- สรุปรายวันทางอีเมล: วันที่ (เวลาไทย) ที่ส่งสรุปล่าสุด — ใช้จองสิทธิ์ส่งวันละครั้งแบบอะตอมมิก (หลาย API อินสแตนซ์ไม่ส่งซ้ำ)
-- ใช้กับฐานข้อมูลที่สร้างไปแล้ว (ติดตั้งใหม่ใช้ db/init/01_schema.sql) รันซ้ำได้ปลอดภัย
--   docker compose exec -T db psql -U evm -d evmonitor -v ON_ERROR_STOP=1 < db/migrations/012_daily_digest.sql
alter table app_settings add column if not exists digest_last_date date;
