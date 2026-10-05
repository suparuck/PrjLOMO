export type VehicleStatus = 'driving' | 'charging' | 'parked' | 'low' | 'offline'

export interface Vehicle {
  id: string
  model: string
  plate: string
  driverId: string
  soc: number
  soh: number
  range: number
  speed: number
  status: VehicleStatus
  location: string
  lat: number
  lng: number
  odometer: number
  efficiency: number // kWh/100km
  batteryKwh: number
}

export interface Driver {
  id: string
  name: string
  phone: string
  score: number
  km: number
  events: number
  trips: number
}

export interface Station {
  id: string
  name: string
  type: 'depot' | 'public'
  network: string
  lat: number
  lng: number
  ports: number
  busy: number
  power: string
  pricePerKwh: number
}

export interface ChargingSession {
  vehicleId: string
  stationName: string
  start: string
  fromSoc: number
  nowSoc: number
  targetSoc: number
  kw: number
  kwh: number
  cost: number
  eta: string
}

export interface ChargingHistory {
  vehicleId: string
  stationName: string
  date: string
  duration: string
  kwh: number
  cost: number
  fromSoc: number
  toSoc: number
}

export type AlertSeverity = 'critical' | 'warning' | 'info'
export type AlertType = 'battery' | 'charging' | 'device' | 'maint' | 'driving' | 'geofence'

export interface Alert {
  id: number
  severity: AlertSeverity
  type: AlertType
  title: string
  text: string
  vehicleId: string
  time: string
  acknowledged: boolean
}

export interface IceVehicle {
  id: string
  model: string
  kmPerDay: number
  maxKmPerDay: number
  fuelPerMonth: number
  readinessScore: number
  recommendedEv: string
}

export interface EnergyWeek {
  labels: string[]
  kwh: number[]
  cost: number[]
}

export interface EnergySummary {
  totalKwh: number
  kwhChangePct: number
  totalCost: number
  avgPricePerKwh: number
  efficiency: number
  efficiencyChangePct: number
}

export interface Sustainability {
  co2Tons: number
  treesEquivalent: number
  fuelSavings: number
  totalKm: number
  iceReadyCount: number
}

export interface Org {
  name: string
  city: string
  center: [number, number]
}
