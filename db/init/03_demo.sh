#!/bin/sh
# รันครั้งเดียวตอนสร้างฐานข้อมูลใหม่ (หลัง 01_schema.sql และ 02_reference.sql) — ควบคุมด้วย environment ของ container db:
#   SEED_DEMO=true (ค่าเริ่มต้น)  เติมข้อมูลเดโม: ผู้ใช้ รถ คนขับ สถานี ประวัติ ฯลฯ (db/demo/demo_seed.sql)
#   SEED_DEMO=false               ติดตั้งแบบ "กองยานว่างเปล่า" สำหรับใช้งานจริง — ไม่มีผู้ใช้ ต้องสร้างผู้ดูแลคนแรกด้วย
#                                 docker compose exec api node dist/cli.js create-admin --email … --name …
#   ORG_NAME / FLEET_NAME         ชื่อองค์กร/ชื่อกองยาน (แก้ภายหลังได้ที่ ตั้งค่า > องค์กร)
#   ORG_CITY / ORG_LAT / ORG_LNG  เมืองและจุดกึ่งกลางแผนที่ (ไม่มีหน้าตั้งค่า — ตั้งตอนติดตั้ง หรือแก้ด้วย SQL ภายหลัง)
# ใช้ได้เมื่อ volume ฐานข้อมูลว่างเท่านั้น (ลบข้อมูลเดิม: docker compose down -v)
set -e

psql_() { psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"; }

if [ "${SEED_DEMO:-true}" = "true" ]; then
  echo "[init] เติมข้อมูลเดโม (SEED_DEMO=true)"
  psql_ -f /demo/demo_seed.sql
else
  echo "[init] ติดตั้งแบบกองยานว่างเปล่า (SEED_DEMO=false) — ยังไม่มีผู้ใช้: สร้างผู้ดูแลคนแรกด้วย create-admin"
fi

if [ -n "${ORG_NAME:-}${FLEET_NAME:-}${ORG_CITY:-}${ORG_LAT:-}${ORG_LNG:-}" ]; then
  echo "[init] ตั้งค่าองค์กรจาก environment"
  # ส่งค่าผ่านตัวแปร psql (ปลอดภัยต่ออักขระพิเศษ/เครื่องหมายคำพูดในชื่อ) — ค่าว่าง = คงค่าเดิม
  psql_ -v name="${ORG_NAME:-}" -v fleet="${FLEET_NAME:-}" -v city="${ORG_CITY:-}" -v lat="${ORG_LAT:-}" -v lng="${ORG_LNG:-}" -f - <<'SQL'
update app_settings set
  org = jsonb_set(jsonb_set(org,
          '{name}',      to_jsonb(coalesce(nullif(:'name', ''),  org->>'name'))),
          '{fleetName}', to_jsonb(coalesce(nullif(:'fleet', ''), org->>'fleetName'))),
  city       = coalesce(nullif(:'city', ''), city),
  center_lat = coalesce(nullif(:'lat', '')::double precision, center_lat),
  center_lng = coalesce(nullif(:'lng', '')::double precision, center_lng)
 where id = 1;
SQL
fi
