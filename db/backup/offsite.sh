#!/bin/sh
# ส่งไฟล์สำรองออกนอกเครื่อง "แบบเข้ารหัส" (เรียกจาก backup.sh หลังสำรองสำเร็จ; รันเองได้)
#   OFFSITE_TARGET         ปลายทางแบบ rclone: offsite:<bucket>/<โฟลเดอร์> (S3-compatible, ตั้ง OFFSITE_S3_* ใน .env) หรือ /offsite (โฟลเดอร์/NAS ที่ mount) — ไม่ตั้ง = ไม่ทำอะไร
#   BACKUP_AGE_RECIPIENTS  กุญแจสาธารณะ age (age1…) คั่นด้วยช่องว่างได้หลายดอก — บังคับ: ไม่เข้ารหัสจะไม่ส่งออกเด็ดขาด
#   OFFSITE_KEEP_DAYS / OFFSITE_KEEP_MIN  เก็บปลายทางกี่วัน (30) / อย่างน้อยกี่ไฟล์เสมอ (5)
# เซิร์ฟเวอร์ถือแค่กุญแจสาธารณะ — คนที่เข้าเครื่องนี้หรือบัญชีปลายทางได้ ถอดรหัสไฟล์สำรองไม่ได้ (ต้องมีกุญแจส่วนตัวที่เก็บแยกไว้)
# ส่งไฟล์ที่ปลายทางยังไม่มีทุกไฟล์ (กู้ช่วงที่ปลายทางล่มไปแล้วกลับมา) ตรวจขนาดหลังอัปโหลด และอัปเดต $BACKUP_DIR/.offsite-ok เมื่อสำเร็จ (healthcheck ใช้)
set -eu
. "$(dirname "$0")/lib.sh"

TARGET="${OFFSITE_TARGET:-}"
[ -n "$TARGET" ] || exit 0
RECIPIENTS="${BACKUP_AGE_RECIPIENTS:-}"
[ -n "$RECIPIENTS" ] || die "ตั้ง OFFSITE_TARGET แล้วแต่ไม่มี BACKUP_AGE_RECIPIENTS — ไม่ส่งไฟล์ที่ไม่เข้ารหัสออกนอกเครื่อง (สร้างกุญแจตาม db/README.md)"
set --
for r in $RECIPIENTS; do
  case "$r" in age1*) set -- "$@" -r "$r" ;; *) die "BACKUP_AGE_RECIPIENTS ต้องเป็นกุญแจสาธารณะที่ขึ้นต้นด้วย age1 (อย่าใส่กุญแจส่วนตัว AGE-SECRET-KEY)" ;; esac
done

export RCLONE_CONFIG=/dev/null
umask 077
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

rclone mkdir "$TARGET" || die "เข้าถึงปลายทาง $TARGET ไม่ได้ (ตรวจ OFFSITE_TARGET/OFFSITE_S3_*)"
remote="$(rclone lsf "$TARGET" --files-only --format 'sp' --separator ';')" || die "อ่านรายการที่ปลายทางไม่ได้"

sent=0
for f in $(list_dumps); do
  name="$(basename "$f").age"
  size_before="$(printf '%s\n' "$remote" | grep -c ";$name\$" || true)"
  [ "$size_before" -gt 0 ] && continue
  log "เข้ารหัสและส่งออก: $name"
  age "$@" -o "$tmp/$name" "$f" || die "เข้ารหัสไม่สำเร็จ: $(basename "$f")"
  rclone copyto "$tmp/$name" "$TARGET/$name" || die "อัปโหลดไม่สำเร็จ: $name"
  want="$(wc -c < "$tmp/$name" | tr -d ' ')"
  rclone lsf "$TARGET" --files-only --format 'sp' --separator ';' | grep -qx "$want;$name" || die "ขนาดไฟล์ที่ปลายทางไม่ตรงหลังอัปโหลด: $name"
  rm -f "$tmp/$name"
  sent=$((sent + 1))
done
log "ส่งออกนอกเครื่องสำเร็จ $sent ไฟล์ → $TARGET"

# ลบไฟล์เก่าที่ปลายทาง: เก็บอย่างน้อย OFFSITE_KEEP_MIN ไฟล์ใหม่สุดเสมอ ที่เหลือลบเมื่อเก่ากว่า OFFSITE_KEEP_DAYS วัน
keep_days="${OFFSITE_KEEP_DAYS:-30}"
keep_min="${OFFSITE_KEEP_MIN:-5}"
old="$(rclone lsf "$TARGET" --files-only --min-age "${keep_days}d")"
n=0
rclone lsf "$TARGET" --files-only | grep "^$BACKUP_PREFIX-.*\.dump\.age\$" | sort -r | while IFS= read -r name; do
  n=$((n + 1))
  [ "$n" -le "$keep_min" ] && continue
  if printf '%s\n' "$old" | grep -qxF "$name"; then
    rclone deletefile "$TARGET/$name" && log "ลบไฟล์เก่าที่ปลายทาง: $name"
  fi
done

touch "$BACKUP_DIR/.offsite-ok"
