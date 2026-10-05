// ต้องถูก import เป็นลำดับแรกสุด: import ถูกยกขึ้นด้านบนเสมอ จึงตั้ง env ในไฟล์ของตัวเองเพื่อให้ทำงานก่อน config.ts
process.env.AUTH_SECRET ??= 'test-secret-test-secret-test-secret'
process.env.NODE_ENV ??= 'test'
export const ADMIN_URL = process.env.TEST_ADMIN_URL ?? 'postgres://evm:evm_dev@localhost:5433/postgres'
export const TEST_DB = 'evmonitor_test'
export const TEST_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DB}`)
process.env.DATABASE_URL = TEST_URL
