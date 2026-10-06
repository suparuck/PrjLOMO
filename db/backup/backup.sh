#!/bin/sh
# สำรองฐานข้อมูลหนึ่งครั้ง: pg_dump (รูปแบบ custom บีบอัด) → ตรวจว่าอ่านกลับได้ → ลบไฟล์เก่าตามนโยบาย
#   BACKUP_KEEP_DAYS  เก็บไฟล์ย้อนหลังกี่วัน (ค่าเริ่มต้น 14)
#   BACKUP_KEEP_MIN   อย่างน้อยเก็บไว้กี่ไฟล์เสมอ แม้เก่ากว่านั้น (ค่าเริ่มต้น 3) — กันลบจนเหลือศูนย์เมื่อระบบสำรองหยุดไปนาน
set -eu
. "$(dirname "$0")/lib.sh"

KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
KEEP_MIN="${BACKUP_KEEP_MIN:-3}"
umask 077   # ไฟล์สำรองมีข้อมูลส่วนบุคคลและรหัสผ่านแฮช — เจ้าของอ่านได้คนเดียว
mkdir -p "$BACKUP_DIR"

stamp="$(date -u '+%Y%m%d-%H%M%S')"
final="$BACKUP_DIR/$BACKUP_PREFIX-$stamp.dump"
tmp="$final.partial"
trap 'rm -f "$tmp" "$tmp.list"' EXIT

log "เริ่มสำรอง $PGDATABASE@$PGHOST → $(basename "$final")"
# เขียนเป็นไฟล์ชั่วคราวก่อน แล้วค่อยเปลี่ยนชื่อ — ไฟล์ที่ไม่สมบูรณ์จะไม่ปนกับไฟล์ที่ใช้ได้
pg_dump --format=custom --compress=6 --no-owner --no-privileges --file="$tmp" || die "pg_dump ไม่สำเร็จ"

# ตรวจว่าไฟล์อ่านกลับได้ และมีข้อมูลตารางครบพอสมควร (กันไฟล์เสีย/ว่าง)
pg_restore --list "$tmp" > "$tmp.list" || die "ตรวจไฟล์สำรองไม่ผ่าน (pg_restore --list)"
tables="$(grep -c ' TABLE DATA ' "$tmp.list" || true)"
[ "$tables" -ge 5 ] || die "ไฟล์สำรองมีข้อมูลตารางเพียง $tables ตาราง ผิดปกติ — ไม่ใช้ไฟล์นี้"

mv "$tmp" "$final"
size="$(wc -c < "$final" | tr -d ' ')"
log "สำเร็จ: $(basename "$final") ($size ไบต์, $tables ตาราง)"

# ลบไฟล์เก่า: เก็บอย่างน้อย KEEP_MIN ไฟล์ใหม่สุดเสมอ ที่เหลือลบเมื่อเก่ากว่า KEEP_DAYS วัน
n=0
list_dumps | while IFS= read -r f; do
  n=$((n + 1))
  [ "$n" -le "$KEEP_MIN" ] && continue
  if [ -n "$(find "$f" -mtime +"$KEEP_DAYS" 2>/dev/null)" ]; then
    rm -f "$f" && log "ลบไฟล์เก่า: $(basename "$f")"
  fi
done
