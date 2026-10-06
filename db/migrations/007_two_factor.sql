-- การยืนยันตัวตนสองขั้นตอน (TOTP): ความลับที่เข้ารหัสแล้ว, เวลาที่เปิดใช้, ช่วงเวลาล่าสุดที่ใช้ (กันเล่นซ้ำ) และรหัสสำรอง
-- ใช้กับฐานข้อมูลที่สร้างไปแล้ว (ติดตั้งใหม่ใช้ db/init/01_schema.sql) รันซ้ำได้ปลอดภัย
--   docker compose exec -T db psql -U evm -d evmonitor -v ON_ERROR_STOP=1 < db/migrations/007_two_factor.sql
alter table users add column if not exists totp_secret_enc text;
alter table users add column if not exists totp_enabled_at timestamptz;
alter table users add column if not exists totp_last_step bigint not null default 0;

create table if not exists user_recovery_codes (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references users(id) on delete cascade,
  code_hash  text not null,
  used_at    timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, code_hash)
);
