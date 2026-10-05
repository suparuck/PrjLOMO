import { redirect } from 'next/navigation'

// ชั่วคราว: Landing (เฟส 7) ยังไม่ได้ทำ จึงเข้าแดชบอร์ดโดยตรง
export default function Home() {
  redirect('/dashboard')
}
