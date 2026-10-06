/**
 * ส่งข้อความเข้า LINE ด้วย Messaging API (push) — LINE Notify ปิดบริการแล้ว (มี.ค. 2025)
 * ต้องมี LINE Official Account + Channel access token (LINE_CHANNEL_ACCESS_TOKEN) และปลายทาง (LINE_TO = userId / groupId / roomId)
 * แผนฟรีของ LINE จำกัดจำนวนข้อความต่อเดือน จึงรวมแจ้งเตือนหลายรายการเป็นข้อความเดียวต่อรอบ (ดู lineNotify.ts)
 */
export interface LineClient {
  configured: boolean
  /** ส่งข้อความ — ผลสำเร็จ หรือ retryable=true เมื่อควรลองใหม่ (เครือข่าย/5xx/429) */
  push(text: string): Promise<{ ok: true } | { ok: false; retryable: boolean; error: string }>
}

const ENDPOINT = 'https://api.line.me/v2/bot/message/push'
const MAX_TEXT = 4800 // ข้อความข้อความเดียวของ LINE ยาวได้ 5000 ตัวอักษร

export function createLineClient(opts: { token?: string; to?: string; fetchImpl?: typeof fetch }): LineClient {
  const { token, to } = opts
  const doFetch = opts.fetchImpl ?? fetch
  if (!token || !to) {
    return { configured: false, push: async () => ({ ok: false, retryable: false, error: 'ยังไม่ได้ตั้งค่า LINE (LINE_CHANNEL_ACCESS_TOKEN / LINE_TO)' }) }
  }
  return {
    configured: true,
    async push(text) {
      try {
        const res = await doFetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ to, messages: [{ type: 'text', text: text.slice(0, MAX_TEXT) }] }),
          signal: AbortSignal.timeout(8000),
        })
        if (res.ok) return { ok: true }
        // ไม่ใส่ token/ปลายทางในข้อความผิดพลาด — มีเฉพาะสถานะและเนื้อความตอบกลับสั้น ๆ จาก LINE
        const detail = (await res.text().catch(() => '')).slice(0, 200)
        return { ok: false, retryable: res.status === 429 || res.status >= 500, error: `LINE ตอบ ${res.status} ${detail}`.trim() }
      } catch (err) {
        return { ok: false, retryable: true, error: err instanceof Error ? err.message : 'เชื่อมต่อ LINE ไม่ได้' }
      }
    },
  }
}
