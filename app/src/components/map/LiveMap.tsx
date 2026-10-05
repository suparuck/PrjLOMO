'use client'

import { useEffect, useRef } from 'react'
import { Circle, MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import type L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { StationPopup, VehiclePopup, stationIcon, vehicleIcon } from './markers'
import { TILE_ATTRIBUTION, TILE_URL } from '@/lib/mapConfig'
import { cssVar } from '@/lib/chartSetup'
import type { Driver, Station, Vehicle } from '@/types'

export interface MapLayers {
  vehicles: boolean
  depot: boolean
  public: boolean
  range: boolean
}

function FitOnce({ points }: { points: [number, number][] }) {
  const map = useMap()
  const done = useRef(false)
  useEffect(() => {
    if (!done.current && points.length) {
      map.fitBounds(points, { padding: [60, 60] })
      done.current = true
    }
  }, [map, points])
  return null
}

function FlyTo({ focus, markers }: { focus: { id: string; n: number } | null; markers: React.MutableRefObject<Record<string, L.Marker>> }) {
  const map = useMap()
  useEffect(() => {
    if (!focus) return
    const m = markers.current[focus.id]
    if (!m) return
    map.flyTo(m.getLatLng(), 14, { duration: 0.6 })
    map.once('moveend', () => m.openPopup())
  }, [focus, map, markers])
  return null
}

export default function LiveMap({
  allVehicles,
  visibleIds,
  stations,
  drivers,
  center,
  layers,
  focus,
}: {
  allVehicles: Vehicle[]
  visibleIds: Set<string>
  stations: Station[]
  drivers: Driver[]
  center: [number, number]
  layers: MapLayers
  focus: { id: string; n: number } | null
}) {
  const markers = useRef<Record<string, L.Marker>>({})
  const shown = allVehicles.filter((v) => visibleIds.has(v.id))
  const fitPoints = allVehicles.map((v) => [v.lat, v.lng] as [number, number])

  return (
    <MapContainer center={center} zoom={11} style={{ height: '100%', width: '100%' }}>
      <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxZoom={19} />
      <FitOnce points={fitPoints} />
      <FlyTo focus={focus} markers={markers} />
      {layers.vehicles &&
        shown.map((v) => (
          <Marker
            key={v.id}
            position={[v.lat, v.lng]}
            icon={vehicleIcon(v)}
            ref={(m) => {
              if (m) markers.current[v.id] = m
              else delete markers.current[v.id]
            }}
          >
            <Popup>
              <VehiclePopup vehicle={v} drivers={drivers} />
            </Popup>
          </Marker>
        ))}
      {stations
        .filter((s) => layers[s.type])
        .map((s) => (
          <Marker key={s.id} position={[s.lat, s.lng]} icon={stationIcon(s)}>
            <Popup>
              <StationPopup station={s} detailed />
            </Popup>
          </Marker>
        ))}
      {layers.range &&
        shown.map((v) => (
          <Circle
            key={`r-${v.id}`}
            center={[v.lat, v.lng]}
            radius={v.range * 1000 * 0.15}
            pathOptions={{ color: cssVar('--blue'), weight: 1, fillOpacity: 0.04 }}
          />
        ))}
    </MapContainer>
  )
}
