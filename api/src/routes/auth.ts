import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { Type } from '@sinclair/typebox'
import type { Pool } from 'pg'
import { hashKey, requireRole, signToken } from '../auth'
import { config } from '../config'
import { one, withTx } from '../db'
import { AppError } from '../errors'
import { checkDisplayName, checkPassword, type UserRole } from '../lib/validators'

const BAD_LINK = 'ลิงก์คำเชิญไม่ถูกต้องหรือถูกใช้ไปแล้ว'
const EXPIRED_LINK = 'ลิงก์คำเชิญหมดอายุแล้ว กรุณาขอลิงก์ใหม่จากผู้ดูแลระบบ'

type InviteRow = { id: string; email: string; name: string; role: UserRole; expired: boolean }

export const authRoutes =
  (pool: Pool): FastifyPluginAsyncTypebox =>
  async (app) => {
    app.post(
      '/auth/login',
      {
        // จำกัดการเดารหัสผ่าน: 10 ครั้ง/นาที/IP
        config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
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
        // ตรวจรหัสผ่านด้วย bcrypt ในฐานข้อมูล (pgcrypto) และบันทึกเวลาเข้าใช้ในคำสั่งเดียว
        const user = await one<{ id: string; email: string; name: string; role: UserRole }>(
          pool,
          `update users set last_login_at = now()
            where lower(email) = lower($1) and status = 'active' and password_hash = crypt($2, password_hash)
            returning id, email, name, role`,
          [email.trim(), password],
        )
        if (!user) throw new AppError(401, 'invalid_credentials', 'อีเมลหรือรหัสผ่านไม่ถูกต้อง')

        const ttl = remember ? config.rememberTtlSeconds : config.sessionTtlSeconds
        reply.setCookie(config.sessionCookie, signToken(user, ttl), {
          httpOnly: true,
          sameSite: 'lax',
          path: '/',
          secure: config.cookieSecure,
          ...(remember ? { maxAge: ttl } : {}), // ไม่จดจำ = session cookie
        })
        return { user }
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
          return one<{ id: string; email: string; name: string; role: UserRole }>(
            c,
            `update users set status = 'active', password_hash = crypt($2, gen_salt('bf', 10)),
                    name = coalesce($3, name), invite_token_hash = null, invite_expires_at = null, last_login_at = now()
              where id = $1 returning id, email, name, role`,
            [inv.id, password, name],
          )
        })
        if (!user) throw new AppError(404, 'invalid_invite', BAD_LINK)

        reply.setCookie(config.sessionCookie, signToken(user, config.sessionTtlSeconds), {
          httpOnly: true,
          sameSite: 'lax',
          path: '/',
          secure: config.cookieSecure,
        })
        return { user }
      },
    )

    app.post('/auth/logout', { schema: { tags: ['auth'], summary: 'ออกจากระบบ (ล้าง cookie)' } }, async (_req, reply) => {
      reply.clearCookie(config.sessionCookie, { path: '/' })
      return { ok: true }
    })

    app.get(
      '/auth/me',
      { preValidation: requireRole('viewer'), schema: { tags: ['auth'], summary: 'ผู้ใช้ปัจจุบัน', security: [{ cookieAuth: [] }, { bearerAuth: [] }] } },
      async (req) => ({ user: req.user }),
    )
  }
