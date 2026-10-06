import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { Type } from '@sinclair/typebox'
import type { FastifyReply } from 'fastify'
import { randomBytes } from 'node:crypto'
import type { Pool } from 'pg'
import { hashKey, requireRole, signToken } from '../auth'
import { config } from '../config'
import { one, withTx } from '../db'
import { AppError, invalid } from '../errors'
import { checkDisplayName, checkPassword, type UserRole } from '../lib/validators'
import type { Mailer } from '../services/mailer'
import { createLoginGuard } from '../lib/loginGuard'

const BAD_LINK = 'ลิงก์คำเชิญไม่ถูกต้องหรือถูกใช้ไปแล้ว'
const EXPIRED_LINK = 'ลิงก์คำเชิญหมดอายุแล้ว กรุณาขอลิงก์ใหม่จากผู้ดูแลระบบ'
const BAD_RESET = 'ลิงก์รีเซ็ตรหัสผ่านไม่ถูกต้องหรือถูกใช้ไปแล้ว'
const EXPIRED_RESET = 'ลิงก์รีเซ็ตรหัสผ่านหมดอายุแล้ว กรุณาขอลิงก์ใหม่'

type InviteRow = { id: string; email: string; name: string; role: UserRole; expired: boolean }
type SessionRow = { id: string; email: string; name: string; role: UserRole; sv: number }
type ResetRow = { user_id: string; email: string; name: string; expired: boolean; used: boolean }

const RESET_SELECT = `select r.user_id, u.email, u.name, r.expires_at < now() as expired, r.used_at is not null as used
   from password_resets r join users u on u.id = r.user_id and u.status = 'active'`

function assertUsableReset(r: ResetRow | null | undefined): asserts r is ResetRow {
  if (!r || r.used) throw new AppError(404, 'invalid_reset', BAD_RESET)
  if (r.expired) throw new AppError(410, 'expired_reset', EXPIRED_RESET)
}

const publicUser = ({ id, email, name, role }: SessionRow) => ({ id, email, name, role })

function setSession(reply: FastifyReply, row: SessionRow, ttl: number, persistent = false) {
  reply.setCookie(config.sessionCookie, signToken(row, ttl), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: config.cookieSecure,
    ...(persistent ? { maxAge: ttl } : {}), // ไม่จดจำ = session cookie
  })
}

export function newResetToken() {
  const token = randomBytes(32).toString('base64url')
  return { token, hash: hashKey(token) }
}

/** ตัวส่งอีเมล + ตัวติดตามงานส่งที่ยังค้าง (ให้เทสต์รอได้ และปิดระบบอย่างเรียบร้อย) */
export interface MailContext {
  mailer: Mailer
  track(p: Promise<unknown>): void
}

/** bcrypt ปลอมสำหรับเทียบเวลา — ใช้เมื่อไม่พบบัญชี เพื่อให้ตอบช้าพอ ๆ กับกรณีรหัสผิด (ไม่ให้เดาได้ว่ามีอีเมลนี้) */
const DUMMY_HASH = '$2a$10$7EqJtq98hPqEX7fNZaFWoOhi5BUyLEbLp4c1YQ9o9xYqEoK4gqzL2'

export const authRoutes =
  (pool: Pool, mail: MailContext): FastifyPluginAsyncTypebox =>
  async (app) => {
    const loginGuard = createLoginGuard()

    app.post(
      '/auth/login',
      {
        // จำกัดการเดารหัสผ่านต่อ IP: 30 ครั้ง/นาที (เปิดเว็บตรงโดยไม่มี reverse proxy ทุกผู้ใช้จะมี IP เดียวกันในสายตา API
        // จึงไม่ตั้งต่ำเกินไป) — ตัวป้องกันหลักคือการจำกัดรายบัญชีด้านล่าง (loginGuard) ซึ่งไม่ขึ้นกับ IP
        config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
        schema: {
          tags: ['auth'],
          summary: 'เข้าสู่ระบบ (ตั้ง session cookie)',
          body: Type.Object({
            email: Type.String({ minLength: 3, maxLength: 200 }),
            password: Type.String({ minLength: 1, maxLength: 200 }),
            remember: Type.Optional(Type.Boolean()),
          }),
        },
      },
      async (req, reply) => {
        const { email, password, remember } = req.body
        // เดาผิดรายบัญชีเกินเพดาน (จาก IP ใดก็ตาม) → ปฏิเสธชั่วคราวก่อนแตะฐานข้อมูล
        if (loginGuard.blocked(email)) throw new AppError(429, 'rate_limited', 'พยายามเข้าสู่ระบบผิดหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่')
        // ตรวจรหัสผ่านด้วย bcrypt ในฐานข้อมูล (pgcrypto) และบันทึกเวลาเข้าใช้ในคำสั่งเดียว
        const row = await one<SessionRow>(
          pool,
          `update users set last_login_at = now()
            where lower(email) = lower($1) and status = 'active' and password_hash = crypt($2, password_hash)
            returning id, email, name, role, session_version as sv`,
          [email.trim(), password],
        )
        if (!row) {
          loginGuard.fail(email)
          // ไม่มีบัญชีนี้ที่ใช้งานอยู่: ยังต้องเสียเวลา bcrypt เท่ากับกรณีรหัสผิด (ซึ่ง UPDATE ข้างบนทำ bcrypt ไปแล้วหนึ่งครั้ง)
          // ไม่เช่นนั้นเวลาตอบที่เร็วกว่าบอกได้ว่าอีเมลนี้ไม่มีในระบบ
          const exists = await one(pool, "select 1 from users where lower(email) = lower($1) and status = 'active' and password_hash is not null", [email.trim()])
          if (!exists) await pool.query('select crypt($1, $2)', [password, DUMMY_HASH]).catch(() => undefined)
          throw new AppError(401, 'invalid_credentials', 'อีเมลหรือรหัสผ่านไม่ถูกต้อง')
        }
        loginGuard.success(email)

        const ttl = remember ? config.rememberTtlSeconds : config.sessionTtlSeconds
        setSession(reply, row, ttl, remember)
        return { user: publicUser(row) }
      },
    )

    // ---- ตอบรับคำเชิญ ----
    // โทเคนส่งใน body (ไม่ใส่ใน URL) เพื่อไม่ให้ติดใน access log

    app.post(
      '/auth/invite/lookup',
      {
        config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
        schema: {
          tags: ['auth'],
          summary: 'ตรวจลิงก์คำเชิญ (ไม่ต้องล็อกอิน) — คืนอีเมลและบทบาทที่ถูกเชิญ',
          body: Type.Object({ token: Type.String({ minLength: 20, maxLength: 200 }) }),
        },
      },
      async (req) => {
        const inv = await one<InviteRow>(
          pool,
          `select id, email, name, role, invite_expires_at < now() as expired
             from users where invite_token_hash = $1 and status = 'invited'`,
          [hashKey(req.body.token)],
        )
        if (!inv) throw new AppError(404, 'invalid_invite', BAD_LINK)
        if (inv.expired) throw new AppError(410, 'expired_invite', EXPIRED_LINK)
        return { email: inv.email, name: inv.name, role: inv.role }
      },
    )

    app.post(
      '/auth/invite/accept',
      {
        // จำกัดการเดาโทเคน/รหัสผ่าน: 10 ครั้ง/นาที/IP
        config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
        schema: {
          tags: ['auth'],
          summary: 'ตอบรับคำเชิญ: ตั้งรหัสผ่าน เปิดใช้บัญชี และเข้าสู่ระบบ (โทเคนใช้ได้ครั้งเดียว)',
          body: Type.Object({
            token: Type.String({ minLength: 20, maxLength: 200 }),
            password: Type.String({ maxLength: 200 }),
            name: Type.Optional(Type.String({ maxLength: 100 })),
          }),
        },
      },
      async (req, reply) => {
        const { token, password } = req.body
        // ตรวจรูปแบบรหัสผ่านก่อน เพื่อไม่ให้เสียโทเคน/ไม่ต้องล็อกแถว
        checkPassword(password)
        const name = req.body.name ? checkDisplayName(req.body.name) : null

        const user = await withTx(pool, async (c) => {
          const inv = await one<InviteRow>(
            c,
            `select id, email, name, role, invite_expires_at < now() as expired
               from users where invite_token_hash = $1 and status = 'invited' for update`,
            [hashKey(token)],
          )
          if (!inv) throw new AppError(404, 'invalid_invite', BAD_LINK)
          if (inv.expired) throw new AppError(410, 'expired_invite', EXPIRED_LINK)
          // ตั้งรหัสผ่านด้วย bcrypt ในฐานข้อมูล แล้วทำให้โทเคนใช้ซ้ำไม่ได้ในคำสั่งเดียวกัน
          return one<SessionRow>(
            c,
            `update users set status = 'active', password_hash = crypt($2, gen_salt('bf', 10)),
                    name = coalesce($3, name), invite_token_hash = null, invite_expires_at = null, last_login_at = now()
              where id = $1 returning id, email, name, role, session_version as sv`,
            [inv.id, password, name],
          )
        })
        if (!user) throw new AppError(404, 'invalid_invite', BAD_LINK)

        setSession(reply, user, config.sessionTtlSeconds)
        return { user: publicUser(user) }
      },
    )

    // ---- เปลี่ยนรหัสผ่าน (ล็อกอินอยู่) ----
    app.post(
      '/auth/change-password',
      {
        preValidation: requireRole(pool, 'viewer'),
        // กันการเดารหัสผ่านปัจจุบันจาก session ที่ถูกขโมย
        config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
        schema: {
          tags: ['auth'],
          summary: 'เปลี่ยนรหัสผ่าน — ต้องยืนยันรหัสผ่านปัจจุบัน; session อื่นทั้งหมดถูกเพิกถอน และออก session ใหม่ให้เครื่องนี้',
          security: [{ cookieAuth: [] }, { bearerAuth: [] }],
          body: Type.Object({
            currentPassword: Type.String({ maxLength: 200 }),
            newPassword: Type.String({ maxLength: 200 }),
          }),
        },
      },
      async (req, reply) => {
        const { currentPassword, newPassword } = req.body
        checkPassword(newPassword, 'newPassword')
        if (newPassword === currentPassword) throw invalid({ newPassword: 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านปัจจุบัน' })
        // ใช้ 422 (ไม่ใช่ 401) เพราะเว็บจะพาไปหน้าเข้าสู่ระบบเมื่อได้ 401
        const row = await one<SessionRow>(
          pool,
          `update users set password_hash = crypt($3, gen_salt('bf', 10)), session_version = session_version + 1
            where id = $1 and status = 'active' and password_hash = crypt($2, password_hash)
            returning id, email, name, role, session_version as sv`,
          [req.user!.id, currentPassword, newPassword],
        )
        if (!row) throw invalid({ currentPassword: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' })
        setSession(reply, row, config.sessionTtlSeconds)
        return { ok: true }
      },
    )

    // ---- ลืมรหัสผ่าน ----
    app.post(
      '/auth/forgot-password',
      {
        config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
        schema: {
          tags: ['auth'],
          summary: 'ขอลิงก์รีเซ็ตรหัสผ่านทางอีเมล (ตอบเหมือนกันเสมอ ไม่บอกว่ามีอีเมลนี้หรือไม่)',
          body: Type.Object({ email: Type.String({ maxLength: 200 }) }),
        },
      },
      async (req) => {
        const email = req.body.email.trim()
        // คำนวณในพื้นหลัง: เวลาตอบกลับต้องไม่ต่างกันระหว่างอีเมลที่มี/ไม่มีในระบบ
        mail.track(
          (async () => {
            const u = await one<{ id: string; email: string; name: string }>(
              pool,
              `select id, email, name from users where lower(email) = lower($1) and status = 'active'`,
              [email],
            )
            if (!u) return
            // จำกัดการสแปม: ผู้ใช้เดียวขอได้ไม่เกิน 3 ลิงก์ที่ยังใช้ได้ใน 15 นาที
            const recent = await one<{ n: number }>(
              pool,
              `select count(*)::int as n from password_resets where user_id = $1 and created_at > now() - interval '15 minutes'`,
              [u.id],
            )
            if (recent!.n >= 3) return
            const r = newResetToken()
            await pool.query(`insert into password_resets (token_hash, user_id, expires_at, requested_by) values ($1, $2, now() + ($3::int * interval '1 minute'), 'self')`, [
              r.hash,
              u.id,
              config.resetTtlMinutes,
            ])
            await mail.mailer.send({
              to: u.email,
              subject: 'ตั้งรหัสผ่านใหม่ — EV Monitor',
              text:
                `สวัสดี ${u.name}\n\n` +
                `มีการขอรีเซ็ตรหัสผ่านของบัญชีนี้ คลิกลิงก์ด้านล่างเพื่อตั้งรหัสผ่านใหม่ (ใช้ได้ครั้งเดียว ภายใน ${config.resetTtlMinutes} นาที):\n\n` +
                `${config.appBaseUrl}/reset-password/${r.token}\n\n` +
                `หากคุณไม่ได้เป็นผู้ขอ ไม่ต้องดำเนินการใด ๆ รหัสผ่านเดิมยังใช้งานได้ตามปกติ`,
            })
          })().catch((err) => req.log.error({ err }, 'forgot-password failed')),
        )
        return { ok: true }
      },
    )

    app.post(
      '/auth/reset/lookup',
      {
        config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
        schema: {
          tags: ['auth'],
          summary: 'ตรวจลิงก์รีเซ็ตรหัสผ่าน (ไม่ต้องล็อกอิน) — คืนอีเมลบัญชี',
          body: Type.Object({ token: Type.String({ minLength: 20, maxLength: 200 }) }),
        },
      },
      async (req) => {
        const r = await one<ResetRow>(pool, `${RESET_SELECT} where r.token_hash = $1`, [hashKey(req.body.token)])
        assertUsableReset(r)
        return { email: r.email, name: r.name }
      },
    )

    app.post(
      '/auth/reset/accept',
      {
        config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
        schema: {
          tags: ['auth'],
          summary: 'ตั้งรหัสผ่านใหม่ด้วยลิงก์รีเซ็ต (ใช้ได้ครั้งเดียว) — session เดิมทั้งหมดถูกเพิกถอน ต้องเข้าสู่ระบบใหม่',
          body: Type.Object({
            token: Type.String({ minLength: 20, maxLength: 200 }),
            password: Type.String({ maxLength: 200 }),
          }),
        },
      },
      async (req) => {
        const { token, password } = req.body
        checkPassword(password)
        await withTx(pool, async (c) => {
          const r = await one<ResetRow>(c, `${RESET_SELECT} where r.token_hash = $1 for update of r`, [hashKey(token)])
          assertUsableReset(r)
          await c.query(`update password_resets set used_at = now() where token_hash = $1`, [hashKey(token)])
          // ลิงก์ที่ค้างอยู่ของผู้ใช้นี้ใช้ไม่ได้อีก และ session ทุกเครื่องถูกเพิกถอน
          await c.query(`update password_resets set used_at = now() where user_id = $1 and used_at is null`, [r.user_id])
          await c.query(`update users set password_hash = crypt($2, gen_salt('bf', 10)), session_version = session_version + 1 where id = $1`, [r.user_id, password])
        })
        return { ok: true }
      },
    )

    app.post('/auth/logout', { schema: { tags: ['auth'], summary: 'ออกจากระบบ (ล้าง cookie)' } }, async (_req, reply) => {
      reply.clearCookie(config.sessionCookie, { path: '/' })
      return { ok: true }
    })

    app.get(
      '/auth/me',
      { preValidation: requireRole(pool, 'viewer'), schema: { tags: ['auth'], summary: 'ผู้ใช้ปัจจุบัน', security: [{ cookieAuth: [] }, { bearerAuth: [] }] } },
      async (req) => ({ user: req.user }),
    )
  }
