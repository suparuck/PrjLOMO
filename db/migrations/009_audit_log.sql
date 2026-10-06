-- บันทึกกิจกรรม (audit log): ใครทำอะไรเมื่อไหร่จากที่ไหน — เฉพาะเพิ่มแถว แก้ไขไม่ได้ (trigger) ลบได้เฉพาะงานล้างข้อมูลเก่าของระบบ
-- ใช้กับฐานข้อมูลที่สร้างไปแล้ว (ติดตั้งใหม่ใช้ db/init/01_schema.sql) รันซ้ำได้ปลอดภัย
--   docker compose exec -T db psql -U evm -d evmonitor -v ON_ERROR_STOP=1 < db/migrations/009_audit_log.sql
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
