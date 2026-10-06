#!/bin/sh
# ทดสอบกู้คืนจริง: กู้ไฟล์ล่าสุดลงฐานข้อมูลชั่วคราว เทียบจำนวนแถวกับฐานข้อมูลจริง แล้วลบทิ้ง
# (ไฟล์สำรองที่ไม่เคยทดสอบกู้คืน ยังไม่ถือว่าเป็นการสำรอง) — ใช้เป็นระยะ หรือหลังเปลี่ยน schema
set -eu
. "$(dirname "$0")/lib.sh"
TMPDB="evmonitor_verify_$$"
cleanup() { psql -d postgres -q -c "drop database if exists \"$TMPDB\"" >/dev/null 2>&1 || true; }
trap cleanup EXIT
RESTORE_DB="$TMPDB" sh "$(dirname "$0")/restore.sh" "$@" >/dev/null

fail=0
for t in users vehicles drivers alerts charging_sessions trips energy_daily; do
  live="$(psql -d "$PGDATABASE" -At -c "select count(*) from $t")"
  back="$(psql -d "$TMPDB" -At -c "select count(*) from $t")"
  if [ "$live" = "$back" ]; then st="ตรงกัน"; else st="ต่างกัน (ฐานข้อมูลจริงอาจเปลี่ยนหลังสำรอง)"; fi
  printf '%-18s จริง=%-8s สำรอง=%-8s %s\n' "$t" "$live" "$back" "$st"
  # ตารางว่างในไฟล์สำรองแต่ไม่ว่างในฐานข้อมูลจริง = ผิดปกติ (กันไฟล์ที่กู้แล้วได้โครงว่าง)
  if [ "$back" = "0" ] && [ "$live" != "0" ]; then fail=1; fi
done
[ "$fail" = "0" ] || die "ทดสอบกู้คืนไม่ผ่าน: มีตารางที่ว่างในไฟล์สำรอง"
log "ทดสอบกู้คืนผ่าน (ไฟล์ $(basename "${1:-$(list_dumps | head -n 1)}"))"
