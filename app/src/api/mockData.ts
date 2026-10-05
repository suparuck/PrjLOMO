import type {
  Alert,
  AlertSeverity,
  AlertType,
  ChargingHistory,
  ChargingSession,
  Driver,
  EnergyWeek,
  IceVehicle,
  Org,
  Station,
  Vehicle,
  VehicleStatus,
} from '../types'

export const org: Org = { name: 'EV Monitor', city: 'เชียงใหม่', center: [18.7883, 98.9853] }

type VRow = [string, string, string, string, number, number, number, number, VehicleStatus, string, number, number, number, number, number]
const vRows: VRow[] = [
  ['EV-001', 'BYD Dolphin', '1กข 1234', 'D01', 85, 97, 320, 52, 'driving', 'ตัวเมืองเชียงใหม่', 18.7905, 98.987, 18420, 13.8, 60.5],
  ['EV-002', 'MG4 Electric', '2กข 5678', 'D02', 62, 95, 210, 0, 'parked', 'หางดง', 18.687, 98.92, 24110, 15.2, 51],
  ['EV-003', 'BYD Atto 3', '3กข 9012', 'D03', 18, 93, 62, 0, 'low', 'สันกำแพง', 18.745, 99.12, 31250, 15.9, 60.5],
  ['EV-004', 'Neta V', '4กข 3456', 'D04', 78, 98, 290, 0, 'charging', 'สถานีชาร์จ Depot A', 18.7672, 98.963, 9870, 12.9, 38.5],
  ['EV-005', 'ORA Good Cat', '5กข 7890', 'D05', 91, 99, 340, 38, 'driving', 'นิมมานเหมินท์', 18.799, 98.967, 7650, 14.1, 63],
  ['EV-006', 'BYD Seal', '6กข 2345', 'D06', 54, 96, 280, 64, 'driving', 'แม่ริม', 18.915, 98.94, 15320, 15.0, 82.5],
  ['EV-007', 'Tesla Model 3', '7กข 6789', 'D07', 46, 94, 230, 0, 'parked', 'เซ็นทรัล เฟสติวัล', 18.807, 99.018, 28760, 14.4, 60],
  ['EV-008', 'MG ZS EV', '8กข 0123', 'D08', 33, 91, 120, 0, 'charging', 'PEA VOLTA สารภี', 18.71, 99.04, 40120, 16.8, 50.3],
  ['EV-009', 'Neta V', '9กข 4567', 'D09', 71, 97, 250, 0, 'offline', 'สันทราย', 18.85, 99.04, 11200, 13.1, 38.5],
  ['EV-010', 'BYD Dolphin', '1กค 8901', 'D10', 24, 95, 88, 41, 'low', 'แม่โจ้', 18.89, 99.01, 21980, 14.0, 44.9],
  ['EV-011', 'ORA Good Cat', '2กค 2345', 'D11', 67, 98, 255, 0, 'parked', 'มช. (CMU)', 18.802, 98.952, 6540, 13.9, 47.8],
  ['EV-012', 'BYD Atto 3', '3กค 6789', 'D12', 88, 96, 360, 57, 'driving', 'ดอยสะเก็ด', 18.87, 99.14, 17430, 15.4, 60.5],
]
export const vehicles: Vehicle[] = vRows.map(
  ([id, model, plate, driverId, soc, soh, range, speed, status, location, lat, lng, odometer, efficiency, batteryKwh]) => ({
    id, model, plate, driverId, soc, soh, range, speed, status, location, lat, lng, odometer, efficiency, batteryKwh,
  }),
)

type DRow = [string, string, string, number, number, number, number]
const dRows: DRow[] = [
  ['D01', 'สมชาย ใจดี', '081-234-5678', 92, 1840, 2, 64],
  ['D02', 'อนงค์ ศรีสุข', '082-345-6789', 88, 1520, 4, 58],
  ['D03', 'วิชัย คำแสน', '083-456-7890', 71, 2210, 12, 71],
  ['D04', 'มาลี บุญมา', '084-567-8901', 95, 1210, 1, 49],
  ['D05', 'ประเสริฐ ทองดี', '085-678-9012', 90, 1660, 3, 60],
  ['D06', 'กาญจนา แสงทอง', '086-789-0123', 84, 1980, 6, 66],
  ['D07', 'ธนพล วงศ์ใหญ่', '087-890-1234', 79, 2050, 8, 69],
  ['D08', 'สุดารัตน์ มีสุข', '088-901-2345', 67, 2390, 15, 75],
  ['D09', 'อำนาจ ปัญญา', '089-012-3456', 86, 1410, 4, 52],
  ['D10', 'รัตนา ดวงดี', '090-123-4567', 81, 1760, 7, 61],
  ['D11', 'ณัฐวุฒิ แก้วมา', '091-234-5678', 93, 1130, 2, 45],
  ['D12', 'พิมพ์ชนก ศรีวงศ์', '092-345-6789', 89, 1890, 3, 63],
]
export const drivers: Driver[] = dRows.map(([id, name, phone, score, km, events, trips]) => ({
  id, name, phone, score, km, events, trips,
}))

type SRow = [string, string, Station['type'], string, number, number, number, number, string, number]
const sRows: SRow[] = [
  ['S1', 'Depot A (สำนักงานใหญ่)', 'depot', 'ภายในองค์กร', 18.7672, 98.963, 6, 2, 'AC 22 kW / DC 60 kW', 4.2],
  ['S2', 'Depot B (สันกำแพง)', 'depot', 'ภายในองค์กร', 18.748, 99.105, 4, 0, 'AC 22 kW', 4.2],
  ['S3', 'PEA VOLTA สารภี', 'public', 'PEA VOLTA', 18.71, 99.04, 4, 3, 'DC 120 kW', 7.5],
  ['S4', 'EleXA แม่ริม', 'public', 'EleXA', 18.905, 98.95, 2, 1, 'DC 100 kW', 7.0],
  ['S5', 'EA Anywhere นิมมาน', 'public', 'EA Anywhere', 18.7965, 98.969, 3, 1, 'DC 50 kW', 7.9],
  ['S6', 'PTT EV Station สันทราย', 'public', 'PTT EV', 18.855, 99.03, 4, 2, 'DC 120 kW', 7.5],
]
export const stations: Station[] = sRows.map(([id, name, type, network, lat, lng, ports, busy, power, pricePerKwh]) => ({
  id, name, type, network, lat, lng, ports, busy, power, pricePerKwh,
}))

export const sessions: ChargingSession[] = [
  { vehicleId: 'EV-004', stationName: 'Depot A (สำนักงานใหญ่)', start: '10:05', fromSoc: 41, nowSoc: 78, targetSoc: 90, kw: 60, kwh: 14.2, cost: 59.6, eta: '18 นาที' },
  { vehicleId: 'EV-008', stationName: 'PEA VOLTA สารภี', start: '10:22', fromSoc: 12, nowSoc: 33, targetSoc: 80, kw: 112, kwh: 10.6, cost: 79.5, eta: '21 นาที' },
]

type HRow = [string, string, string, string, number, number, number, number]
const hRows: HRow[] = [
  ['EV-005', 'Depot A (สำนักงานใหญ่)', 'วันนี้ 06:10', '52 นาที', 31.5, 132.3, 38, 91],
  ['EV-012', 'PTT EV Station สันทราย', 'วันนี้ 05:40', '35 นาที', 28.0, 210.0, 40, 88],
  ['EV-001', 'Depot A (สำนักงานใหญ่)', 'เมื่อวาน 21:00', '4 ชม. 10 นาที', 36.3, 152.5, 25, 85],
  ['EV-006', 'EleXA แม่ริม', 'เมื่อวาน 17:25', '41 นาที', 44.6, 312.2, 20, 74],
  ['EV-007', 'EA Anywhere นิมมาน', 'เมื่อวาน 13:05', '58 นาที', 30.0, 237.0, 22, 72],
  ['EV-002', 'Depot B (สันกำแพง)', 'เมื่อวาน 08:00', '2 ชม. 20 นาที', 25.5, 107.1, 12, 62],
]
export const history: ChargingHistory[] = hRows.map(([vehicleId, stationName, date, duration, kwh, cost, fromSoc, toSoc]) => ({
  vehicleId, stationName, date, duration, kwh, cost, fromSoc, toSoc,
}))

type ARow = [number, AlertSeverity, AlertType, string, string, string, string, boolean]
const aRows: ARow[] = [
  [1, 'critical', 'battery', 'แบตเตอรี่ต่ำมาก', 'EV-003 แบตเตอรี่เหลือ 18% ระยะวิ่งประมาณ 62 กม.', 'EV-003', '5 นาทีที่แล้ว', false],
  [2, 'warning', 'battery', 'แบตเตอรี่ต่ำ', 'EV-010 แบตเตอรี่ต่ำกว่า 30% ระหว่างการเดินทาง', 'EV-010', '12 นาทีที่แล้ว', false],
  [3, 'info', 'charging', 'เริ่มชาร์จ', 'EV-008 เริ่มชาร์จที่ PEA VOLTA สารภี (DC 112 kW)', 'EV-008', '18 นาทีที่แล้ว', false],
  [4, 'warning', 'device', 'รถออฟไลน์', 'EV-009 ไม่ส่งข้อมูลมากกว่า 40 นาที', 'EV-009', '42 นาทีที่แล้ว', false],
  [5, 'warning', 'driving', 'ขับเร็วเกินกำหนด', 'EV-006 ความเร็ว 104 กม./ชม. บนถนนโชตนา', 'EV-006', '1 ชม.ที่แล้ว', true],
  [6, 'info', 'charging', 'ชาร์จเสร็จสิ้น', 'EV-005 ชาร์จถึง 91% ที่ Depot A', 'EV-005', '3 ชม.ที่แล้ว', true],
  [7, 'critical', 'maint', 'ถึงกำหนดบำรุงรักษา', 'EV-008 ครบระยะเช็กระบบเบรกและยาง (40,000 กม.)', 'EV-008', '5 ชม.ที่แล้ว', false],
  [8, 'info', 'geofence', 'ออกนอกพื้นที่ที่กำหนด', 'EV-012 ออกจากเขตเมืองเชียงใหม่ไปยังดอยสะเก็ด', 'EV-012', '6 ชม.ที่แล้ว', true],
]
export const alerts: Alert[] = aRows.map(([id, severity, type, title, text, vehicleId, time, acknowledged]) => ({
  id, severity, type, title, text, vehicleId, time, acknowledged,
}))

export const energyWeek: EnergyWeek = {
  labels: ['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.'],
  kwh: [168, 205, 182, 248, 221, 121, 103],
  cost: [790, 1010, 860, 1240, 1080, 560, 470],
}

type IRow = [string, string, number, number, number, number, string]
const iRows: IRow[] = [
  ['ICE-21', 'Toyota Hilux Revo', 96, 180, 9800, 92, 'BYD Shark 6 / Isuzu D-Max EV'],
  ['ICE-22', 'Toyota Yaris Ativ', 74, 140, 6100, 95, 'BYD Dolphin'],
  ['ICE-23', 'Honda City', 120, 260, 7900, 81, 'MG4 Electric'],
  ['ICE-24', 'Toyota Commuter', 210, 420, 16800, 48, 'รอรุ่นรถตู้ EV ระยะไกล'],
  ['ICE-25', 'Isuzu D-Max', 160, 380, 12500, 63, 'BYD Shark 6 (PHEV)'],
]
export const iceVehicles: IceVehicle[] = iRows.map(
  ([id, model, kmPerDay, maxKmPerDay, fuelPerMonth, readinessScore, recommendedEv]) => ({
    id, model, kmPerDay, maxKmPerDay, fuelPerMonth, readinessScore, recommendedEv,
  }),
)
