/** @type {import('next').NextConfig} */

// API container — ค่าถูกฝังตอน build (rewrites) และอ่านซ้ำตอนรันสำหรับ Server Components
const apiUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:4000'

const nextConfig = {
  // สร้างโฟลเดอร์ standalone สำหรับ Docker image ขนาดเล็ก
  output: 'standalone',
  reactStrictMode: true,
  // เบราว์เซอร์เรียก /api/v1/* ใน origin เดียวกับเว็บ (cookie httpOnly ใช้ได้ ไม่ต้องตั้ง CORS) แล้ว Next ส่งต่อไป API
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${apiUrl}/api/v1/:path*` }]
  },
}

export default nextConfig
