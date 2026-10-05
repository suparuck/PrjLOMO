import type { Metadata } from 'next'
import { Suspense } from 'react'
import { api } from '@/api'
import { AuthArt } from '@/components/auth/AuthArt'
import { LoginForm } from './LoginForm'

export const metadata: Metadata = { title: 'เข้าสู่ระบบ — EV Monitor' }

// ตัวเลขรวมดึงจาก API ตอนเปิดหน้า
export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  // ตัวเลขรวมเท่านั้น (ไม่ต้องล็อกอิน) — ถ้า API ไม่ตอบ แสดงขีดแทนตัวเลข
  const overview = await api.getPublicOverview().catch(() => null)

  return (
    <div className="auth">
      <AuthArt overview={overview} />
      <main className="auth-form">
        <Suspense>
          <LoginForm />
        </Suspense>
      </main>
    </div>
  )
}
