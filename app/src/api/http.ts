/**
 * HTTP client ของ API (เรียกผ่าน /api/v1 ใน origin เดียวกับเว็บ — Next.js ส่งต่อไปยัง API container)
 * ฝั่งเซิร์ฟเวอร์ (Server Components) เรียก API โดยตรงผ่าน API_INTERNAL_URL
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields?: Record<string, string>,
    public code?: string,
  ) {
    super(message)
  }
}

const base = () => (typeof window === 'undefined' ? `${process.env.API_INTERNAL_URL ?? 'http://localhost:4000'}/api/v1` : '/api/v1')

export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${base()}${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
    cache: 'no-store',
  })

  if (res.ok) return (res.status === 204 ? undefined : await res.json()) as T

  const payload = (await res.json().catch(() => null)) as { error?: { message?: string; fields?: Record<string, string>; code?: string } } | null
  const err = new ApiError(res.status, payload?.error?.message ?? `เรียก API ไม่สำเร็จ (${res.status})`, payload?.error?.fields, payload?.error?.code)

  // session หมดอายุ/ยังไม่ล็อกอิน → กลับหน้าเข้าสู่ระบบ (ยกเว้นตอนกำลังล็อกอินเอง)
  if (res.status === 401 && typeof window !== 'undefined' && !path.startsWith('/auth/login')) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`
  }
  throw err
}

export const get = <T>(path: string) => request<T>('GET', path)
export const post = <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {})
export const patch = <T>(path: string, body: unknown) => request<T>('PATCH', path, body)
export const put = <T>(path: string, body: unknown) => request<T>('PUT', path, body)
export const del = <T>(path: string) => request<T>('DELETE', path)
