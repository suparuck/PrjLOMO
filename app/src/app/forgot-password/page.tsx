import type { Metadata } from 'next'
import { api } from '@/api'
import { AuthArt } from '@/components/auth/AuthArt'
import { ForgotForm } from './ForgotForm'

export const metadata: Metadata = { title: 'ลืมรหัสผ่าน — EV Monitor', robots: { index: false } }
export const dynamic = 'force-dynamic'

/** หน้าสาธารณะ: ขอลิงก์ตั้งรหัสผ่านใหม่ทางอีเมล */
export default async function ForgotPasswordPage() {
  const overview = await api.getPublicOverview().catch(() => null)
  return (
    <div className="auth">
      <AuthArt overview={overview} />
      <main className="auth-form">
        <ForgotForm />
      </main>
    </div>
  )
}
