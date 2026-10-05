/** @type {import('next').NextConfig} */
const nextConfig = {
  // สร้างโฟลเดอร์ standalone สำหรับ Docker image ขนาดเล็ก
  output: 'standalone',
  reactStrictMode: true,
}

export default nextConfig
