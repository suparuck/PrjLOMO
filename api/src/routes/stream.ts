import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import type { ServerResponse } from 'node:http'
import type { Pool } from 'pg'
import { requireRole } from '../auth'
import { changes } from '../services/events'
import { sec } from '../security'

const HEARTBEAT_MS = 25_000

export const streamRoutes =
  (pool: Pool): FastifyPluginAsyncTypebox =>
  async (app) => {
    const viewer = requireRole(pool, 'viewer')
    const open = new Set<ServerResponse>()
    // ปิดระบบ: ปิดสตรีมทั้งหมดก่อน ไม่เช่นนั้น app.close() จะรอจนการเชื่อมต่อหมด
    app.addHook('preClose', async () => {
      for (const r of open) r.end()
      open.clear()
    })

    app.get(
      '/stream',
      { preValidation: viewer, schema: { tags: ['realtime'], summary: 'Server-Sent Events: เหตุการณ์ "change" เมื่อข้อมูลในระบบเปลี่ยน (ไม่มีเนื้อข้อมูล — ให้โหลดใหม่)', security: sec } },
      async (req, reply) => {
        reply.hijack()
        const res = reply.raw
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          // no-transform: กันพร็อกซี/ตัวบีบอัดพักข้อมูลไว้ (สตรีมจะไม่ถึงเบราว์เซอร์ทันที)
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        })
        res.write('retry: 3000\n\n: connected\n\n')
        open.add(res)

        let throttled = false
        const onChange = () => {
          // รวมการเปลี่ยนที่ถี่ ๆ (เช่น telemetry หลายคัน) เป็นเหตุการณ์เดียวต่อ 500 มิลลิวินาที
          if (throttled) return
          throttled = true
          setTimeout(() => {
            throttled = false
            if (!res.writableEnded) res.write('event: change\ndata: {}\n\n')
          }, 500).unref()
        }
        changes.on('change', onChange)

        // ตรวจสิทธิ์ซ้ำทุกรอบ heartbeat: session ถูกเพิกถอน/บัญชีถูกลบ → ตัดสตรีม
        const beat = setInterval(async () => {
          try {
            await viewer(req, reply)
            if (!res.writableEnded) res.write(': ping\n\n')
          } catch {
            res.end()
          }
        }, HEARTBEAT_MS)
        beat.unref()

        res.on('close', () => {
          clearInterval(beat)
          changes.off('change', onChange)
          open.delete(res)
        })
      },
    )
  }
