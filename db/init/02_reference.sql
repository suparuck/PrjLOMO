-- ============================================================
-- ข้อมูลอ้างอิงและค่าตั้งต้นของระบบ (ย้ายมาจาก mockup data เดิม)
-- ============================================================

insert into app_settings (id, city, center_lat, center_lng, org, thresholds, notify, charging) values (
  1, 'เชียงใหม่', 18.7883, 98.9853,
  '{"name":"บริษัท ตัวอย่าง จำกัด","fleetName":"EV Fleet เชียงใหม่","timezone":"Asia/Bangkok (UTC+07:00)","distanceUnit":"กิโลเมตร","language":"ไทย","currency":"บาท (฿)"}',
  '{"lowBattery":30,"criticalBattery":20,"maxSpeed":100,"offlineMinutes":30}',
  '{"email":true,"line":true,"sms":false,"dailyDigest":true}',
  '{"tariff":"TOU (On-Peak / Off-Peak)","offPeak":"2.60","onPeak":"5.80","defaultTarget":"80%","smartSchedule":true,"demandLimit":true}'
);

-- ผู้ใช้เดโม (รหัสผ่านเดโม demo1234 — ต้องลบ/เปลี่ยนก่อนใช้งานจริง)
insert into users (email, name, role, status, password_hash, last_login_at) values
  ('admin@evmonitor.co.th', 'Admin EV',          'admin',   'active', crypt('demo1234', gen_salt('bf', 10)), now()),
  ('prasit@company.co.th',  'ประสิทธิ์ สายทอง',   'manager', 'active', crypt('demo1234', gen_salt('bf', 10)), now() - interval '2 hours'),
  ('wanna@company.co.th',   'วรรณา รักดี',        'viewer',  'active', crypt('demo1234', gen_salt('bf', 10)), now() - interval '1 day');

insert into integrations (key, name, description, logo, color_token, connected, action_label, sort) values
  ('obd',  'อุปกรณ์ Telematics',     '12 อุปกรณ์ · ออนไลน์ 11',          'OBD',  'navy-900', true,  null,           1),
  ('pea',  'PEA VOLTA',              'ดึงข้อมูลเซสชันชาร์จสาธารณะ',       'PEA',  'navy-700', true,  null,           2),
  ('ea',   'EA Anywhere',            'บัตรสมาชิกองค์กร',                  'EA',   'green',    false, 'เชื่อมต่อ',    3),
  ('line', 'LINE Official Account',  'ส่งการแจ้งเตือน',                   'LINE', 'green',    true,  null,           4),
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

insert into stations (id, name, type, network, lat, lng, ports, busy_ports, power_label, price_per_kwh) values
  ('S1', 'Depot A (สำนักงานใหญ่)', 'depot',  'ภายในองค์กร', 18.7672, 98.9630, 6, 2, 'AC 22 kW / DC 60 kW', 4.20),
  ('S2', 'Depot B (สันกำแพง)',     'depot',  'ภายในองค์กร', 18.7480, 99.1050, 4, 0, 'AC 22 kW',            4.20),
  ('S3', 'PEA VOLTA สารภี',        'public', 'PEA VOLTA',   18.7100, 99.0400, 4, 3, 'DC 120 kW',           7.50),
  ('S4', 'EleXA แม่ริม',            'public', 'EleXA',       18.9050, 98.9500, 2, 1, 'DC 100 kW',           7.00),
  ('S5', 'EA Anywhere นิมมาน',      'public', 'EA Anywhere', 18.7965, 98.9690, 3, 1, 'DC 50 kW',            7.90),
  ('S6', 'PTT EV Station สันทราย',  'public', 'PTT EV',      18.8550, 99.0300, 4, 2, 'DC 120 kW',           7.50);

insert into alert_rules (key, title, text, enabled, sort) values
  ('low',     'แบตต่ำกว่า 30%',                'แจ้งผู้จัดการและคนขับ',          true,  1),
  ('offline', 'รถออฟไลน์เกิน 30 นาที',         'แจ้งผู้ดูแลระบบ',                true,  2),
  ('speed',   'ความเร็วเกิน 100 กม./ชม.',      'บันทึกเป็นเหตุการณ์การขับ',      true,  3),
  ('charge',  'ชาร์จเสร็จ / หยุดชาร์จผิดปกติ',  'แจ้งคนขับผ่านแอป',               true,  4),
  ('geo',     'ออกนอกพื้นที่ (Geofence)',      'เขตเมืองเชียงใหม่',              false, 5);

insert into notification_channels (key, name, detail, icon, tone, enabled, sort) values
  ('inapp', 'ในระบบ',                'เปิดใช้งาน',                'bell',  'navy',  true, 1),
  ('email', 'อีเมล',                 'fleet@company.co.th',       'globe', 'blue',  true, 2),
  ('line',  'LINE Official Account', 'กลุ่มผู้จัดการกองยาน',       'phone', 'green', true, 3);

insert into ice_vehicles (id, model, km_per_day, max_km_per_day, fuel_per_month, readiness_score, recommended_ev) values
  ('ICE-21', 'Toyota Hilux Revo', 96,  180, 9800,  92, 'BYD Shark 6 / Isuzu D-Max EV'),
  ('ICE-22', 'Toyota Yaris Ativ', 74,  140, 6100,  95, 'BYD Dolphin'),
  ('ICE-23', 'Honda City',        120, 260, 7900,  81, 'MG4 Electric'),
  ('ICE-24', 'Toyota Commuter',   210, 420, 16800, 48, 'รอรุ่นรถตู้ EV ระยะไกล'),
  ('ICE-25', 'Isuzu D-Max',       160, 380, 12500, 63, 'BYD Shark 6 (PHEV)');

insert into tco_items (sort, label, ice_cost, ev_cost) values
  (1, 'ราคารถ',             559000, 569900),
  (2, 'พลังงาน 5 ปี',       372000, 104000),
  (3, 'บำรุงรักษา 5 ปี',     68000,  30000),
  (4, 'ภาษี/ประกัน 5 ปี',    95000,  72000);

insert into report_config (key, value, description) values
  ('grid_kg_per_kwh',            '0.4',   'ค่าการปล่อย CO₂ ของไฟฟ้ากริดไทย (kgCO₂/kWh)'),
  ('tree_kg_per_year',           '22',    'CO₂ ที่ต้นไม้ 1 ต้นดูดซับต่อปี (kg)'),
  ('oil_cost_per_km',            '2.48',  'ต้นทุนน้ำมันเทียบเท่าต่อกิโลเมตร (บาท)'),
  ('kwh_change_vs_last_year_pct','12',    'พลังงานรวมเทียบปีก่อน (%) — จนกว่าจะมีข้อมูลปีก่อน'),
  ('efficiency_change_pct',      '2.1',   'ประสิทธิภาพ kWh/100กม. ดีขึ้นเทียบช่วงก่อน (%) — จนกว่าจะมีข้อมูลช่วงก่อน'),
  ('actual_range_ratio',         '0.86',  'สัดส่วนระยะวิ่งใช้งานจริงเทียบสเปก'),
  ('co2_g_per_km',               '{"sedan":165,"diesel":210,"hybrid":105,"evSolar":12}', 'การปล่อย CO₂ ต่อกม. ของรถแต่ละประเภท (g)'),
  ('ev_estimate',                '{"workingDays":26,"kwhPerKm":0.15,"pricePerKwh":4.8}', 'สูตรประมาณค่าไฟ EV ต่อเดือนของรถสันดาปที่จะเปลี่ยน'),
  ('tco_names',                  '{"ice":"รถสันดาป (Yaris Ativ)","ev":"EV (BYD Dolphin)"}', 'ชื่อรถที่ใช้เปรียบเทียบ TCO'),
  ('default_efficiency',         '15',    'ประสิทธิภาพตั้งต้นของรถใหม่ (kWh/100กม.)');
