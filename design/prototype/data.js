/* ==========================================================
   EV Monitor — ข้อมูลตัวอย่าง (Mock data)
   เปลี่ยนเป็นการเรียก API จริงได้ภายหลัง
   ========================================================== */
const EV = {
  org: { name: "EV Monitor", city: "เชียงใหม่", center: [18.7883, 98.9853] },

  vehicles: [
    { id: "EV-001", model: "BYD Dolphin",   plate: "1กข 1234", driver: "D01", soc: 85, soh: 97, range: 320, speed: 52, status: "driving",  loc: "ตัวเมืองเชียงใหม่", lat: 18.7905, lng: 98.9870, odo: 18420, eff: 13.8, battery: 60.5 },
    { id: "EV-002", model: "MG4 Electric",  plate: "2กข 5678", driver: "D02", soc: 62, soh: 95, range: 210, speed: 0,  status: "parked",   loc: "หางดง",             lat: 18.6870, lng: 98.9200, odo: 24110, eff: 15.2, battery: 51 },
    { id: "EV-003", model: "BYD Atto 3",    plate: "3กข 9012", driver: "D03", soc: 18, soh: 93, range: 62,  speed: 0,  status: "low",      loc: "สันกำแพง",          lat: 18.7450, lng: 99.1200, odo: 31250, eff: 15.9, battery: 60.5 },
    { id: "EV-004", model: "Neta V",        plate: "4กข 3456", driver: "D04", soc: 78, soh: 98, range: 290, speed: 0,  status: "charging", loc: "สถานีชาร์จ Depot A", lat: 18.7672, lng: 98.9630, odo: 9870,  eff: 12.9, battery: 38.5 },
    { id: "EV-005", model: "ORA Good Cat",  plate: "5กข 7890", driver: "D05", soc: 91, soh: 99, range: 340, speed: 38, status: "driving",  loc: "นิมมานเหมินท์",      lat: 18.7990, lng: 98.9670, odo: 7650,  eff: 14.1, battery: 63 },
    { id: "EV-006", model: "BYD Seal",      plate: "6กข 2345", driver: "D06", soc: 54, soh: 96, range: 280, speed: 64, status: "driving",  loc: "แม่ริม",             lat: 18.9150, lng: 98.9400, odo: 15320, eff: 15.0, battery: 82.5 },
    { id: "EV-007", model: "Tesla Model 3", plate: "7กข 6789", driver: "D07", soc: 46, soh: 94, range: 230, speed: 0,  status: "parked",   loc: "เซ็นทรัล เฟสติวัล",   lat: 18.8070, lng: 99.0180, odo: 28760, eff: 14.4, battery: 60 },
    { id: "EV-008", model: "MG ZS EV",      plate: "8กข 0123", driver: "D08", soc: 33, soh: 91, range: 120, speed: 0,  status: "charging", loc: "PEA VOLTA สารภี",     lat: 18.7100, lng: 99.0400, odo: 40120, eff: 16.8, battery: 50.3 },
    { id: "EV-009", model: "Neta V",        plate: "9กข 4567", driver: "D09", soc: 71, soh: 97, range: 250, speed: 0,  status: "offline",  loc: "สันทราย",           lat: 18.8500, lng: 99.0400, odo: 11200, eff: 13.1, battery: 38.5 },
    { id: "EV-010", model: "BYD Dolphin",   plate: "1กค 8901", driver: "D10", soc: 24, soh: 95, range: 88,  speed: 41, status: "low",      loc: "แม่โจ้",             lat: 18.8900, lng: 99.0100, odo: 21980, eff: 14.0, battery: 44.9 },
    { id: "EV-011", model: "ORA Good Cat",  plate: "2กค 2345", driver: "D11", soc: 67, soh: 98, range: 255, speed: 0,  status: "parked",   loc: "มช. (CMU)",          lat: 18.8020, lng: 98.9520, odo: 6540,  eff: 13.9, battery: 47.8 },
    { id: "EV-012", model: "BYD Atto 3",    plate: "3กค 6789", driver: "D12", soc: 88, soh: 96, range: 360, speed: 57, status: "driving",  loc: "ดอยสะเก็ด",          lat: 18.8700, lng: 99.1400, odo: 17430, eff: 15.4, battery: 60.5 },
  ],

  drivers: [
    { id: "D01", name: "สมชาย ใจดี",      phone: "081-234-5678", score: 92, km: 1840, events: 2,  trips: 64 },
    { id: "D02", name: "อนงค์ ศรีสุข",     phone: "082-345-6789", score: 88, km: 1520, events: 4,  trips: 58 },
    { id: "D03", name: "วิชัย คำแสน",      phone: "083-456-7890", score: 71, km: 2210, events: 12, trips: 71 },
    { id: "D04", name: "มาลี บุญมา",       phone: "084-567-8901", score: 95, km: 1210, events: 1,  trips: 49 },
    { id: "D05", name: "ประเสริฐ ทองดี",   phone: "085-678-9012", score: 90, km: 1660, events: 3,  trips: 60 },
    { id: "D06", name: "กาญจนา แสงทอง",   phone: "086-789-0123", score: 84, km: 1980, events: 6,  trips: 66 },
    { id: "D07", name: "ธนพล วงศ์ใหญ่",    phone: "087-890-1234", score: 79, km: 2050, events: 8,  trips: 69 },
    { id: "D08", name: "สุดารัตน์ มีสุข",   phone: "088-901-2345", score: 67, km: 2390, events: 15, trips: 75 },
    { id: "D09", name: "อำนาจ ปัญญา",      phone: "089-012-3456", score: 86, km: 1410, events: 4,  trips: 52 },
    { id: "D10", name: "รัตนา ดวงดี",      phone: "090-123-4567", score: 81, km: 1760, events: 7,  trips: 61 },
    { id: "D11", name: "ณัฐวุฒิ แก้วมา",    phone: "091-234-5678", score: 93, km: 1130, events: 2,  trips: 45 },
    { id: "D12", name: "พิมพ์ชนก ศรีวงศ์",  phone: "092-345-6789", score: 89, km: 1890, events: 3,  trips: 63 },
  ],

  stations: [
    { id: "S1", name: "Depot A (สำนักงานใหญ่)", type: "depot",  network: "ภายในองค์กร", lat: 18.7672, lng: 98.9630, ports: 6, busy: 2, power: "AC 22 kW / DC 60 kW", price: 4.2 },
    { id: "S2", name: "Depot B (สันกำแพง)",     type: "depot",  network: "ภายในองค์กร", lat: 18.7480, lng: 99.1050, ports: 4, busy: 0, power: "AC 22 kW",            price: 4.2 },
    { id: "S3", name: "PEA VOLTA สารภี",        type: "public", network: "PEA VOLTA",   lat: 18.7100, lng: 99.0400, ports: 4, busy: 3, power: "DC 120 kW",           price: 7.5 },
    { id: "S4", name: "EleXA แม่ริม",            type: "public", network: "EleXA",       lat: 18.9050, lng: 98.9500, ports: 2, busy: 1, power: "DC 100 kW",           price: 7.0 },
    { id: "S5", name: "EA Anywhere นิมมาน",      type: "public", network: "EA Anywhere", lat: 18.7965, lng: 98.9690, ports: 3, busy: 1, power: "DC 50 kW",            price: 7.9 },
    { id: "S6", name: "PTT EV Station สันทราย",  type: "public", network: "PTT EV",      lat: 18.8550, lng: 99.0300, ports: 4, busy: 2, power: "DC 120 kW",           price: 7.5 },
  ],

  sessions: [
    { v: "EV-004", st: "Depot A (สำนักงานใหญ่)", start: "10:05", from: 41, now: 78, target: 90, kw: 60,  kwh: 14.2, cost: 59.6, eta: "18 นาที" },
    { v: "EV-008", st: "PEA VOLTA สารภี",        start: "10:22", from: 12, now: 33, target: 80, kw: 112, kwh: 10.6, cost: 79.5, eta: "21 นาที" },
  ],

  history: [
    { v: "EV-005", st: "Depot A (สำนักงานใหญ่)", date: "วันนี้ 06:10",  dur: "52 นาที",   kwh: 31.5, cost: 132.3, from: 38, to: 91 },
    { v: "EV-012", st: "PTT EV Station สันทราย",  date: "วันนี้ 05:40",  dur: "35 นาที",   kwh: 28.0, cost: 210.0, from: 40, to: 88 },
    { v: "EV-001", st: "Depot A (สำนักงานใหญ่)", date: "เมื่อวาน 21:00", dur: "4 ชม. 10 นาที", kwh: 36.3, cost: 152.5, from: 25, to: 85 },
    { v: "EV-006", st: "EleXA แม่ริม",            date: "เมื่อวาน 17:25", dur: "41 นาที",   kwh: 44.6, cost: 312.2, from: 20, to: 74 },
    { v: "EV-007", st: "EA Anywhere นิมมาน",      date: "เมื่อวาน 13:05", dur: "58 นาที",   kwh: 30.0, cost: 237.0, from: 22, to: 72 },
    { v: "EV-002", st: "Depot B (สันกำแพง)",      date: "เมื่อวาน 08:00", dur: "2 ชม. 20 นาที", kwh: 25.5, cost: 107.1, from: 12, to: 62 },
  ],

  alerts: [
    { id: 1, sev: "critical", type: "battery",  title: "แบตเตอรี่ต่ำมาก",           text: "EV-003 แบตเตอรี่เหลือ 18% ระยะวิ่งประมาณ 62 กม.", v: "EV-003", time: "5 นาทีที่แล้ว",  ack: false },
    { id: 2, sev: "warning",  type: "battery",  title: "แบตเตอรี่ต่ำ",               text: "EV-010 แบตเตอรี่ต่ำกว่า 30% ระหว่างการเดินทาง",   v: "EV-010", time: "12 นาทีที่แล้ว", ack: false },
    { id: 3, sev: "info",     type: "charging", title: "เริ่มชาร์จ",                  text: "EV-008 เริ่มชาร์จที่ PEA VOLTA สารภี (DC 112 kW)", v: "EV-008", time: "18 นาทีที่แล้ว", ack: false },
    { id: 4, sev: "warning",  type: "device",   title: "รถออฟไลน์",                  text: "EV-009 ไม่ส่งข้อมูลมากกว่า 40 นาที",               v: "EV-009", time: "42 นาทีที่แล้ว", ack: false },
    { id: 5, sev: "warning",  type: "driving",  title: "ขับเร็วเกินกำหนด",            text: "EV-006 ความเร็ว 104 กม./ชม. บนถนนโชตนา",          v: "EV-006", time: "1 ชม.ที่แล้ว",   ack: true },
    { id: 6, sev: "info",     type: "charging", title: "ชาร์จเสร็จสิ้น",               text: "EV-005 ชาร์จถึง 91% ที่ Depot A",                  v: "EV-005", time: "3 ชม.ที่แล้ว",   ack: true },
    { id: 7, sev: "critical", type: "maint",    title: "ถึงกำหนดบำรุงรักษา",          text: "EV-008 ครบระยะเช็กระบบเบรกและยาง (40,000 กม.)",     v: "EV-008", time: "5 ชม.ที่แล้ว",   ack: false },
    { id: 8, sev: "info",     type: "geofence", title: "ออกนอกพื้นที่ที่กำหนด",       text: "EV-012 ออกจากเขตเมืองเชียงใหม่ไปยังดอยสะเก็ด",     v: "EV-012", time: "6 ชม.ที่แล้ว",   ack: true },
  ],

  energyWeek: { labels: ["จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส.", "อา."], kwh: [168, 205, 182, 248, 221, 121, 103], cost: [790, 1010, 860, 1240, 1080, 560, 470] },
  energyYear: { labels: ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค."], kwh: [4200,4050,4580,4320,4890,5120,5340,5410,5280,1250], co2: [2.8,2.7,3.1,2.9,3.3,3.5,3.6,3.7,3.6,0.9] },

  // รถสันดาป (ICE) ที่ยังเหลือในกองยาน — สำหรับรายงานความพร้อมเปลี่ยนเป็น EV
  ice: [
    { id: "ICE-21", model: "Toyota Hilux Revo", kmDay: 96,  maxDay: 180, fuel: 9800, score: 92, pick: "BYD Shark 6 / Isuzu D-Max EV" },
    { id: "ICE-22", model: "Toyota Yaris Ativ",  kmDay: 74,  maxDay: 140, fuel: 6100, score: 95, pick: "BYD Dolphin" },
    { id: "ICE-23", model: "Honda City",          kmDay: 120, maxDay: 260, fuel: 7900, score: 81, pick: "MG4 Electric" },
    { id: "ICE-24", model: "Toyota Commuter",     kmDay: 210, maxDay: 420, fuel: 16800, score: 48, pick: "รอรุ่นรถตู้ EV ระยะไกล" },
    { id: "ICE-25", model: "Isuzu D-Max",         kmDay: 160, maxDay: 380, fuel: 12500, score: 63, pick: "BYD Shark 6 (PHEV)" },
  ],
};

EV.driverById = id => EV.drivers.find(d => d.id === id);
EV.vehicleById = id => EV.vehicles.find(v => v.id === id);
