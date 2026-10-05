'use client'

import dynamic from 'next/dynamic'

const loading = () => <div className="map-box" style={{ height: 330 }} />

/** Leaflet ใช้ window — โหลดฝั่ง client เท่านั้น */
export const FleetMapClient = dynamic(() => import('./FleetMap'), { ssr: false, loading })
export const LiveMapClient = dynamic(() => import('./LiveMap'), { ssr: false })
