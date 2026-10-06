# ฟังก์ชันร่วมของสคริปต์สำรองฐานข้อมูล (source จาก backup.sh / run.sh / restore.sh / verify.sh / check.sh)
BACKUP_DIR="${BACKUP_DIR:-/backups}"
BACKUP_PREFIX="${BACKUP_PREFIX:-evmonitor}"
export PGHOST="${PGHOST:-db}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-evm}"
export PGDATABASE="${PGDATABASE:-evmonitor}"
# ไม่แสดง NOTICE ของ "drop database if exists" ฯลฯ ใน log
export PGOPTIONS="${PGOPTIONS:--c client_min_messages=warning}"
# PGPASSWORD มาจาก environment ของ container (ไม่เขียนลงไฟล์/ไม่แสดงใน log)

log() { printf '%s [backup] %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"; }
die() { log "ผิดพลาด: $*" >&2; exit 1; }

# ไฟล์สำรองทั้งหมด ใหม่สุดก่อน
list_dumps() { ls -1t "$BACKUP_DIR/$BACKUP_PREFIX"-*.dump 2>/dev/null || true; }
