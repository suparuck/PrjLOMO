#!/bin/sh
# ตัวตั้งเวลาสำรอง (ทำงานเป็น container ถาวร): สำรองทุกวันตามชั่วโมงเวลาไทย
#   BACKUP_HOUR_TH     ชั่วโมงเวลาไทยที่สำรอง 0–23 (ค่าเริ่มต้น 2 = ตี 2)
#   BACKUP_ON_START    true = สำรองทันทีตอนเริ่ม container ด้วย (ค่าเริ่มต้น true)
#   ล้มเหลวจะลองใหม่ทุก 15 นาที สูงสุด 4 ครั้ง แล้วรอรอบวันถัดไป
. "$(dirname "$0")/lib.sh"
HERE="$(dirname "$0")"
HOUR="${BACKUP_HOUR_TH:-2}"

case "$HOUR" in ''|*[!0-9]*) die "BACKUP_HOUR_TH ต้องเป็นตัวเลข 0–23" ;; esac
[ "$HOUR" -le 23 ] || die "BACKUP_HOUR_TH ต้องอยู่ระหว่าง 0–23"

run_once() {
  attempt=1
  while [ "$attempt" -le 4 ]; do
    if sh "$HERE/backup.sh"; then return 0; fi
    log "ครั้งที่ $attempt ล้มเหลว"
    attempt=$((attempt + 1))
    if [ "$attempt" -le 4 ]; then log "ลองใหม่ในอีก 15 นาที"; sleep 900; fi
  done
  log "สำรองไม่สำเร็จหลังลอง 4 ครั้ง — รอรอบถัดไป (ตรวจ log และสถานะ healthcheck)"
  return 1
}

# วินาทีที่ต้องรอถึงชั่วโมงเป้าหมายครั้งถัดไป (เวลาไทย = UTC+7, ไม่มี DST)
seconds_until_next() {
  now="$(date -u +%s)"
  sod=$(( (now + 25200) % 86400 ))
  wait=$(( HOUR * 3600 - sod ))
  [ "$wait" -le 0 ] && wait=$(( wait + 86400 ))
  echo "$wait"
}

log "ตัวตั้งเวลาสำรองเริ่มทำงาน: ทุกวัน $(printf '%02d' "$HOUR"):00 น. (เวลาไทย) เก็บ ${BACKUP_KEEP_DAYS:-14} วัน ที่ $BACKUP_DIR"

# รอฐานข้อมูลพร้อม (compose รอให้แล้ว แต่กันกรณีรีสตาร์ตแยก)
i=0
until pg_isready -q; do
  i=$((i + 1))
  [ "$i" -gt 60 ] && die "ฐานข้อมูลไม่พร้อมภายใน 5 นาที"
  sleep 5
done

if [ "${BACKUP_ON_START:-true}" = "true" ]; then run_once || true; fi

while true; do
  w="$(seconds_until_next)"
  log "สำรองรอบถัดไปในอีก $w วินาที"
  sleep "$w"
  run_once || true
done
