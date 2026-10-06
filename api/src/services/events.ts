import { EventEmitter } from 'node:events'

/**
 * ช่องแจ้งว่า "ข้อมูลเปลี่ยนแล้ว" ภายในโปรเซสนี้ (ผู้ฟัง: เส้นทาง /stream ที่ส่งต่อให้เบราว์เซอร์)
 * ไม่ส่งเนื้อข้อมูลไปกับเหตุการณ์ — เบราว์เซอร์รู้แล้วโหลดข้อมูลใหม่เองตามสิทธิ์ของตัวเอง
 * จำกัด: ทำงานเฉพาะภายใน API อินสแตนซ์เดียว (ถ้าขยายเป็นหลายอินสแตนซ์ ให้เปลี่ยนเป็น Postgres LISTEN/NOTIFY)
 */
export const changes = new EventEmitter()
changes.setMaxListeners(0)

export const publishChange = () => changes.emit('change')
