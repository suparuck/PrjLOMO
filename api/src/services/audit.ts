import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Pool } from 'pg'
import { one } from '../db'
import { AUDIT_SKIP } from '../lib/auditLabels'

const clip = (s: unknown, n = 200) => (typeof s === 'string' ? s.slice(0, n) : null)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface AuditEvent {
  action: string
  actorId?: string | null
  actorEmail?: string | null
  target?: string | null
  detail?: Record<string, unknown>
}

/**
 * บันทึกหนึ่งเหตุการณ์ — ไม่โยนข้อผิดพลาดเด็ดขาด (บันทึกไม่ได้ต้องไม่ทำให้การทำงานจริงล้ม; ข้อผิดพลาดลง log)
 * ไม่รับ/ไม่เก็บค่าที่ผู้ใช้กรอก (รหัสผ่าน โทเคน รหัส 2FA) — เก็บเฉพาะข้อมูลระบุตัวตนและชื่อฟิลด์
 */
export async function recordAudit(pool: Pool, req: Pick<FastifyRequest, 'ip' | 'log'>, e: AuditEvent): Promise<void> {
  try {
    let email = e.actorEmail ?? null
    if (!email && e.actorId) email = (await one<{ email: string }>(pool, 'select email from users where id = $1', [e.actorId]))?.email ?? null
    await pool.query('insert into audit_log (actor_id, actor_email, action, target, ip, detail) values ($1, $2, $3, $4, $5, $6)', [
      e.actorId ?? null,
      email,
      e.action,
      e.target ?? null,
      req.ip ?? null,
      JSON.stringify(e.detail ?? {}),
    ])
  } catch (err) {
    req.log.error({ err, action: e.action }, 'audit log write failed')
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    /** ผู้ใช้ที่ถูกกระทำในเส้นทาง /users/:id… (ดึงอีเมลก่อนทำรายการ เพราะบางรายการลบแถวทิ้ง) */
    auditTarget?: string
  }
}

/** ทุกคำขอที่แก้ข้อมูลสำเร็จโดยผู้ใช้ที่ล็อกอิน (ยกเว้นตาม AUDIT_SKIP) → บันทึกหนึ่งแถว ไม่ต้องไปเรียกเองในแต่ละเส้นทาง จึงไม่มีรายการหลุด */
export function registerAudit(app: FastifyInstance, pool: Pool) {
  app.addHook('preHandler', async (req) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return
    const id = (req.params as { id?: string } | undefined)?.id
    if (id && UUID.test(id) && req.routeOptions.url?.startsWith('/api/v1/users/')) {
      req.auditTarget = (await one<{ email: string }>(pool, 'select email from users where id = $1', [id]).catch(() => null))?.email
    }
  })

  // onSend (ไม่ใช่ onResponse): บันทึกให้เสร็จ "ก่อน" ตอบกลับผู้ใช้ — ผู้ใช้ได้ผลสำเร็จเมื่อบันทึกถูกเขียนแล้ว (บันทึกไม่ได้ก็ไม่ทำให้คำขอล้ม)
  app.addHook('onSend', async (req, reply, payload) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || reply.statusCode >= 400 || !req.user) return payload
    const route = (req.routeOptions.url ?? '').replace(/^\/api\/v1/, '')
    const action = `${req.method} ${route}`
    if (AUDIT_SKIP.has(action) || route.startsWith('/ingest')) return payload
    const p = (req.params ?? {}) as Record<string, string>
    const b = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {}
    const target = req.auditTarget ?? clip(p.id ?? p.key ?? p.vehicleId) ?? (action === 'POST /users/invite' ? clip(b.email) : clip(b.id))
    await recordAudit(pool, req, {
      action,
      actorId: req.user.id,
      actorEmail: req.user.email,
      target,
      detail: { fields: Object.keys(b).slice(0, 20), status: reply.statusCode },
    })
    return payload
  })
}

/** ล้างบันทึกที่เก่ากว่ากำหนด (เรียกจากงานเบื้องหลังวันละครั้ง) */
export async function purgeAudit(pool: Pool, keepDays: number): Promise<number> {
  const r = await pool.query(`delete from audit_log where at < now() - ($1::int * interval '1 day')`, [keepDays])
  return r.rowCount ?? 0
}
