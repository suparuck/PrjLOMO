/** ส่วนของ SQL ที่ใช้ร่วมกัน — alias เป็น camelCase เพื่อให้ JSON ที่ตอบกลับใช้ได้ตรง ๆ */

export const VEHICLE_COLS = `
  v.id, v.model, v.plate, v.driver_id as "driverId", v.soc, v.soh, v.range_km as "rangeKm",
  v.speed_kmh as "speedKmh", v.status, v.location_text as location, v.lat, v.lng,
  v.odometer_km as "odometerKm", v.efficiency, v.battery_kwh as "batteryKwh",
  v.battery_temp_c as "batteryTempC", v.last_seen_at as "lastSeenAt"`

export const DRIVER_SELECT = `
  select d.id, d.name, d.phone, d.score,
         s.km_30d::float8 as "km30d", s.trips_30d as "trips30d", s.events_30d as "events30d",
         v.id as "vehicleId"
    from drivers d
    join v_driver_stats s on s.driver_id = d.id
    left join vehicles v on v.driver_id = d.id`

export const SESSION_COLS = `
  s.id, s.vehicle_id as "vehicleId", s.station_id as "stationId", st.name as "stationName", s.status,
  s.started_at as "startedAt", s.ended_at as "endedAt", s.from_soc as "fromSoc", s.now_soc as "nowSoc",
  s.to_soc as "toSoc", s.target_soc as "targetSoc", s.kw, s.kwh, s.cost, s.eta_minutes as "etaMinutes"`

export const ALERT_COLS = `
  a.id, a.severity, a.type, a.title, a.text, a.vehicle_id as "vehicleId",
  a.created_at as "createdAt", a.acknowledged_at as "acknowledgedAt"`
