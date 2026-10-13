/**
 * โลโก้ lomo (public/brand/lomo-logo.png — สร้างจากภาพต้นฉบับด้วย scripts/make-logo.mjs, พื้นหลังโปร่งใส ใช้ได้ทั้งพื้นเข้มและพื้นขาว)
 * ใช้ <img> ธรรมดา (ไม่ผ่านตัวปรับภาพของ next/image): ไฟล์ปรับขนาดไว้แล้ว และเซิร์ฟเวอร์ RAM น้อยไม่ควรรันตัวปรับภาพ
 */
export function BrandLogo({ height = 34 }: { height?: number }) {
  // อัตราส่วนภาพต้นฉบับ 1100:706
  const width = Math.round((height * 1100) / 706)
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="brand-logo" src="/brand/lomo-logo.png" alt="lomo" width={width} height={height} />
  )
}
