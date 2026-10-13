// สร้างไฟล์โลโก้ที่ใช้ในแอปจากภาพต้นฉบับ (PNG พื้นขาว) — รันครั้งเดียวเมื่อเปลี่ยนโลโก้:
//   node scripts/make-logo.mjs <ภาพต้นฉบับ.png>
// ผลลัพธ์: public/brand/lomo-logo.png (พื้นหลังโปร่งใส) และ src/app/icon.png (favicon)
// พื้นหลังที่ "ต่อกับขอบภาพ" ถูกทำให้โปร่งใส ส่วนตัวอักษรสีขาวด้านในโลโก้คงสีขาว; ขอบ anti-alias ถูกคำนวณความโปร่งใสใหม่
// เพื่อไม่ให้เกิดขอบขาวเมื่อวางบนพื้นสีเข้ม (แถบเมนูสีกรม)
import sharp from 'sharp'
import { mkdirSync } from 'node:fs'

const src = process.argv[2]
if (!src) throw new Error('ระบุไฟล์ภาพต้นฉบับ')

const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const { width: W, height: H } = info
const px = (x, y) => (y * W + x) * 4
const nearWhite = (i) => data[i] >= 236 && data[i + 1] >= 236 && data[i + 2] >= 236

// 1) พื้นหลัง = พิกเซลใกล้ขาวที่ต่อกับขอบภาพ (flood fill)
const outside = new Uint8Array(W * H)
const stack = []
const push = (x, y) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return
  const k = y * W + x
  if (outside[k] || !nearWhite(px(x, y))) return
  outside[k] = 1
  stack.push(k)
}
for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1) }
for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y) }
while (stack.length) {
  const k = stack.pop()
  const x = k % W, y = (k / W) | 0
  push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1)
}

// 2) สีน้ำเงินจริงของแต่ละแถว (ไล่สีแนวตั้ง): พิกเซลที่ "ฟ้า" ที่สุดในแถว (B - R มากสุด)
const ref = new Array(H)
for (let y = 0; y < H; y++) {
  let best = -1, bi = -1
  for (let x = 0; x < W; x++) {
    const i = px(x, y)
    if (outside[y * W + x]) continue
    const s = data[i + 2] - data[i]
    if (s > best) { best = s; bi = i }
  }
  ref[y] = bi < 0 ? null : [data[bi], data[bi + 1], data[bi + 2]]
}

// 3) ขอบ: พิกเซลที่ติดพื้นหลังภายใน 2px และไม่ใช่ขาวล้วน → ประเมิน alpha จากช่อง R (น้ำเงินมี R ต่ำ ขาวมี R = 255)
const out = Buffer.alloc(W * H * 4)
const near = (x, y) => {
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const xx = x + dx, yy = y + dy
    if (xx >= 0 && yy >= 0 && xx < W && yy < H && outside[yy * W + xx]) return true
  }
  return false
}
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = px(x, y)
    if (outside[y * W + x]) { out[i] = 255; out[i + 1] = 255; out[i + 2] = 255; out[i + 3] = 0; continue }
    let a = 255, r = data[i], g = data[i + 1], b = data[i + 2]
    const rf = ref[y]
    if (rf && near(x, y)) {
      // เฉพาะพิกเซลที่ "ผสมกับขาว" (ไม่ใช่ตัวอักษรขาวด้านใน: ตัวอักษรไม่ติดพื้นหลังภายใน 2px จึงไม่เข้าเงื่อนไขนี้)
      const denom = 255 - rf[0]
      a = Math.max(0, Math.min(255, Math.round(((255 - r) / denom) * 255)))
      if (a > 0) { r = rf[0]; g = rf[1]; b = rf[2] }
    }
    out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = a
  }
}

const full = sharp(out, { raw: { width: W, height: H, channels: 4 } })
mkdirSync(new URL('../public/brand/', import.meta.url), { recursive: true })
// แสดงสูงสุด ~230px กว้างบนหน้าแรก → 2x = 480px กว้าง
await full.clone().resize({ width: 480 }).png({ compressionLevel: 9 }).toFile(new URL('../public/brand/lomo-logo.png', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
// favicon: โลโก้พอดีกรอบสี่เหลี่ยมจัตุรัส 128px พื้นโปร่งใส
await full.clone().resize({ width: 128, height: 128, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png({ compressionLevel: 9 }).toFile(new URL('../src/app/icon.png', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
console.log('done', W + 'x' + H)
