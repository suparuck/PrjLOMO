'use client'

import { useEffect } from 'react'
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import Link from 'next/link'
import { iconSvg } from '../ui/Icon'
import { StatusBadge } from '../ui/StatusBadge'
import { STATUS } from '@/lib/status'
import type { Driver, Station, Vehicle } from '@/types'

const vehicleIcon = (v: Vehicle) =>
  L.divIcon({
    html: `<div class="vm ${STATUS[v.status].cls}">${iconSvg(v.status === 'charging' ? 'bolt' : 'car', 14)}</div><div class="vm-label">${v.id}</div>`,
    className: 'vm-wrap',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  })

const stationIcon = (s: Station) =>
  L.divIcon({
    html: `<div class="sm ${s.type}">${iconSvg('plug', 13)}</div>`,
    className: 'vm-wrap',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  })

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (points.length) map.fitBounds(points, { padding: [30, 30] })
  }, [map, points])
  return null
}

export default function FleetMap({
  vehicles,
  stations,
  drivers,
  center,
  height = 330,
  zoom = 10,
}: {
  vehicles: Vehicle[]
  stations: Station[]
  drivers: Driver[]
  center: [number, number]
  height?: number
  zoom?: number
}) {
  const points = vehicles.map((v) => [v.lat, v.lng] as [number, number])
  return (
    <div className="map-box" style={{ height }}>
      <MapContainer center={center} zoom={zoom} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution="&copy; OpenStreetMap &copy; CARTO"
          subdomains="abcd"
          maxZoom={19}
        />
        <FitBounds points={points} />
        {stations.map((s) => (
          <Marker key={s.id} position={[s.lat, s.lng]} icon={stationIcon(s)}>
            <Popup>
              <div className="pop">
                <strong>{s.name}</strong>
                <br />
                {s.network} · {s.power}
                <br />
                ว่าง {s.ports - s.busy}/{s.ports} ช่อง
              </div>
            </Popup>
          </Marker>
        ))}
        {vehicles.map((v) => (
          <Marker key={v.id} position={[v.lat, v.lng]} icon={vehicleIcon(v)}>
            <Popup>
              <div className="pop">
                <strong>{v.id}</strong> · {v.model}
                <br />
                <StatusBadge status={v.status} />
                <dl>
                  <dt>แบตเตอรี่</dt>
                  <dd>{v.soc}%</dd>
                  <dt>ระยะวิ่งคงเหลือ</dt>
                  <dd>{v.range} กม.</dd>
                  <dt>ความเร็ว</dt>
                  <dd>{v.speed} กม./ชม.</dd>
                  <dt>คนขับ</dt>
                  <dd>{drivers.find((d) => d.id === v.driverId)?.name}</dd>
                </dl>
                <Link href={`/vehicles/${v.id}`}>ดูรายละเอียด →</Link>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}
