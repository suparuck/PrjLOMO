import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { Type } from '@sinclair/typebox'
import type { Pool } from 'pg'
import { generateApiKey, requireRole } from '../auth'
import { one, rows } from '../db'
import { AppError, invalid, notFound } from '../errors'
import { checkEmail } from '../lib/validators'

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

const SETTINGS_SQL = `select org, thresholds, notify, charging from app_settings where id = 1`

export const settingsRoutes =
  (pool: Pool): FastifyPluginAsyncTypebox =>
  async (app) => {
    const viewer = requireRole('viewer')
    const mgr = requireRole('manager')
    const adm = requireRole('admin')

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
    app.get('/users', { preValidation: mgr, schema: { tags: ['users'], summary: 'ผู้ใช้และบทบาท', security: sec } }, async () =>
      rows(
        pool,
        `select id, email, name, role, status, last_login_at as "lastLoginAt", invited_at as "invitedAt"
           from users order by (role = 'admin') desc, created_at, email`,
      ),
    )

    app.post(
      '/users/invite',
      {
        preValidation: adm,
        schema: {
          tags: ['users'],
          summary: 'เชิญผู้ใช้ (บันทึกคำเชิญสถานะ invited — ยังไม่ส่งอีเมลจริง)',
          security: sec,
          body: Type.Object({
            email: Type.String({ maxLength: 200 }),
            role: Type.Union([Type.Literal('admin'), Type.Literal('manager'), Type.Literal('viewer')]),
          }),
        },
      },
      async (req, reply) => {
        const email = checkEmail(req.body.email)
        const u = await one(
          pool,
          `insert into users (email, name, role, status, invited_at) values ($1, split_part($1, '@', 1), $2, 'invited', now())
           returning id, email, name, role, status, last_login_at as "lastLoginAt", invited_at as "invitedAt"`,
          [email, req.body.role],
        )
        return reply.status(201).send(u)
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
