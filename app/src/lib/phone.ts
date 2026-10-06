/** ลิงก์โทรออก: เก็บเฉพาะตัวเลขและ + (เบอร์ไทยที่ขึ้นต้น 0 ใช้ได้ตามปกติ) */
export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`
