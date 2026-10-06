-- ============================================================
-- EV Monitor — โครงสร้างฐานข้อมูล (PostgreSQL 16)
-- รันอัตโนมัติครั้งแรกที่ container เริ่ม (docker-entrypoint-initdb.d)
-- เวลาทั้งหมดเก็บเป็น timestamptz (UTC ภายใน) แสดงผลเป็น Asia/Bangkok ที่ฝั่งแอป
-- ============================================================
create extension if not exists pgcrypto;

-- ---------- ชนิดข้อมูลแจงนับ ----------
create type vehicle_status     as enum ('driving', 'charging', 'parked', 'low', 'offline');
create type alert_severity     as enum ('critical', 'warning', 'info');
create type alert_type         as enum ('battery', 'charging', 'device', 'maint', 'driving', 'geofence');
create type user_role          as enum ('admin', 'manager', 'viewer');
create type user_status        as enum ('active', 'invited', 'disabled');
create type station_type       as enum ('depot', 'public');
create type session_status     as enum ('active', 'completed', 'stopped');
create type driving_event_type as enum ('harsh_brake', 'speeding', 'harsh_accel', 'long_idle');
create type maintenance_kind   as enum ('service', 'software', 'battery');

create sequence driver_id_seq;

create function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- การตั้งค่าองค์กร (แถวเดียว) ----------
create table app_settings (
  id          smallint primary key default 1 check (id = 1),
  city        text not null,
  center_lat  double precision not null,
  center_lng  double precision not null,
  org         jsonb not null,   -- name, fleetName, timezone, distanceUnit, language, currency
  thresholds  jsonb not null,   -- lowBattery, criticalBattery, maxSpeed, offlineMinutes
  notify      jsonb not null,   -- email, line, sms, dailyDigest
  charging    jsonb not null,   -- tariff, offPeak, onPeak, defaultTarget, smartSchedule, demandLimit
  updated_at  timestamptz not null default now()
);
create trigger trg_app_settings_updated before update on app_settings for each row execute function set_updated_at();

-- ---------- ผู้ใช้ระบบและการเข้าถึง ----------
create table users (
  id             uuid primary key default gen_random_uuid(),
  email          text not null,
  name           text not null,
  role           user_role not null,
  status         user_status not null default 'active',
  password_hash  text,                       -- bcrypt ผ่าน pgcrypto crypt(); null = ยังไม่ตอบรับคำเชิญ
  invited_at     timestamptz,
  last_login_at  timestamptz,
  invite_token_hash  text,                   -- sha256 ของโทเคนคำเชิญ (ใช้ครั้งเดียว) — ไม่เก็บโทเคนจริง
  invite_expires_at  timestamptz,
  -- เพิ่มค่านี้ทุกครั้งที่เปลี่ยน/รีเซ็ตรหัสผ่าน: session (JWT) เดิมที่ออกก่อนหน้าจะใช้ไม่ได้ทันที
  session_version    integer not null default 1,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (status = 'invited' or password_hash is not null)
);
create unique index users_email_key on users (lower(email));
create unique index users_invite_token_key on users (invite_token_hash) where invite_token_hash is not null;
create trigger trg_users_updated before update on users for each row execute function set_updated_at();

-- ลิงก์รีเซ็ตรหัสผ่าน (ใช้ครั้งเดียว): เก็บเฉพาะ sha256 ของโทเคน
create table password_resets (
  token_hash   text primary key,
  user_id      uuid not null references users(id) on delete cascade,
  expires_at   timestamptz not null,
  used_at      timestamptz,
  requested_by text not null default 'self' check (requested_by in ('self', 'admin')),
  created_at   timestamptz not null default now()
);
create index password_resets_user_idx on password_resets (user_id, created_at desc);

create table api_keys (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  key_prefix    text not null,               -- แสดงในรายการ (ไม่ใช่ความลับ)
  key_hash      text not null unique,        -- sha256 ของคีย์เต็ม
  scopes        text[] not null default '{ingest}',
  created_by    uuid references users(id) on delete set null,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz
);

create table integrations (
  key           text primary key,
  name          text not null,
  description   text not null,
  logo          text not null,
  color_token   text not null,               -- ชื่อ token สี เช่น 'navy-900' (แอปแปลงเป็น var(--...))
  connected     boolean not null default false,
  action_label  text,
  sort          smallint not null default 0
);

-- ---------- ข้อมูลอ้างอิง ----------
create table vehicle_models (
  model          text primary key,
  brand          text not null,
  spec_range_km  integer check (spec_range_km > 0)
);

-- ---------- คนขับ ----------
create table drivers (
  id          text primary key default ('D' || lpad(nextval('driver_id_seq')::text, 2, '0')),
  name        text not null check (char_length(name) between 2 and 60),
  phone       text not null unique check (phone ~ '^0[0-9]{2}-[0-9]{3}-[0-9]{4}$'),
  score       smallint check (score between 0 and 100),   -- null = ยังไม่มีคะแนน (ยังไม่มีทริป)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_drivers_updated before update on drivers for each row execute function set_updated_at();

-- ---------- รถ (สถานะล่าสุดเก็บในแถวเดียวกัน ประวัติอยู่ใน vehicle_telemetry) ----------
create table vehicles (
  id               text primary key check (id ~ '^EV-[0-9]{3,4}$'),
  model            text not null check (char_length(model) between 1 and 40),
  plate            text not null unique,
  driver_id        text unique references drivers(id) on delete set null,
  battery_kwh      numeric(5,1) not null check (battery_kwh between 10 and 200),
  soh              smallint not null default 100 check (soh between 0 and 100),
  odometer_km      integer not null default 0 check (odometer_km >= 0),
  efficiency       numeric(4,1) not null default 15 check (efficiency > 0),   -- kWh/100กม.
  -- สถานะล่าสุดจากอุปกรณ์
  soc              smallint not null check (soc between 0 and 100),
  range_km         integer not null default 0 check (range_km >= 0),
  speed_kmh        smallint not null default 0 check (speed_kmh >= 0),
  status           vehicle_status not null default 'offline',
  location_text    text not null default '',
  lat              double precision not null,
  lng              double precision not null,
  battery_temp_c   numeric(4,1),
  last_seen_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index vehicles_status_idx on vehicles (status);
create trigger trg_vehicles_updated before update on vehicles for each row execute function set_updated_at();

create table vehicle_telemetry (
  id              bigint generated always as identity primary key,
  vehicle_id      text not null references vehicles(id) on delete cascade,
  ts              timestamptz not null,
  soc             smallint not null check (soc between 0 and 100),
  speed_kmh       smallint not null default 0,
  lat             double precision,
  lng             double precision,
  odometer_km     integer,
  battery_temp_c  numeric(4,1),
  charging        boolean not null default false
);
create index vehicle_telemetry_vehicle_ts_idx on vehicle_telemetry (vehicle_id, ts desc);

create table trips (
  id           bigint generated always as identity primary key,
  vehicle_id   text not null references vehicles(id) on delete cascade,
  driver_id    text references drivers(id) on delete set null,
  started_at   timestamptz not null,
  ended_at     timestamptz not null,
  origin       text not null,
  destination  text not null,
  distance_km  numeric(7,1) not null check (distance_km >= 0),
  energy_kwh   numeric(7,2) not null check (energy_kwh >= 0),
  end_soc      smallint check (end_soc between 0 and 100),
  check (ended_at >= started_at)
);
create index trips_vehicle_started_idx on trips (vehicle_id, started_at desc);
create index trips_driver_started_idx  on trips (driver_id, started_at desc);

create table driving_events (
  id           bigint generated always as identity primary key,
  driver_id    text references drivers(id) on delete cascade,
  vehicle_id   text references vehicles(id) on delete set null,
  type         driving_event_type not null,
  occurred_at  timestamptz not null
);
create index driving_events_driver_idx on driving_events (driver_id, occurred_at desc);
create index driving_events_time_idx   on driving_events (occurred_at desc);

-- สถิติคนขับย้อนหลัง 30 วัน (คำนวณจากทริปและเหตุการณ์จริง)
create view v_driver_stats as
select d.id as driver_id,
       coalesce(t.km, 0)     as km_30d,
       coalesce(t.trips, 0)  as trips_30d,
       coalesce(e.events, 0) as events_30d
from drivers d
left join (select driver_id, sum(distance_km) as km, count(*) as trips
             from trips where started_at >= now() - interval '30 days' group by driver_id) t on t.driver_id = d.id
left join (select driver_id, count(*) as events
             from driving_events where occurred_at >= now() - interval '30 days' group by driver_id) e on e.driver_id = d.id;

-- ---------- การชาร์จ ----------
create table stations (
  id             text primary key,
  name           text not null,
  type           station_type not null,
  network        text not null,
  lat            double precision not null,
  lng            double precision not null,
  ports          smallint not null check (ports > 0),
  busy_ports     smallint not null default 0,
  power_label    text not null,
  price_per_kwh  numeric(5,2) not null check (price_per_kwh >= 0),
  updated_at     timestamptz not null default now(),
  check (busy_ports between 0 and ports)
);
create trigger trg_stations_updated before update on stations for each row execute function set_updated_at();

create table charging_sessions (
  id           bigint generated always as identity primary key,
  vehicle_id   text not null references vehicles(id) on delete cascade,
  station_id   text not null references stations(id),
  status       session_status not null default 'active',
  started_at   timestamptz not null default now(),
  ended_at     timestamptz,
  from_soc     smallint not null check (from_soc between 0 and 100),
  now_soc      smallint not null check (now_soc between 0 and 100),
  to_soc       smallint check (to_soc between 0 and 100),
  target_soc   smallint not null check (target_soc between 0 and 100),
  kw           numeric(6,1) not null default 0 check (kw >= 0),
  kwh          numeric(7,2) not null default 0 check (kwh >= 0),
  cost         numeric(9,2) not null default 0 check (cost >= 0),
  eta_minutes  integer check (eta_minutes >= 0),
  check ((status = 'active') = (ended_at is null))
);
-- รถหนึ่งคันมีเซสชันที่กำลังชาร์จได้ครั้งละหนึ่งเซสชัน
create unique index charging_sessions_one_active on charging_sessions (vehicle_id) where status = 'active';
create index charging_sessions_started_idx on charging_sessions (started_at desc);

create table charging_load (
  day   date not null,
  hour  smallint not null check (hour between 0 and 23),
  kw    numeric(7,1) not null check (kw >= 0),
  primary key (day, hour)
);

-- ---------- การแจ้งเตือน ----------
create table alerts (
  id               bigint generated always as identity primary key,
  severity         alert_severity not null,
  type             alert_type not null,
  title            text not null,
  text             text not null,
  vehicle_id       text references vehicles(id) on delete set null,
  created_at       timestamptz not null default now(),
  acknowledged_at  timestamptz,
  acknowledged_by  uuid references users(id) on delete set null,
  line_notified_at timestamptz,            -- เวลาที่ส่งเข้า LINE แล้ว (ว่าง = ยังไม่ส่ง)
  email_notified_at timestamptz            -- เวลาที่ส่งอีเมลแล้ว (ว่าง = ยังไม่ส่ง)
);
create index alerts_open_idx on alerts (created_at desc) where acknowledged_at is null;
create index alerts_created_idx on alerts (created_at desc);

create table alert_rules (
  key      text primary key,
  title    text not null,
  text     text not null,
  enabled  boolean not null default true,
  sort     smallint not null default 0
);

create table notification_channels (
  key      text primary key,
  name     text not null,
  detail   text not null,
  icon     text not null,
  tone     text not null,
  enabled  boolean not null default true,
  sort     smallint not null default 0
);

-- ---------- บำรุงรักษา ----------
create table maintenance_tasks (
  id               bigint generated always as identity primary key,
  vehicle_id       text not null references vehicles(id) on delete cascade,
  kind             maintenance_kind not null,
  title            text not null,
  detail           text not null default '',
  due_date         date,
  due_odometer_km  integer,
  completed_at     timestamptz,
  created_at       timestamptz not null default now()
);
create index maintenance_vehicle_idx on maintenance_tasks (vehicle_id) where completed_at is null;

-- ---------- พลังงาน / รายงาน ----------
create table energy_daily (
  day   date primary key,
  kwh   numeric(10,2) not null check (kwh >= 0),
  cost  numeric(12,2) not null check (cost >= 0)
);

create table energy_monthly (
  month                 date not null check (month = date_trunc('month', month)::date),
  vehicle_id            text not null references vehicles(id) on delete cascade,
  kwh_depot             numeric(12,3) not null default 0,
  kwh_public            numeric(12,3) not null default 0,
  cost_depot_offpeak    numeric(14,2) not null default 0,
  cost_depot_onpeak     numeric(14,2) not null default 0,
  cost_public_dc        numeric(14,2) not null default 0,
  cost_public_ac        numeric(14,2) not null default 0,
  co2_avoided_kg        numeric(12,3) not null default 0,
  primary key (month, vehicle_id)
);

create table fleet_soh_monthly (
  month    date primary key check (month = date_trunc('month', month)::date),
  avg_soh  numeric(4,1) not null check (avg_soh between 0 and 100)
);

create table ice_vehicles (
  id                text primary key,
  model             text not null,
  km_per_day        integer not null,
  max_km_per_day    integer not null,
  fuel_per_month    integer not null,
  readiness_score   smallint not null check (readiness_score between 0 and 100),
  recommended_ev    text not null
);

create table tco_items (
  sort      smallint primary key,
  label     text not null,
  ice_cost  numeric(12,2) not null,
  ev_cost   numeric(12,2) not null
);

-- ค่าสมมติฐานของรายงาน (ปรับได้โดยไม่ต้องแก้โค้ด)
create table report_config (
  key          text primary key,
  value        jsonb not null,
  description  text not null
);
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

alter table app_settings add column if not exists require_admin_2fa boolean not null default false;

create table if not exists audit_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  actor_id    uuid references users(id) on delete set null,
  actor_email text,                       -- เก็บสำเนาไว้ ลบผู้ใช้แล้วยังรู้ว่าใคร
  action      text not null,              -- เช่น auth.login, PATCH /users/:id (ชื่อแสดงผลอยู่ใน api/src/lib/auditLabels.ts)
  target      text,                       -- สิ่งที่ถูกกระทำ: อีเมลผู้ใช้ หรือรหัสรถ/คนขับ/สถานี ฯลฯ
  ip          text,
  detail      jsonb not null default '{}'  -- ไม่เก็บค่าที่ผู้ใช้กรอก (รหัสผ่าน/โทเคน) — เก็บแค่ชื่อฟิลด์ที่ส่งมา
);
create index if not exists audit_log_at_idx on audit_log (at desc);
create index if not exists audit_log_action_idx on audit_log (action, at desc);
-- แก้ไขไม่ได้ ยกเว้นกรณีเดียว: ลบผู้ใช้แล้ว FK (on delete set null) เคลียร์ actor_id — คอลัมน์อื่นต้องเหมือนเดิมทุกค่า
create or replace function audit_log_immutable() returns trigger language plpgsql as $$
begin
  if new.actor_id is null and old.actor_id is not null
     and (new.id, new.at, new.actor_email, new.action, new.target, new.ip, new.detail) is not distinct from (old.id, old.at, old.actor_email, old.action, old.target, old.ip, old.detail) then
    return new;
  end if;
  raise exception 'audit_log แก้ไขไม่ได้';
end $$;
drop trigger if exists trg_audit_log_immutable on audit_log;
create trigger trg_audit_log_immutable before update on audit_log for each row execute function audit_log_immutable();

alter table users add column if not exists login_alert_at timestamptz;

alter table users add column if not exists notify_prefs jsonb not null default '{}'::jsonb;

alter table app_settings add column if not exists digest_last_date date;
