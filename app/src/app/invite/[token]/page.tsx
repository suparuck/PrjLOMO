import type { Metadata } from 'next'
import { api } from '@/api'
import { AuthArt } from '@/components/auth/AuthArt'
import { InviteForm } from './InviteForm'

export const metadata: Metadata = { title: 'ตอบรับคำเชิญ — EV Monitor', robots: { index: false }, referrer: 'no-referrer' }
export const dynamic = 'force-dynamic'

/** หน้าสาธารณะ (ไม่ต้องล็อกอิน): ผู้ถูกเชิญตั้งรหัสผ่านเพื่อเปิดใช้บัญชี */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params // Next 15+: params เป็น Promise
  const overview = await api.getPublicOverview().catch(() => null)
  return (
    <div className="auth">
      <AuthArt overview={overview} />
      <main className="auth-form">
        <InviteForm token={decodeURIComponent(token)} />
      </main>
    </div>
  )
}
