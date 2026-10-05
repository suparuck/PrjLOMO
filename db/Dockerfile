# ฐานข้อมูล EV Monitor — PostgreSQL 16
# สคริปต์ใน /docker-entrypoint-initdb.d รันครั้งแรกที่ volume ว่างเท่านั้น (ตามลำดับชื่อไฟล์)
# ล้างข้อมูลและสร้างใหม่: docker compose down -v && docker compose up -d
FROM postgres:16-alpine

ENV TZ=Asia/Bangkok \
    PGTZ=Asia/Bangkok \
    POSTGRES_INITDB_ARGS="--encoding=UTF8"

COPY init/ /docker-entrypoint-initdb.d/

HEALTHCHECK --interval=5s --timeout=3s --start-period=20s --retries=10 \
  CMD pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" || exit 1
