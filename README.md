# EV Monitor

เว็บแอปบริหารกองยานรถยนต์ไฟฟ้า — Next.js 14 (App Router) + TypeScript

- `design/` — ต้นแบบ HTML และสเปก (`design/HANDOFF.md`)
- `app/` — เว็บแอปจริง

## รันบนเครื่อง

```bash
cd app
npm install
npm run dev      # http://localhost:3000
npm run build
```

## รันด้วย Docker

```bash
docker compose up --build   # http://localhost:3000
```

## สถานะ

เฟส 1–8 เสร็จ: ทุกหน้าในต้นแบบใช้งานได้บนข้อมูล mock (ดูรายการที่ยังไม่ทำใน CLAUDE.md)

เข้าสู่ระบบเดโม: ดู `app/src/lib/auth.ts` (ต้องตั้ง `AUTH_SECRET` ใน `.env` — ดู `.env.example`)
