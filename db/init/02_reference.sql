-- ============================================================
-- ข้อมูลอ้างอิงและค่าตั้งต้นของระบบ — ใช้กับ "ทุกการติดตั้ง" (รวมกองยานว่างเปล่า)
-- ไม่มีผู้ใช้ รถ คนขับ สถานี หรือข้อมูลเดโมใด ๆ: ผู้ดูแลคนแรกสร้างด้วย
--   docker compose exec api node dist/cli.js create-admin --email … --name …
-- ข้อมูลเดโมอยู่ที่ db/demo/ (รันเมื่อ SEED_DEMO=true เท่านั้น — ดู db/init/03_demo.sh)
-- ============================================================

-- ค่าเริ่มต้นขององค์กร: แก้ชื่อได้ที่ ตั้งค่า > องค์กร · เมือง/จุดกึ่งกลางแผนที่ตั้งตอนติดตั้งด้วย ORG_CITY/ORG_LAT/ORG_LNG (03_demo.sh)
insert into app_settings (id, city, center_lat, center_lng, org, thresholds, notify, charging) values (
  1, 'กรุงเทพมหานคร', 13.7563, 100.5018,
  '{"name":"องค์กรของคุณ","fleetName":"กองยาน EV","timezone":"Asia/Bangkok (UTC+07:00)","distanceUnit":"กิโลเมตร","language":"ไทย","currency":"บาท (฿)"}',
  '{"lowBattery":30,"criticalBattery":20,"maxSpeed":100,"offlineMinutes":30}',
  '{"email":true,"line":true,"sms":false,"dailyDigest":true}',
  '{"tariff":"TOU (On-Peak / Off-Peak)","offPeak":"2.60","onPeak":"5.80","defaultTarget":"80%","smartSchedule":true,"demandLimit":true}'
);

-- การเชื่อมต่อ: ยังไม่เชื่อมต่อสิ่งใด (สถานะ LINE แสดงตามการตั้งค่า token จริงที่ API; อุปกรณ์เชื่อมผ่าน API key ที่ตั้งค่า > การเชื่อมต่อ)
insert into integrations (key, name, description, logo, color_token, connected, action_label, sort) values
  ('obd',  'อุปกรณ์ Telematics',     'ส่งข้อมูลรถเข้าระบบผ่าน API (X-API-Key)', 'OBD',  'navy-900', false, 'สร้างคีย์',    1),
  ('pea',  'PEA VOLTA',              'ดึงข้อมูลเซสชันชาร์จสาธารณะ',       'PEA',  'navy-700', false, 'เชื่อมต่อ',    2),
  ('ea',   'EA Anywhere',            'บัตรสมาชิกองค์กร',                  'EA',   'green',    false, 'เชื่อมต่อ',    3),
  ('line', 'LINE Official Account',  'ส่งการแจ้งเตือน',                   'LINE', 'green',    false, 'ตั้งค่า',      4),
  ('api',  'REST API / Webhook',     'ส่งข้อมูลไป ERP หรือ BI',           'API',  'blue',     false, 'สร้างคีย์',    5),
  ('sso',  'Single Sign-On',         'Microsoft Entra ID / Google',       'SSO',  'red',      false, 'ตั้งค่า',      6);

insert into vehicle_models (model, brand, spec_range_km) values
  ('BYD Dolphin',   'BYD',   410),
  ('MG4 Electric',  'MG',    350),
  ('BYD Atto 3',    'BYD',   420),
  ('Neta V',        'Neta',  384),
  ('ORA Good Cat',  'ORA',   400),
  ('BYD Seal',      'BYD',   510),
  ('Tesla Model 3', 'Tesla', 491),
  ('MG ZS EV',      'MG',    403);

insert into alert_rules (key, title, text, enabled, sort) values
  ('low',     'แบตต่ำกว่า 30%',                'แจ้งผู้จัดการและคนขับ',          true,  1),
  ('offline', 'รถออฟไลน์เกิน 30 นาที',         'แจ้งผู้ดูแลระบบ',                true,  2),
  ('speed',   'ความเร็วเกิน 100 กม./ชม.',      'บันทึกเป็นเหตุการณ์การขับ',      true,  3),
  ('charge',  'ชาร์จเสร็จ / หยุดชาร์จผิดปกติ',  'แจ้งคนขับผ่านแอป',               true,  4),
  ('geo',     'ออกนอกพื้นที่ (Geofence)',      'เขตที่กำหนด',                    false, 5);

insert into notification_channels (key, name, detail, icon, tone, enabled, sort) values
  ('inapp', 'ในระบบ',                'เปิดใช้งาน',                'bell',  'navy',  true, 1),
  ('email', 'อีเมล',                 'ผู้ดูแลและผู้จัดการ',        'globe', 'blue',  true, 2),
  ('line',  'LINE Official Account', 'ตามที่ตั้งค่า LINE_TO',      'phone', 'green', true, 3);

-- สมมติฐานของรายงาน (ค่ากลางที่ใช้ได้ทั่วไป ปรับได้โดยไม่ต้องแก้โค้ด) — ตัวเลขเปรียบเทียบปีก่อน/ประสิทธิภาพเป็น 0 จนกว่าจะมีข้อมูลจริง
insert into report_config (key, value, description) values
  ('grid_kg_per_kwh',            '0.4',   'ค่าการปล่อย CO₂ ของไฟฟ้ากริดไทย (kgCO₂/kWh)'),
  ('tree_kg_per_year',           '22',    'CO₂ ที่ต้นไม้ 1 ต้นดูดซับต่อปี (kg)'),
  ('oil_cost_per_km',            '2.48',  'ต้นทุนน้ำมันเทียบเท่าต่อกิโลเมตร (บาท)'),
  ('kwh_change_vs_last_year_pct','0',     'พลังงานรวมเทียบปีก่อน (%) — จนกว่าจะมีข้อมูลปีก่อน'),
  ('efficiency_change_pct',      '0',     'ประสิทธิภาพ kWh/100กม. ดีขึ้นเทียบช่วงก่อน (%) — จนกว่าจะมีข้อมูลช่วงก่อน'),
  ('actual_range_ratio',         '0.86',  'สัดส่วนระยะวิ่งใช้งานจริงเทียบสเปก'),
  ('co2_g_per_km',               '{"sedan":165,"diesel":210,"hybrid":105,"evSolar":12}', 'การปล่อย CO₂ ต่อกม. ของรถแต่ละประเภท (g)'),
  ('ev_estimate',                '{"workingDays":26,"kwhPerKm":0.15,"pricePerKwh":4.8}', 'สูตรประมาณค่าไฟ EV ต่อเดือนของรถสันดาปที่ยังเหลือ'),
  ('tco_names',                  '{"ice":"รถสันดาป","ev":"EV"}', 'ชื่อรถที่ใช้เปรียบเทียบ TCO'),
  ('default_efficiency',         '15',    'ประสิทธิภาพตั้งต้นของรถใหม่ (kWh/100กม.)');
