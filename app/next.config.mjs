/** @type {import('next').NextConfig} */

// API container — ค่าถูกฝังตอน build (rewrites) และอ่านซ้ำตอนรันสำหรับ Server Components
const apiUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:4000'

const nextConfig = {
  // สร้างโฟลเดอร์ standalone สำหรับ Docker image ขนาดเล็ก
  output: 'standalone',
  reactStrictMode: true,
  // เบราว์เซอร์เรียก /api/v1/* ใน origin เดียวกับเว็บ (cookie httpOnly ใช้ได้ ไม่ต้องตั้ง CORS) แล้ว Next ส่งต่อไป API
  poweredByHeader: false,
  // ส่วนหัวความปลอดภัย: กันฝังหน้าในเฟรมของเว็บอื่น (clickjacking), กันเดาชนิดเนื้อหา, ไม่ส่ง Referer ข้ามเว็บ (ลิงก์คำเชิญ/รีเซ็ตมีโทเคนใน URL)
  // HSTS ส่งเฉพาะเมื่อให้บริการผ่าน HTTPS (COOKIE_SECURE=true) — ถ้าส่งตอนเป็น HTTP จะไม่มีผลแต่ไม่ควรประกาศ
  async headers() {
    const security = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
      ...(process.env.COOKIE_SECURE === 'true' ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }] : []),
    ]
    return [
      { source: '/:path*', headers: security },
      // หน้าที่มีโทเคนใน URL: ห้ามส่ง Referer ออกไปเลย
      { source: '/reset-password/:token', headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }] },
      { source: '/invite/:token', headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }] },
    ]
  },
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${apiUrl}/api/v1/:path*` }]
  },
}

export default nextConfig
