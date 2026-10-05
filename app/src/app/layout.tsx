import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import '@/styles/tokens.css'
import '@/styles/global.css'

export const metadata: Metadata = {
  title: 'EV Monitor',
  description: 'ระบบติดตามและบริหารจัดการกองยานรถยนต์ไฟฟ้า',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="th">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
