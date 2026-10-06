-- ตั้งเวลาส่งรายงานทางอีเมล — ใช้กับฐานข้อมูลที่สร้างไปแล้ว (ติดตั้งใหม่ใช้ db/init/01_schema.sql) รันซ้ำได้ปลอดภัย
--   docker compose exec -T db psql -U evm -d evmonitor -v ON_ERROR_STOP=1 < db/migrations/003_report_schedules.sql
create table if not exists report_schedules (
  id          uuid primary key default gen_random_uuid(),
  frequency   text not null check (frequency in ('daily', 'weekly', 'monthly')),
  weekday     smallint check (weekday between 0 and 6),      -- 0 = อาทิตย์ (ใช้กับ weekly)
  month_day   smallint check (month_day between 1 and 28),   -- ใช้กับ monthly (จำกัด ≤ 28 เพื่อให้ทุกเดือนมีวันนั้น)
  send_hour   smallint not null check (send_hour between 0 and 23), -- ชั่วโมงเวลาไทย (Asia/Bangkok)
  recipients  text[] not null check (cardinality(recipients) between 1 and 10),
  period      text not null check (period in ('year', 'q3', 'sep')),
  brand       text not null default 'all',
  enabled     boolean not null default true,
  next_run_at timestamptz not null,
  last_run_at timestamptz,
  last_status text check (last_status in ('sent', 'failed')),
  last_error  text,
  created_by  uuid references users(id) on delete set null,
  created_at  timestamptz not null default now(),
  check ((frequency = 'weekly') = (weekday is not null)),
  check ((frequency = 'monthly') = (month_day is not null))
);
create index if not exists report_schedules_due_idx on report_schedules (next_run_at) where enabled;
