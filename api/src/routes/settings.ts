import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { Type } from '@sinclair/typebox'
import type { Pool } from 'pg'
import { randomBytes } from 'node:crypto'
import { generateApiKey, hashKey, requireRole } from '../auth'
import { config } from '../config'
import { one, rows } from '../db'
import { AppError, conflict, invalid, notFound } from '../errors'
import { checkEmail } from '../lib/validators'
import { newResetToken, type MailContext } from './auth'
import { PageQuery, envelope, likeTerm, pageArgs } from '../lib/paging'

import { sec } from '../security'
const Money = Type.String({ pattern: '^\\d{1,4}(\\.\\d{1,2})?$' })

const SettingsBody = Type.Object({
  org: Type.Object({
    name: Type.String({ minLength: 1, maxLength: 120 }),
    fleetName: Type.String({ minLength: 1, maxLength: 120 }),
    timezone: Type.Union([Type.Literal('Asia/Bangkok (UTC+07:00)')]),
    distanceUnit: Type.Union([Type.Literal('กิโลเมตร'), Type.Literal('ไมล์')]),
    language: Type.Union([Type.Literal('ไทย'), Type.Literal('English')]),
    currency: Type.Union([Type.Literal('บาท (฿)')]),
  }),
  thresholds: Type.Object({
    lowBattery: Type.Integer({ minimum: 10, maximum: 50 }),
    criticalBattery: Type.Integer({ minimum: 5, maximum: 30 }),
    maxSpeed: Type.Integer({ minimum: 60, maximum: 140 }),
    offlineMinutes: Type.Integer({ minimum: 5, maximum: 120 }),
  }),
  notify: Type.Object({ email: Type.Boolean(), line: Type.Boolean(), sms: Type.Boolean(), dailyDigest: Type.Boolean() }),
  charging: Type.Object({
    tariff: Type.Union([Type.Literal('TOU (On-Peak / Off-Peak)'), Type.Literal('อัตราปกติ')]),
    offPeak: Money,
    onPeak: Money,
    defaultTarget: Type.Union([Type.Literal('80%'), Type.Literal('90%'), Type.Literal('100%')]),
    smartSchedule: Type.Boolean(),
    demandLimit: Type.Boolean(),
  }),
})

const USER_COLS = `id, email, name, role, status, last_login_at as "lastLoginAt", invited_at as "invitedAt"`

function newInvite() {
  const token = randomBytes(32).toString('base64url')
  return { token, hash: hashKey(token) }
}

/** ส่งอีเมลคำเชิญ (ถ้าตั้งค่าอีเมลไว้) — ล้มเหลวไม่ทำให้การเชิญล้ม ผู้ดูแลยังส่งลิงก์เองได้ */
async function sendInviteMail(mail: MailContext, log: { error: (o: object, m: string) => void }, to: string, token: string) {
  if (mail.mailer.mode === 'off') return false
  try {
    await mail.mailer.send({
      to,
      subject: 'คำเชิญเข้าใช้งาน EV Monitor',
      text:
        `คุณได้รับเชิญให้เข้าใช้งาน EV Monitor

คลิกลิงก์ด้านล่างเพื่อตั้งรหัสผ่านและเปิดใช้บัญชี (ใช้ได้ครั้งเดียว ภายใน ${config.inviteTtlDays} วัน):

` +
        `${config.appBaseUrl}/invite/${token}
`,
    })
    return true
  } catch (err) {
    log.error({ err }, 'send invite mail failed')
    return false
  }
}

/** ไม่พบผู้ใช้ → 404, พบแต่ตอบรับแล้ว → 409 */
async function missingOrActive(pool: Pool, id: string) {
  const exists = await one(pool, 'select 1 from users where id = $1', [id])
  return exists ? conflict('ผู้ใช้นี้ตอบรับคำเชิญแล้ว จึงทำรายการนี้ไม่ได้') : notFound('ผู้ใช้')
}

const SETTINGS_SQL = `select org, thresholds, notify, charging from app_settings where id = 1`

export const settingsRoutes =
  (pool: Pool, mail: MailContext): FastifyPluginAsyncTypebox =>
  async (app) => {
    const viewer = requireRole(pool, 'viewer')
    const mgr = requireRole(pool, 'manager')
    const adm = requireRole(pool, 'admin')

    app.get('/org', { preValidation: viewer, schema: { tags: ['settings'], summary: 'ข้อมูลองค์กร (เมือง จุดกึ่งกลางแผนที่)', security: sec } }, async () => {
      const r = await one<{ name: string; city: string; lat: number; lng: number }>(
        pool,
        `select org->>'name' as name, city, center_lat as lat, center_lng as lng from app_settings where id = 1`,
      )
      return { name: r!.name, city: r!.city, center: [r!.lat, r!.lng] }
    })

    app.get('/settings', { preValidation: mgr, schema: { tags: ['settings'], summary: 'การตั้งค่าระบบ', security: sec } }, async () => one(pool, SETTINGS_SQL))

    app.put(
      '/settings',
      { preValidation: adm, schema: { tags: ['settings'], summary: 'บันทึกการตั้งค่าระบบ (admin)', body: SettingsBody, security: sec } },
      async (req) => {
        const b = req.body
        if (b.thresholds.criticalBattery > b.thresholds.lowBattery) {
          throw invalid({ criticalBattery: 'เกณฑ์แบตวิกฤตต้องไม่สูงกว่าเกณฑ์แบตต่ำ' })
        }
        return one(
          pool,
          `update app_settings set org = $1, thresholds = $2, notify = $3, charging = $4 where id = 1
           returning org, thresholds, notify, charging`,
          [JSON.stringify(b.org), JSON.stringify(b.thresholds), JSON.stringify(b.notify), JSON.stringify(b.charging)],
        )
      },
    )

    app.get('/integrations', { preValidation: mgr, schema: { tags: ['settings'], summary: 'การเชื่อมต่อกับระบบภายนอก', security: sec } }, async () =>
      rows(pool, `select key, name, description as text, logo, color_token as "colorToken", connected, action_label as "actionLabel" from integrations order by sort`),
    )

    // ---- ผู้ใช้และสิทธิ์ ----
    app.get(
      '/users',
      {
        preValidation: mgr,
        schema: {
          tags: ['users'],
          summary: 'ผู้ใช้และบทบาท — ไม่ส่ง page = อาร์เรย์ทั้งหมด; ส่ง page = แบ่งหน้า (ค้นหา q จากชื่อ/อีเมล)',
          security: sec,
          querystring: Type.Object({ ...PageQuery, q: Type.Optional(Type.String({ maxLength: 100 })) }),
        },
      },
      async (req) => {
        const pg = pageArgs(req.query)
        const order = `order by (role = 'admin') desc, created_at, email`
        if (!pg.paged) return rows(pool, `select ${USER_COLS} from users ${order}`)
        const args: unknown[] = []
        const cond = req.query.q?.trim() ? `where name ilike $${args.push(likeTerm(req.query.q))} or email ilike $1` : ''
        const [list, total] = await Promise.all([
          rows(pool, `select ${USER_COLS} from users ${cond} ${order} limit ${pg.pageSize} offset ${pg.offset}`, args),
          one<{ n: number }>(pool, `select count(*)::int as n from users ${cond}`, args),
        ])
        return envelope(list, total!.n, pg.page, pg.pageSize)
      },
    )

    // คำเชิญ: สร้างโทเคนใช้ครั้งเดียว (เก็บเฉพาะ sha256) ส่งโทเคนกลับครั้งเดียวให้ผู้ดูแลนำลิงก์ไปส่งต่อ
    // (ยังไม่มีบริการส่งอีเมล) ผู้ถูกเชิญเปิด /invite/<โทเคน> เพื่อตั้งรหัสผ่านและเข้าระบบ
    app.post(
      '/users/invite',
      {
        preValidation: adm,
        schema: {
          tags: ['users'],
          summary: 'เชิญผู้ใช้ — คืนโทเคนคำเชิญ (แสดงครั้งเดียว อายุ 7 วัน)',
          security: sec,
          body: Type.Object({
            email: Type.String({ maxLength: 200 }),
            role: Type.Union([Type.Literal('admin'), Type.Literal('manager'), Type.Literal('viewer')]),
          }),
        },
      },
      async (req, reply) => {
        const email = checkEmail(req.body.email)
        const inv = newInvite()
        const u = await one(
          pool,
          `insert into users (email, name, role, status, invited_at, invite_token_hash, invite_expires_at)
           values ($1, split_part($1, '@', 1), $2, 'invited', now(), $3, now() + ($4::int * interval '1 day'))
           returning ${USER_COLS}, invite_expires_at as "inviteExpiresAt"`,
          [email, req.body.role, inv.hash, config.inviteTtlDays],
        )
        const emailed = await sendInviteMail(mail, req.log, email, inv.token)
        return reply.status(201).send({ ...u, inviteToken: inv.token, emailed })
      },
    )

    app.post(
      '/users/:id/invite-link',
      {
        preValidation: adm,
        schema: { tags: ['users'], summary: 'สร้างลิงก์คำเชิญใหม่ (ลิงก์เดิมใช้ไม่ได้ทันที)', params: Type.Object({ id: Type.String({ format: 'uuid' }) }), security: sec },
      },
      async (req) => {
        const inv = newInvite()
        const u = await one(
          pool,
          `update users set invite_token_hash = $2, invite_expires_at = now() + ($3::int * interval '1 day'), invited_at = now()
            where id = $1 and status = 'invited'
            returning ${USER_COLS}, invite_expires_at as "inviteExpiresAt"`,
          [req.params.id, inv.hash, config.inviteTtlDays],
        )
        if (!u) throw await missingOrActive(pool, req.params.id)
        const emailed = await sendInviteMail(mail, req.log, (u as { email: string }).email, inv.token)
        return { ...u, inviteToken: inv.token, emailed }
      },
    )

    // รีเซ็ตรหัสผ่านโดยผู้ดูแล (กรณีไม่มีอีเมล/ผู้ใช้เข้าอีเมลไม่ได้): ได้ลิงก์ใช้ครั้งเดียวไปส่งต่อเอง
    // ผู้ดูแลไม่เห็นหรือตั้งรหัสผ่านแทนผู้ใช้ได้ — ผู้ใช้ตั้งเองผ่านลิงก์
    app.post(
      '/users/:id/reset-link',
      {
        preValidation: adm,
        schema: {
          tags: ['users'],
          summary: 'สร้างลิงก์รีเซ็ตรหัสผ่านให้ผู้ใช้ที่ใช้งานอยู่ (แสดงครั้งเดียว อายุ 60 นาที; ลิงก์ที่ค้างอยู่เดิมใช้ไม่ได้)',
          params: Type.Object({ id: Type.String({ format: 'uuid' }) }),
          security: sec,
        },
      },
      async (req) => {
        const u = await one<{ id: string; email: string; name: string }>(pool, `select id, email, name from users where id = $1 and status = 'active'`, [req.params.id])
        if (!u) {
          const exists = await one(pool, 'select 1 from users where id = $1', [req.params.id])
          throw exists ? conflict('ผู้ใช้นี้ยังไม่ได้ตอบรับคำเชิญ — ใช้ลิงก์คำเชิญแทน') : notFound('ผู้ใช้')
        }
        const r = newResetToken()
        await pool.query(`update password_resets set used_at = now() where user_id = $1 and used_at is null`, [u.id])
        const row = await one<{ expiresAt: string }>(
          pool,
          `insert into password_resets (token_hash, user_id, expires_at, requested_by)
           values ($1, $2, now() + ($3::int * interval '1 minute'), 'admin') returning expires_at as "expiresAt"`,
          [r.hash, u.id, config.resetTtlMinutes],
        )
        return { id: u.id, email: u.email, name: u.name, resetToken: r.token, expiresAt: row!.expiresAt }
      },
    )

    app.delete(
      '/users/:id',
      {
        preValidation: adm,
        schema: { tags: ['users'], summary: 'ยกเลิกคำเชิญที่ยังไม่ตอบรับ (ลบผู้ใช้ที่ใช้งานแล้วไม่ได้)', params: Type.Object({ id: Type.String({ format: 'uuid' }) }), security: sec },
      },
      async (req) => {
        const r = await one(pool, "delete from users where id = $1 and status = 'invited' returning id", [req.params.id])
        if (!r) throw await missingOrActive(pool, req.params.id)
        return { cancelled: true }
      },
    )

    // ---- API key สำหรับ ingest ----
    app.get('/api-keys', { preValidation: adm, schema: { tags: ['api-keys'], summary: 'รายการ API key (ไม่แสดงคีย์เต็ม)', security: sec } }, async () =>
      rows(pool, `select id, name, key_prefix as prefix, scopes, created_at as "createdAt", last_used_at as "lastUsedAt", revoked_at as "revokedAt" from api_keys order by created_at desc`),
    )

    app.post(
      '/api-keys',
      {
        preValidation: adm,
        schema: {
          tags: ['api-keys'],
          summary: 'สร้าง API key — แสดงคีย์เต็มครั้งเดียวเท่านั้น',
          security: sec,
          body: Type.Object({ name: Type.String({ minLength: 1, maxLength: 80 }) }),
        },
      },
      async (req, reply) => {
        const k = generateApiKey()
        const row = await one<{ id: string; createdAt: string }>(
          pool,
          `insert into api_keys (name, key_prefix, key_hash, created_by) values ($1, $2, $3, $4) returning id, created_at as "createdAt"`,
          [req.body.name.trim(), k.prefix, k.hash, req.user!.id],
        )
        return reply.status(201).send({ id: row!.id, name: req.body.name.trim(), prefix: k.prefix, createdAt: row!.createdAt, key: k.key })
      },
    )

    app.delete(
      '/api-keys/:id',
      { preValidation: adm, schema: { tags: ['api-keys'], summary: 'เพิกถอน API key', params: Type.Object({ id: Type.String({ format: 'uuid' }) }), security: sec } },
      async (req) => {
        const r = await one(pool, `update api_keys set revoked_at = coalesce(revoked_at, now()) where id = $1 returning id`, [req.params.id])
        if (!r) throw notFound('API key')
        return { revoked: true }
      },
    )

    void AppError
  }
