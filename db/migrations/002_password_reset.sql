-- ลืม/เปลี่ยนรหัสผ่าน: เพิ่ม session_version (เพิกถอน session เดิมเมื่อเปลี่ยนรหัส) และตารางลิงก์รีเซ็ต
-- ใช้กับฐานข้อมูลที่สร้างไปแล้ว (ติดตั้งใหม่ใช้ db/init/01_schema.sql ซึ่งรวมไว้แล้ว) — รันซ้ำได้ปลอดภัย
--   docker compose exec -T db psql -U evm -d evmonitor -v ON_ERROR_STOP=1 < db/migrations/002_password_reset.sql
alter table users add column if not exists session_version integer not null default 1;

create table if not exists password_resets (
  token_hash   text primary key,
  user_id      uuid not null references users(id) on delete cascade,
  expires_at   timestamptz not null,
  used_at      timestamptz,
  requested_by text not null default 'self' check (requested_by in ('self', 'admin')),
  created_at   timestamptz not null default now()
);
create index if not exists password_resets_user_idx on password_resets (user_id, created_at desc);
