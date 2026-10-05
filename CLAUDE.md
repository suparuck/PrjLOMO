# PrjLOMO — EV Monitor (EV Fleet Management Web App)

## สถานะโครงการ
- ขั้นออกแบบเสร็จแล้ว: ต้นแบบ HTML/CSS/JS แบบคงที่ 12 หน้า อยู่ใน `design/prototype/`
- เว็บแอปจริงอยู่ใน `app/` (Next.js) — เฟส 1–8 ของ HANDOFF เสร็จแล้ว ทุก route ใช้งานได้บนข้อมูล mock
- ยังไม่ทำ (HANDOFF §4): modal/ฟอร์ม (เพิ่มรถ/คนขับ, เชิญผู้ใช้, ปรับเป้าหมายชาร์จ, หยุดชาร์จ), ส่งออก Excel/PDF จริง, เรียลไทม์, pagination, backend จริง (ตอนนี้ auth เป็น mock ใน `app/src/lib/auth.ts`)
- รัน: `cd app && npm run dev` หรือ `docker compose up --build` (ต้องมี `.env` ที่มี `AUTH_SECRET` ดู `.env.example`)
- สเปกการส่งต่องานแบบละเอียด: `design/HANDOFF.md` — **อ่านไฟล์นี้ก่อนเริ่มงานทุกครั้ง**

## แหล่งอ้างอิงหลัก (Source of truth)
- หน้าตา/เลย์เอาต์: ไฟล์ `design/prototype/*.html` — แอปจริงต้องหน้าตาเหมือนต้นแบบ
- ระบบดีไซน์ (สี ตัวอักษร ระยะ คอมโพเนนต์): `design/prototype/style.css` (ตัวแปร CSS ใน `:root`)
- โครงเมนู ไอคอน helper: `design/prototype/app.js` (`NAV`, `ICON_PATHS`, `STATUS`, `socClass`)
- รูปแบบข้อมูลและข้อมูลตัวอย่าง: `design/prototype/data.js`

## Stack ที่ใช้จริง (ผู้ใช้สั่งเปลี่ยนจาก Vite เป็น Next.js)
- Next.js 14 (App Router) + React 18 + TypeScript
- กราฟ: Chart.js + react-chartjs-2 · แผนที่: Leaflet + react-leaflet (tiles: OpenStreetMap — CARTO ต้องใช้ API key)
- สไตล์: `app/src/styles/tokens.css` (ตัวแปรทั้งหมด รวมสี/ขนาดฟอนต์ที่แตกออกจากต้นแบบ) + `global.css` (คลาสจากต้นแบบ) — **ไม่ใช้ Tailwind** เว้นแต่ผู้ใช้ขอ; ห้ามใส่ค่า hex/rgba/font-size ดิบนอก `tokens.css`
- ข้อมูล: เลเยอร์ `src/api/` ที่ตอนแรกคืนค่า mock จาก `data.js` แล้วค่อยต่อ backend จริง

## กฎการทำงาน
- ข้อความบนหน้าจอเป็นภาษาไทย ใช้ฟอนต์ IBM Plex Sans Thai
- ใช้ค่าสีจาก token เท่านั้น ห้าม hardcode สีใหม่ — CTA หลักสีแดง `--red`, แถบเมนู `--navy-900`
- สถานะรถมี 5 แบบ: driving, charging, parked, low, offline (สี/ชื่อไทยตาม `STATUS` ใน app.js)
- เกณฑ์แบต: ≥70% ดี (เขียว), 30–69% ปานกลาง (เหลือง), <30% ต่ำ (แดง)
- ต้องใช้ได้บนมือถือ: sidebar กลายเป็น off-canvas ที่ ≤900px (ดู media query ใน style.css)
- ใช้ไอคอนเส้นชุดเดียวกับต้นแบบ (หรือ lucide-react ที่หน้าตาใกล้เคียง) ห้ามใช้อีโมจิ
- เครื่องพัฒนาเป็น Windows — ใช้คำสั่ง/สคริปต์ที่รันบน Windows ได้
- ทำทีละเฟสตาม `design/HANDOFF.md` ตรวจหน้าจอเทียบต้นแบบก่อนปิดแต่ละเฟส
