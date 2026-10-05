import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { Type } from '@sinclair/typebox'
import type { Pool } from 'pg'
import { requireRole, signToken } from '../auth'
import { config } from '../config'
import { one } from '../db'
import { AppError } from '../errors'
import type { UserRole } from '../lib/validators'

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
