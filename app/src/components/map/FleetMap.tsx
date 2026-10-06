'use client'

import { useEffect, useRef } from 'react'
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { StationPopup, VehiclePopup, stationIcon, vehicleIcon } from './markers'
import { TILE_ATTRIBUTION, TILE_URL } from '@/lib/mapConfig'
import type { Driver, Station, Vehicle } from '@/types'

/** จัดมุมมองครั้งเดียวตอนมีข้อมูล — ข้อมูลที่อัปเดตเรียลไทม์ต้องไม่ดึงแผนที่กลับมาที่เดิม */
function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap()
  const done = useRef(false)
  useEffect(() => {
    if (!done.current && points.length) {
      map.fitBounds(points, { padding: [30, 30] })
      done.current = true
    }
  }, [map, points])
  return null
}

/** แผนที่ย่อ (Dashboard / รายละเอียดรถ) — fit=false จะใช้ center/zoom ที่ส่งมา */
export default function FleetMap({
  vehicles,
  stations,
  drivers,
  center,
  height = 330,
  zoom = 10,
  fit = true,
}: {
  vehicles: Vehicle[]
  stations: Station[]
  drivers: Driver[]
  center: [number, number]
  height?: number
  zoom?: number
  fit?: boolean
}) {
  const points = vehicles.map((v) => [v.lat, v.lng] as [number, number])
  return (
    <div className="map-box" style={{ height }}>
      <MapContainer center={center} zoom={zoom} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxZoom={19} />
        {fit && <FitBounds points={points} />}
        {stations.map((s) => (
          <Marker key={s.id} position={[s.lat, s.lng]} icon={stationIcon(s)}>
            <Popup>
              <StationPopup station={s} />
            </Popup>
          </Marker>
        ))}
        {vehicles.map((v) => (
          <Marker key={v.id} position={[v.lat, v.lng]} icon={vehicleIcon(v)}>
            <Popup>
              <VehiclePopup vehicle={v} drivers={drivers} />
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}
