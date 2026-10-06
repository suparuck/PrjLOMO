import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // กฎ React Compiler ชุดใหม่ (eslint-config-next 16) — แพทเทิร์น "รีเซ็ตหน้าเมื่อตัวกรองเปลี่ยน" ใน effect ตั้งใจใช้และทำงานถูกต้อง
      // จึงเตือนไว้ (warn) ไม่ให้ขัดขวางงาน; ถ้าจะเปิดเป็น error ต้องรีแฟกเตอร์เป็นการคำนวณตอน render/key แทน
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  globalIgnores(['.next/**', 'node_modules/**', 'next-env.d.ts']),
])
