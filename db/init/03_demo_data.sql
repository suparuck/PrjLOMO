-- ============================================================
-- ข้อมูลเดโม (ย้ายมาจาก mockup data เดิม)
-- เวลาทั้งหมดสร้างแบบสัมพันธ์กับ now() ตอน init เพื่อให้ "เมื่อกี้/วันนี้/เมื่อวาน" สมเหตุสมผล
-- ลบหรือไม่รันไฟล์นี้เมื่อใช้งานจริง
-- ============================================================

-- ---------- คนขับ ----------
insert into drivers (id, name, phone, score) values
  ('D01', 'สมชาย ใจดี',      '081-234-5678', 92),
  ('D02', 'อนงค์ ศรีสุข',     '082-345-6789', 88),
  ('D03', 'วิชัย คำแสน',      '083-456-7890', 71),
  ('D04', 'มาลี บุญมา',       '084-567-8901', 95),
  ('D05', 'ประเสริฐ ทองดี',   '085-678-9012', 90),
  ('D06', 'กาญจนา แสงทอง',   '086-789-0123', 84),
  ('D07', 'ธนพล วงศ์ใหญ่',    '087-890-1234', 79),
  ('D08', 'สุดารัตน์ มีสุข',   '088-901-2345', 67),
  ('D09', 'อำนาจ ปัญญา',      '089-012-3456', 86),
  ('D10', 'รัตนา ดวงดี',      '090-123-4567', 81),
  ('D11', 'ณัฐวุฒิ แก้วมา',    '091-234-5678', 93),
  ('D12', 'พิมพ์ชนก ศรีวงศ์',  '092-345-6789', 89);
select setval('driver_id_seq', 12);

-- ---------- รถ ----------
insert into vehicles (id, model, plate, driver_id, battery_kwh, soh, odometer_km, efficiency,
                      soc, range_km, speed_kmh, status, location_text, lat, lng, battery_temp_c, last_seen_at) values
  ('EV-001', 'BYD Dolphin',   '1กข 1234', 'D01', 60.5, 97, 18420, 13.8, 85, 320, 52, 'driving',  'ตัวเมืองเชียงใหม่',    18.7905, 98.9870, 28 + (85 % 9), now() - interval '1 minute'),
  ('EV-002', 'MG4 Electric',  '2กข 5678', 'D02', 51.0, 95, 24110, 15.2, 62, 210,  0, 'parked',   'หางดง',               18.6870, 98.9200, 28 + (62 % 9), now() - interval '1 minute'),
  ('EV-003', 'BYD Atto 3',    '3กข 9012', 'D03', 60.5, 93, 31250, 15.9, 18,  62,  0, 'low',      'สันกำแพง',            18.7450, 99.1200, 28 + (18 % 9), now() - interval '1 minute'),
  ('EV-004', 'Neta V',        '4กข 3456', 'D04', 38.5, 98,  9870, 12.9, 78, 290,  0, 'charging', 'สถานีชาร์จ Depot A',   18.7672, 98.9630, 28 + (78 % 9), now() - interval '1 minute'),
  ('EV-005', 'ORA Good Cat',  '5กข 7890', 'D05', 63.0, 99,  7650, 14.1, 91, 340, 38, 'driving',  'นิมมานเหมินท์',        18.7990, 98.9670, 28 + (91 % 9), now() - interval '1 minute'),
  ('EV-006', 'BYD Seal',      '6กข 2345', 'D06', 82.5, 96, 15320, 15.0, 54, 280, 64, 'driving',  'แม่ริม',               18.9150, 98.9400, 28 + (54 % 9), now() - interval '1 minute'),
  ('EV-007', 'Tesla Model 3', '7กข 6789', 'D07', 60.0, 94, 28760, 14.4, 46, 230,  0, 'parked',   'เซ็นทรัล เฟสติวัล',    18.8070, 99.0180, 28 + (46 % 9), now() - interval '1 minute'),
  ('EV-008', 'MG ZS EV',      '8กข 0123', 'D08', 50.3, 91, 40120, 16.8, 33, 120,  0, 'charging', 'PEA VOLTA สารภี',      18.7100, 99.0400, 28 + (33 % 9), now() - interval '1 minute'),
  ('EV-009', 'Neta V',        '9กข 4567', 'D09', 38.5, 97, 11200, 13.1, 71, 250,  0, 'offline',  'สันทราย',             18.8500, 99.0400, 28 + (71 % 9), now() - interval '42 minutes'),
  ('EV-010', 'BYD Dolphin',   '1กค 8901', 'D10', 44.9, 95, 21980, 14.0, 24,  88, 41, 'low',      'แม่โจ้',               18.8900, 99.0100, 28 + (24 % 9), now() - interval '1 minute'),
  ('EV-011', 'ORA Good Cat',  '2กค 2345', 'D11', 47.8, 98,  6540, 13.9, 67, 255,  0, 'parked',   'มช. (CMU)',           18.8020, 98.9520, 28 + (67 % 9), now() - interval '1 minute'),
  ('EV-012', 'BYD Atto 3',    '3กค 6789', 'D12', 60.5, 96, 17430, 15.4, 88, 360, 57, 'driving',  'ดอยสะเก็ด',            18.8700, 99.1400, 28 + (88 % 9), now() - interval '1 minute');

-- ---------- ประวัติ telemetry 24 ชม. (รายชั่วโมง) ----------
-- จำลองรูปแบบเดิม: ชาร์จกลางคืน 00–06, ชาร์จพักเที่ยง 12–13 แล้วลดลงตามการใช้งาน
do $$
declare
  v record;
  s numeric;
  i int;
begin
  for v in select id, soc, lat, lng, odometer_km, speed_kmh from vehicles loop
    s := greatest(20, v.soc - 30);
    for i in 0..24 loop
      if    i < 6  then s := least(95, s + 9);
      elsif i < 12 then s := greatest(10, s - 4);
      elsif i < 13 then s := least(95, s + 10);
      else               s := greatest(10, s - 3.2);
      end if;
      insert into vehicle_telemetry (vehicle_id, ts, soc, speed_kmh, lat, lng, odometer_km, charging)
      values (v.id,
              now() - (24 - i) * interval '1 hour',
              case when i = 24 then v.soc else round(s) end,
              case when i = 24 then v.speed_kmh else 0 end,
              v.lat, v.lng, v.odometer_km, i < 6 or i = 12);
    end loop;
  end loop;
end $$;

-- ---------- ทริป 30 วันล่าสุด (ผลรวมตรงกับตัวเลขเดิมของแต่ละคน) ----------
do $$
declare
  r record;
  n int; i int; dnum int;
  raw numeric[]; total numeric; acc numeric; km numeric;
  eff numeric; started timestamptz; mins int;
  places text[] := array['Depot A','นิมมานเหมินท์','เซ็นทรัล เฟสติวัล','สนามบินเชียงใหม่','มช. (CMU)','หางดง','สันกำแพง'];
begin
  for r in
    select * from (values
      ('D01','EV-001',1840,64), ('D02','EV-002',1520,58), ('D03','EV-003',2210,71), ('D04','EV-004',1210,49),
      ('D05','EV-005',1660,60), ('D06','EV-006',1980,66), ('D07','EV-007',2050,69), ('D08','EV-008',2390,75),
      ('D09','EV-009',1410,52), ('D10','EV-010',1760,61), ('D11','EV-011',1130,45), ('D12','EV-012',1890,63)
    ) as t(driver_id, vehicle_id, km_total, n_trips)
  loop
    n := r.n_trips;
    dnum := substring(r.driver_id from 2)::int;
    select efficiency into eff from vehicles where id = r.vehicle_id;
    total := 0; raw := '{}';
    for i in 1..n loop
      raw[i] := 6 + ((i * 7 + dnum * 3) % 25);
      total := total + raw[i];
    end loop;
    acc := 0;
    for i in 1..n loop
      if i < n then km := round(raw[i] * r.km_total / total, 1); acc := acc + km;
      else km := r.km_total - acc; end if;
      started := now() - (2 + (i - 1) * (29 * 24.0 / n) + ((i * 13 + dnum * 5) % 9)) * interval '1 hour';
      mins := round(km * 1.6)::int + 8;
      insert into trips (vehicle_id, driver_id, started_at, ended_at, origin, destination, distance_km, energy_kwh, end_soc)
      values (r.vehicle_id, r.driver_id, started, started + mins * interval '1 minute',
              places[1 + (i + dnum) % 7],
              places[1 + (i + dnum + 2) % 7],
              km, round(km * eff / 100, 2), 40 + (i * 11 + dnum) % 55);
    end loop;
  end loop;
end $$;

-- ---------- เหตุการณ์การขับขี่ 30 วัน (67 ครั้ง: เบรกแรง 26 / ขับเร็ว 19 / เร่งแรง 15 / จอดติดเครื่อง 7) ----------
insert into driving_events (driver_id, vehicle_id, type, occurred_at)
select d.id, v.id,
       (case when g.n <= 26 then 'harsh_brake' when g.n <= 45 then 'speeding'
             when g.n <= 60 then 'harsh_accel' else 'long_idle' end)::driving_event_type,
       now() - (g.n * 10.4) * interval '1 hour'
from (
  select row_number() over (order by driver_id, k) as n, driver_id
  from (values ('D01',2),('D02',4),('D03',12),('D04',1),('D05',3),('D06',6),('D07',8),('D08',15),('D09',4),('D10',7),('D11',2),('D12',3)) c(driver_id, cnt),
       lateral generate_series(1, c.cnt) k
) g
join drivers d on d.id = g.driver_id
join vehicles v on v.driver_id = d.id;

-- ---------- เซสชันการชาร์จ ----------
-- กำลังชาร์จ 2 เซสชัน
insert into charging_sessions (vehicle_id, station_id, status, started_at, from_soc, now_soc, target_soc, kw, kwh, cost, eta_minutes) values
  ('EV-004', 'S1', 'active', now() - interval '25 minutes', 41, 78, 90, 60.0,  14.20, 59.60, 18),
  ('EV-008', 'S3', 'active', now() - interval '8 minutes',  12, 33, 80, 112.0, 10.60, 79.50, 21);

-- ประวัติ 6 เซสชัน
insert into charging_sessions (vehicle_id, station_id, status, started_at, ended_at, from_soc, now_soc, to_soc, target_soc, kw, kwh, cost) values
  ('EV-005', 'S1', 'completed', now() - interval '4 hours 20 minutes',  now() - interval '4 hours 20 minutes'  + interval '52 minutes', 38, 91, 91, 91, 36.0, 31.50, 132.30),
  ('EV-012', 'S6', 'completed', now() - interval '4 hours 50 minutes',  now() - interval '4 hours 50 minutes'  + interval '35 minutes', 40, 88, 88, 88, 48.0, 28.00, 210.00),
  ('EV-001', 'S1', 'completed', now() - interval '13 hours 30 minutes', now() - interval '13 hours 30 minutes' + interval '250 minutes', 25, 85, 85, 85, 8.7, 36.30, 152.50),
  ('EV-006', 'S4', 'completed', now() - interval '17 hours 5 minutes',  now() - interval '17 hours 5 minutes'  + interval '41 minutes', 20, 74, 74, 74, 65.0, 44.60, 312.20),
  ('EV-007', 'S5', 'completed', now() - interval '21 hours 25 minutes', now() - interval '21 hours 25 minutes' + interval '58 minutes', 22, 72, 72, 72, 31.0, 30.00, 237.00),
  ('EV-002', 'S2', 'completed', now() - interval '26 hours 30 minutes', now() - interval '26 hours 30 minutes' + interval '140 minutes', 12, 62, 62, 62, 10.9, 25.50, 107.10);

-- โหลดการชาร์จรายชั่วโมงของวันนี้ (kW)
insert into charging_load (day, hour, kw)
select (now() at time zone 'Asia/Bangkok')::date, h - 1, kw
from unnest(array[44,66,66,52,44,22,60,30,0,0,172,172,60,0,22,0,0,45,60,22,0,0,88,66]) with ordinality as t(kw, h);

-- ---------- การแจ้งเตือน (8 รายการ ตรงกับเดิม) ----------
insert into alerts (severity, type, title, text, vehicle_id, created_at, acknowledged_at) values
  ('critical', 'battery',  'แบตเตอรี่ต่ำมาก',      'EV-003 แบตเตอรี่เหลือ 18% ระยะวิ่งประมาณ 62 กม.',            'EV-003', now() - interval '5 minutes',  null),
  ('warning',  'battery',  'แบตเตอรี่ต่ำ',          'EV-010 แบตเตอรี่ต่ำกว่า 30% ระหว่างการเดินทาง',                'EV-010', now() - interval '12 minutes', null),
  ('info',     'charging', 'เริ่มชาร์จ',             'EV-008 เริ่มชาร์จที่ PEA VOLTA สารภี (DC 112 kW)',            'EV-008', now() - interval '18 minutes', null),
  ('warning',  'device',   'รถออฟไลน์',             'EV-009 ไม่ส่งข้อมูลมากกว่า 40 นาที',                           'EV-009', now() - interval '42 minutes', null),
  ('warning',  'driving',  'ขับเร็วเกินกำหนด',       'EV-006 ความเร็ว 104 กม./ชม. บนถนนโชตนา',                      'EV-006', now() - interval '1 hour',     now() - interval '1 hour'  + interval '5 minutes'),
  ('info',     'charging', 'ชาร์จเสร็จสิ้น',          'EV-005 ชาร์จถึง 91% ที่ Depot A',                              'EV-005', now() - interval '3 hours',    now() - interval '3 hours' + interval '6 minutes'),
  ('critical', 'maint',    'ถึงกำหนดบำรุงรักษา',     'EV-008 ครบระยะเช็กระบบเบรกและยาง (40,000 กม.)',                'EV-008', now() - interval '5 hours',    null),
  ('info',     'geofence', 'ออกนอกพื้นที่ที่กำหนด',   'EV-012 ออกจากเขตเมืองเชียงใหม่ไปยังดอยสะเก็ด',                 'EV-012', now() - interval '6 hours',    now() - interval '6 hours' + interval '492 seconds');

-- ---------- บำรุงรักษา (รถทุกคันมี 3 รายการ) ----------
insert into maintenance_tasks (vehicle_id, kind, title, detail, due_date, due_odometer_km)
select id, 'service', 'ตรวจเช็กระบบเบรกและยาง', '',
       case when id = 'EV-008' then current_date - 2  else current_date + 18 end,
       case when id = 'EV-008' then 40000 else odometer_km + 1580 end
from vehicles;
insert into maintenance_tasks (vehicle_id, kind, title, detail)
select id, 'software', 'อัปเดตซอฟต์แวร์รถ (OTA)', 'เวอร์ชันใหม่พร้อมติดตั้ง' from vehicles;
insert into maintenance_tasks (vehicle_id, kind, title, detail, due_date)
select id, 'battery', 'ตรวจสุขภาพแบตประจำปี', '', date '2027-01-31' from vehicles;

-- ---------- พลังงานรายวัน 14 วันล่าสุด (สัปดาห์นี้ + สัปดาห์ก่อนหน้า) ----------
insert into energy_daily (day, kwh, cost)
select (now() at time zone 'Asia/Bangkok')::date - (14 - n)::int, kwh, cost
from unnest(
  array[155,189,168,229,203,112,95, 168,205,182,248,221,121,103],
  array[715,910,775,1120,975,505,425, 790,1010,860,1240,1080,560,470]
) with ordinality as t(kwh, cost, n);

-- ---------- พลังงานรายเดือน ม.ค.–ต.ค. 2026 รายคัน (แบ่งเท่ากัน 12 คัน) ----------
-- Depot 62% / สาธารณะ 38%; ค่าใช้จ่ายเฉลี่ย 4.82 บาท/kWh แบ่ง Depot Off-Peak 38% / Depot On-Peak 14% / DC 41% / AC 7%
insert into energy_monthly (month, vehicle_id, kwh_depot, kwh_public, cost_depot_offpeak, cost_depot_onpeak, cost_public_dc, cost_public_ac, co2_avoided_kg)
select make_date(2026, m.n::int, 1), v.id,
       round(m.kwh * 0.62 / 12, 3), round(m.kwh * 0.38 / 12, 3),
       round(m.kwh * 4.82 * 0.38 / 12, 2), round(m.kwh * 4.82 * 0.14 / 12, 2),
       round(m.kwh * 4.82 * 0.41 / 12, 2), round(m.kwh * 4.82 * 0.07 / 12, 2),
       round(m.co2 * 1000 / 12, 3)
from unnest(
  array[4200,4050,4580,4320,4890,5120,5340,5410,5280,1250],
  array[2.8,2.7,3.1,2.9,3.3,3.5,3.6,3.7,3.6,0.9]
) with ordinality as m(kwh, co2, n)
cross join (select id from vehicles) v;

-- ---------- สุขภาพแบตเฉลี่ยกองยานย้อนหลัง 11 เดือน ----------
insert into fleet_soh_monthly (month, avg_soh)
select (date_trunc('month', now()) - (12 - n)::int * interval '1 month')::date, soh
from unnest(array[97.6,97.4,97.3,97.1,96.9,96.8,96.6,96.4,96.2,96.0,95.9]) with ordinality as t(soh, n);
