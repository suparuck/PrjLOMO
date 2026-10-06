import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { Type } from '@sinclair/typebox'
import type { Pool } from 'pg'
import { randomBytes } from 'node:crypto'
import { generateApiKey, hashKey, requireRole } from '../auth'
import { config } from '../config'
import { one, rows, withTx } from '../db'
import { AppError, conflict, invalid, notFound } from '../errors'
import { checkDisplayName, checkEmail } from '../lib/validators'
import { newResetToken, type MailContext } from './auth'
import type { LineClient } from '../services/line'
import { findDefaultPasswordUsers } from '../services/accounts'
import { disable as disableTwoFactor } from '../services/twofactor'
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

const USER_COLS = `id, email, name, role, status, last_login_at as "lastLoginAt", invited_at as "invitedAt", totp_enabled_at is not null as "twoFactorEnabled"`

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
  (pool: Pool, mail: MailContext, line: LineClient): FastifyPluginAsyncTypebox =>
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

    app.get('/integrations', { preValidation: mgr, schema: { tags: ['settings'], summary: 'การเชื่อมต่อกับระบบภายนอก (LINE แสดงตามการตั้งค่า token จริง)', security: sec } }, async () => {
      const list = await rows<{ key: string; connected: boolean }>(
        pool,
        `select key, name, description as text, logo, color_token as "colorToken", connected, action_label as "actionLabel" from integrations order by sort`,
      )
      return list.map((i) => (i.key === 'line' ? { ...i, connected: line.configured } : i))
    })

    app.post(
      '/integrations/line/test',
      {
        preValidation: adm,
        config: { rateLimit: { max: 3, timeWindow: '1 minute' } },
        schema: { tags: ['settings'], summary: 'ส่งข้อความทดสอบเข้า LINE (admin) — ใช้โควตาข้อความของ LINE 1 ข้อความ', security: sec },
      },
      async () => {
        const r = await line.push('EV Monitor: ข้อความทดสอบ — การเชื่อมต่อ LINE ทำงานปกติ')
        if (!r.ok) throw invalid({ _: r.error })
        return { sent: true }
      },
    )

    // บัญชีที่ยังใช้รหัสผ่านตั้งต้นของข้อมูลเดโม — หน้าเว็บแสดงแบนเนอร์เตือนผู้ดูแล (ไม่คืนรหัสผ่าน/hash)
    app.get(
      '/security/status',
      { preValidation: adm, schema: { tags: ['users'], summary: 'บัญชีที่ยังใช้รหัสผ่านตั้งต้น (admin)', security: sec } },
      async () => ({
        defaultPasswordUsers: await findDefaultPasswordUsers(pool),
        require2faAdmins: !!(await one<{ r: boolean }>(pool, 'select require_admin_2fa as r from app_settings where id = 1'))?.r,
        adminsWithout2fa: (await one<{ n: number }>(pool, "select count(*)::int as n from users where role = 'admin' and status = 'active' and totp_enabled_at is null"))?.n ?? 0,
      }),
    )

    // บังคับให้ผู้ดูแลทุกคนเปิด 2FA: ผู้ดูแลที่ยังไม่เปิดเข้าได้แค่หน้าบัญชีของฉันเพื่อตั้งค่า (API อื่นตอบ 403 two_factor_required)
    app.put(
      '/security/2fa-policy',
      {
        preValidation: adm,
        schema: { tags: ['users'], summary: 'เปิด/ปิดการบังคับ 2FA สำหรับผู้ดูแลระบบ (admin) — เปิดได้เมื่อผู้ตั้งค่าเปิด 2FA ของตัวเองแล้ว', body: Type.Object({ required: Type.Boolean() }), security: sec },
      },
      async (req) => {
        if (req.body.required) {
          const self = await one<{ on: boolean }>(pool, 'select totp_enabled_at is not null as "on" from users where id = $1', [req.user!.id])
          if (!self?.on) throw conflict('ต้องเปิด 2FA ของบัญชีตัวเองก่อนจึงจะบังคับใช้กับผู้ดูแลทุกคนได้')
        }
        await pool.query('update app_settings set require_admin_2fa = $1 where id = 1', [req.body.required])
        return { required: req.body.required }
      },
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

    // แก้ไขผู้ใช้ที่ใช้งานอยู่/ถูกปิด: ชื่อ บทบาท เปิด-ปิดบัญชี (admin)
    // ป้องกัน: ห้ามเปลี่ยนบทบาท/ปิดบัญชีตัวเอง และห้ามทำให้ไม่เหลือผู้ดูแลที่ใช้งานอยู่เลย
    app.patch(
      '/users/:id',
      {
        preValidation: adm,
        schema: {
          tags: ['users'],
          summary: 'แก้ไขผู้ใช้: ชื่อ บทบาท เปิด/ปิดใช้งานบัญชี (admin; ผู้ที่ยังไม่ตอบรับคำเชิญแก้ไม่ได้)',
          security: sec,
          params: Type.Object({ id: Type.String({ format: 'uuid' }) }),
          body: Type.Object({
            name: Type.Optional(Type.String({ maxLength: 100 })),
            role: Type.Optional(Type.Union([Type.Literal('admin'), Type.Literal('manager'), Type.Literal('viewer')])),
            status: Type.Optional(Type.Union([Type.Literal('active'), Type.Literal('disabled')])),
          }),
        },
      },
      async (req) => {
        const b = req.body
        const name = b.name !== undefined ? checkDisplayName(b.name) : undefined
        const self = req.params.id === req.user!.id
        if (self && b.role !== undefined) throw invalid({ role: 'เปลี่ยนบทบาทของตัวเองไม่ได้' })
        if (self && b.status === 'disabled') throw invalid({ status: 'ปิดบัญชีของตัวเองไม่ได้' })

        return withTx(pool, async (c) => {
          // ล็อกผู้ดูแลที่ใช้งานอยู่ทุกคนก่อน — สองคนลดสิทธิ์/ปิดบัญชีกันพร้อมกันแล้วไม่เหลือผู้ดูแลเลยไม่ได้
          const admins = await rows<{ id: string }>(c, "select id from users where role = 'admin' and status = 'active' order by id for update")
          const u = await one<{ role: string; status: string }>(c, 'select role::text as role, status::text as status from users where id = $1 for update', [req.params.id])
          if (!u) throw notFound('ผู้ใช้')
          if (u.status === 'invited') throw conflict('ผู้ใช้นี้ยังไม่ได้ตอบรับคำเชิญ จึงแก้ไขไม่ได้ — ใช้ลิงก์คำเชิญหรือยกเลิกคำเชิญแทน')

          const role = b.role ?? u.role
          const status = b.status ?? u.status
          const wasActiveAdmin = u.role === 'admin' && u.status === 'active'
          const stillActiveAdmin = role === 'admin' && status === 'active'
          if (wasActiveAdmin && !stillActiveAdmin && admins.filter((a) => a.id !== req.params.id).length === 0) {
            throw invalid({ _: 'ต้องมีผู้ดูแลระบบที่ใช้งานอยู่อย่างน้อย 1 คน' })
          }

          const disabling = u.status === 'active' && status === 'disabled'
          const row = await one(
            c,
            `update users set name = coalesce($2, name), role = $3, status = $4,
                    session_version = session_version + (case when $5 then 1 else 0 end)
              where id = $1 returning ${USER_COLS}`,
            [req.params.id, name ?? null, role, status, disabling],
          )
          // ปิดบัญชี: ลิงก์รีเซ็ตรหัสผ่านที่ค้างอยู่ใช้ไม่ได้ด้วย (session เดิมหลุดจาก session_version + guard ที่ตรวจ status)
          if (disabling) await c.query('update password_resets set used_at = now() where user_id = $1 and used_at is null', [req.params.id])
          return row
        })
      },
    )

    // ผู้ใช้ทำเครื่องที่ใช้ยืนยันตัวตนหาย/ไม่มีรหัสสำรอง: ผู้ดูแลรีเซ็ต 2FA ให้ (ทุก session ของผู้ใช้นั้นหลุด และต้องตั้ง 2FA ใหม่เอง)
    app.post(
      '/users/:id/2fa-reset',
      {
        preValidation: adm,
        schema: { tags: ['users'], summary: 'รีเซ็ต 2FA ของผู้ใช้ (admin) — ใช้เมื่อผู้ใช้เข้าไม่ได้เพราะทำอุปกรณ์/รหัสสำรองหาย', params: Type.Object({ id: Type.String({ format: 'uuid' }) }), security: sec },
      },
      async (req) => {
        const r = await disableTwoFactor(pool, req.params.id)
        if (!r) throw notFound('ผู้ใช้')
        if (!r.wasEnabled) throw conflict('ผู้ใช้นี้ไม่ได้เปิดใช้การยืนยันตัวตนสองขั้นตอน')
        return { reset: true }
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
          const exists = await one<{ status: string }>(pool, 'select status::text as status from users where id = $1', [req.params.id])
          if (!exists) throw notFound('ผู้ใช้')
          throw conflict(exists.status === 'disabled' ? 'บัญชีนี้ถูกปิดใช้งาน — เปิดใช้งานก่อนจึงจะรีเซ็ตรหัสผ่านได้' : 'ผู้ใช้นี้ยังไม่ได้ตอบรับคำเชิญ — ใช้ลิงก์คำเชิญแทน')
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
