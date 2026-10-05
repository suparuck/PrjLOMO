# PrjLOMO — EV Monitor (EV Fleet Management Web App)

## สถานะโครงการ
- ขั้นออกแบบเสร็จแล้ว: ต้นแบบ HTML/CSS/JS แบบคงที่ 12 หน้า อยู่ใน `design/prototype/`
- ขั้นถัดไป: สร้างเป็นเว็บแอปจริงจากต้นแบบนี้ (ยังไม่มีโค้ดแอป)
- สเปกการส่งต่องานแบบละเอียด: `design/HANDOFF.md` — **อ่านไฟล์นี้ก่อนเริ่มงานทุกครั้ง**

## แหล่งอ้างอิงหลัก (Source of truth)
- หน้าตา/เลย์เอาต์: ไฟล์ `design/prototype/*.html` — แอปจริงต้องหน้าตาเหมือนต้นแบบ
- ระบบดีไซน์ (สี ตัวอักษร ระยะ คอมโพเนนต์): `design/prototype/style.css` (ตัวแปร CSS ใน `:root`)
- โครงเมนู ไอคอน helper: `design/prototype/app.js` (`NAV`, `ICON_PATHS`, `STATUS`, `socClass`)
- รูปแบบข้อมูลและข้อมูลตัวอย่าง: `design/prototype/data.js`

## Stack ที่แนะนำ (เปลี่ยนได้ถ้าผู้ใช้สั่ง)
- React 18 + Vite + TypeScript, React Router
- กราฟ: Chart.js + react-chartjs-2 · แผนที่: Leaflet + react-leaflet (tiles: CARTO light_all)
- สไตล์: ย้าย `style.css` มาเป็น global tokens + CSS Modules — **ไม่ใช้ Tailwind** เว้นแต่ผู้ใช้ขอ
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
