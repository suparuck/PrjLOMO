import type { Metadata } from 'next'
import { api } from '@/api'
import { AuthArt } from '@/components/auth/AuthArt'
import { ResetForm } from './ResetForm'

export const metadata: Metadata = { title: 'ตั้งรหัสผ่านใหม่ — EV Monitor', robots: { index: false }, referrer: 'no-referrer' }
export const dynamic = 'force-dynamic'

/** หน้าสาธารณะ: ตั้งรหัสผ่านใหม่ด้วยลิงก์ที่ได้จากอีเมล/ผู้ดูแลระบบ */
export default async function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params // Next 15+: params เป็น Promise
  const overview = await api.getPublicOverview().catch(() => null)
  return (
    <div className="auth">
      <AuthArt overview={overview} />
      <main className="auth-form">
        <ResetForm token={decodeURIComponent(token)} />
      </main>
    </div>
  )
}
