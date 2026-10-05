-- ตอบรับคำเชิญ: เพิ่มคอลัมน์โทเคนคำเชิญในตาราง users
-- ใช้กับฐานข้อมูลที่สร้างไปแล้ว (ติดตั้งใหม่ใช้ db/init/01_schema.sql ซึ่งรวมไว้แล้ว) — รันซ้ำได้ปลอดภัย
--   docker compose exec -T db psql -U evm -d evmonitor < db/migrations/001_invite_tokens.sql
alter table users add column if not exists invite_token_hash text;
alter table users add column if not exists invite_expires_at timestamptz;
create unique index if not exists users_invite_token_key on users (invite_token_hash) where invite_token_hash is not null;
