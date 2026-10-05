/** จำลองเวลาตอบของเซิร์ฟเวอร์ — ลบออกเมื่อต่อ backend จริง */
export function delay<T>(value: T, ms = 120): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(structuredClone(value)), ms))
}
