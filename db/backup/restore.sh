#!/bin/sh
# กู้คืนจากไฟล์สำรอง — ปลอดภัยไว้ก่อน: ค่าเริ่มต้นกู้ลง "ฐานข้อมูลใหม่" ชื่อ evmonitor_restore (ไม่แตะข้อมูลจริง)
#   sh restore.sh [ไฟล์.dump]            กู้ลงฐานข้อมูลใหม่ (ไฟล์ล่าสุดถ้าไม่ระบุ)
#   RESTORE_DB=ชื่อ                      เปลี่ยนชื่อฐานข้อมูลปลายทาง
#   RESTORE_OVER_LIVE=yes-overwrite-live กู้ทับฐานข้อมูลจริง (ลบข้อมูลปัจจุบันทั้งหมด!) — ต้องหยุด api/web ก่อน
set -eu
. "$(dirname "$0")/lib.sh"

file="${1:-$(list_dumps | head -n 1)}"
[ -n "$file" ] && [ -f "$file" ] || die "ไม่พบไฟล์สำรอง (ระบุเป็นอาร์กิวเมนต์ หรือวางไว้ที่ $BACKUP_DIR)"
pg_restore --list "$file" >/dev/null || die "ไฟล์สำรองอ่านไม่ได้: $file"

if [ "${RESTORE_OVER_LIVE:-}" = "yes-overwrite-live" ]; then
  target="$PGDATABASE"
  log "คำเตือน: จะกู้ทับฐานข้อมูลจริง $target (ข้อมูลปัจจุบันจะหายทั้งหมด) จาก $(basename "$file")"
  # ตัดการเชื่อมต่ออื่นแล้วสร้างฐานข้อมูลใหม่ — ต้องไม่มี api/web ต่ออยู่
  psql -d postgres -q -v ON_ERROR_STOP=1 -c "select pg_terminate_backend(pid) from pg_stat_activity where datname = '$target' and pid <> pg_backend_pid()" >/dev/null
else
  target="${RESTORE_DB:-evmonitor_restore}"
  [ "$target" != "$PGDATABASE" ] || die "ชื่อปลายทางเหมือนฐานข้อมูลจริง — ใช้ RESTORE_OVER_LIVE=yes-overwrite-live หากตั้งใจกู้ทับ"
  log "กู้ลงฐานข้อมูลใหม่ $target จาก $(basename "$file")"
fi
psql -d postgres -q -v ON_ERROR_STOP=1 -c "drop database if exists \"$target\"" -c "create database \"$target\""

pg_restore --dbname="$target" --no-owner --no-privileges --exit-on-error "$file" || die "pg_restore ล้มเหลว"
log "กู้คืนสำเร็จ → ฐานข้อมูล $target"
psql -d "$target" -At -c "select 'ผู้ใช้ ' || (select count(*) from users) || ' · รถ ' || (select count(*) from vehicles) || ' · แจ้งเตือน ' || (select count(*) from alerts) || ' · เซสชันชาร์จ ' || (select count(*) from charging_sessions)"
