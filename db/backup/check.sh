#!/bin/sh
# healthcheck ของ container สำรอง: healthy เมื่อมีไฟล์สำรองที่ใหม่กว่า BACKUP_MAX_AGE_HOURS (ค่าเริ่มต้น 26 ชม.)
# container เพิ่งเริ่ม: ให้เวลา start_period ในไฟล์ compose สำหรับการสำรองครั้งแรก
. "$(dirname "$0")/lib.sh"
latest="$(list_dumps | head -n 1)"
[ -n "$latest" ] || { echo "ยังไม่มีไฟล์สำรอง"; exit 1; }
max_min=$(( ${BACKUP_MAX_AGE_HOURS:-26} * 60 ))
[ -n "$(find "$latest" -mmin -"$max_min" 2>/dev/null)" ] || { echo "ไฟล์สำรองล่าสุดเก่าเกิน ${BACKUP_MAX_AGE_HOURS:-26} ชั่วโมง: $(basename "$latest")"; exit 1; }
echo "ok: $(basename "$latest")"
