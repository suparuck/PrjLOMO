#!/bin/sh
# ทดสอบว่าไฟล์สำรองนอกเครื่อง "ถอดรหัสและอ่านกลับได้จริง": ดึงไฟล์ล่าสุดจากปลายทาง → ถอดรหัสด้วยกุญแจส่วนตัว → pg_restore --list
#   sh offsite-verify.sh /path/to/age-identity.txt     (กุญแจส่วนตัวต้องนำมาเมาท์ชั่วคราว ไม่เก็บไว้ในเครื่องสำรอง)
# ทำเป็นระยะ (เช่นทุกเดือน) — ไฟล์สำรองที่ไม่เคยทดสอบถอดรหัสยังไม่ถือว่าสำรองแล้ว
set -eu
. "$(dirname "$0")/lib.sh"
id="${1:-}"
[ -n "${OFFSITE_TARGET:-}" ] || die "ไม่ได้ตั้ง OFFSITE_TARGET"
[ -n "$id" ] && [ -f "$id" ] || die "ระบุไฟล์กุญแจส่วนตัว age เป็นอาร์กิวเมนต์"
export RCLONE_CONFIG=/dev/null
umask 077
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
name="$(rclone lsf "$OFFSITE_TARGET" --files-only | grep "^$BACKUP_PREFIX-.*\.dump\.age\$" | sort -r | head -n 1)"
[ -n "$name" ] || die "ไม่พบไฟล์สำรองที่ปลายทาง $OFFSITE_TARGET"
rclone copyto "$OFFSITE_TARGET/$name" "$tmp/$name" || die "ดึงไฟล์จากปลายทางไม่ได้"
age -d -i "$id" -o "$tmp/plain.dump" "$tmp/$name" || die "ถอดรหัสไม่สำเร็จ (กุญแจส่วนตัวไม่ตรงกับกุญแจสาธารณะที่ใช้เข้ารหัส?)"
tables="$(pg_restore --list "$tmp/plain.dump" | grep -c ' TABLE DATA ' || true)"
[ "$tables" -ge 5 ] || die "ถอดรหัสได้แต่ไฟล์ผิดปกติ (ตาราง $tables)"
log "ตรวจสอบผ่าน: $name ถอดรหัสและอ่านกลับได้ ($tables ตาราง)"
