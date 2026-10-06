import Fastify, { type FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import rateLimit from '@fastify/rate-limit'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox'
import type { Pool } from 'pg'
import { config } from './config'
import { AppError, UNIQUE_MESSAGES } from './errors'
import { authRoutes } from './routes/auth'
import { vehicleRoutes } from './routes/vehicles'
import { driverRoutes } from './routes/drivers'
import { chargingRoutes } from './routes/charging'
import { alertRoutes } from './routes/alerts'
import { reportRoutes } from './routes/reports'
import { settingsRoutes } from './routes/settings'
import { publicRoutes } from './routes/public'
import { ingestRoutes } from './routes/ingest'
import { streamRoutes } from './routes/stream'
import { publishChange } from './services/events'
import { createMailer, type Mailer } from './services/mailer'

declare module 'fastify' {
  interface FastifyInstance {
    /** รอจนอีเมลที่ค้างส่งอยู่เสร็จ (ใช้ในเทสต์) */
    mailIdle(): Promise<void>
  }
}

export type App = FastifyInstance<any, any, any, any, TypeBoxTypeProvider>

export async function buildApp(pool: Pool, opts: { logger?: boolean; rateLimit?: boolean; mailer?: Mailer } = {}) {
  const app = Fastify({
    logger: opts.logger === false ? false : { level: config.logLevel },
    trustProxy: true, // อยู่หลังพร็อกซีของเว็บ — ใช้ IP จริงสำหรับ rate limit
    ajv: { customOptions: { removeAdditional: true, coerceTypes: true, useDefaults: true, allErrors: true } },
  }).withTypeProvider<TypeBoxTypeProvider>()

  const mailer =
    opts.mailer ?? createMailer({ mode: config.mailMode, smtpUrl: config.smtpUrl, from: config.mailFrom, log: app.log as any })
  // อีเมลส่งแบบ fire-and-forget (ไม่ให้เวลาตอบกลับรั่วข้อมูล) — เก็บงานค้างไว้ให้เทสต์/ตอนปิดระบบรอได้
  const pendingMail = new Set<Promise<unknown>>()
  const track = (p: Promise<unknown>) => {
    pendingMail.add(p)
    void p.finally(() => pendingMail.delete(p))
  }
  app.decorate('mailIdle', async () => {
    await Promise.allSettled([...pendingMail])
  })
  app.addHook('onClose', async () => {
    await Promise.allSettled([...pendingMail])
  })

  // ทุกคำขอที่แก้ข้อมูลสำเร็จ (ไม่นับ /auth) → แจ้งเบราว์เซอร์ที่เปิดสตรีมอยู่ให้โหลดข้อมูลใหม่
  app.addHook('onResponse', async (req, reply) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || reply.statusCode >= 400 || req.url.includes('/auth/')) return
    publishChange()
  })

  await app.register(cookie)
  if (opts.rateLimit !== false) await app.register(rateLimit, { global: true, max: 600, timeWindow: '1 minute' })

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'EV Monitor API',
        version: '0.1.0',
        description:
          'REST API ของระบบบริหารกองยานรถยนต์ไฟฟ้า\n\n' +
          '- กลุ่มปกติ ใช้ session cookie `ev_session` (ได้จาก `POST /auth/login`) หรือ `Authorization: Bearer <token>` ตามบทบาท viewer < manager < admin\n' +
          '- กลุ่ม `ingest` สำหรับอุปกรณ์/ระบบภายนอกส่งข้อมูลเข้ามา ใช้ส่วนหัว `X-API-Key`',
      },
      components: {
        securitySchemes: {
          cookieAuth: { type: 'apiKey', in: 'cookie', name: config.sessionCookie },
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
          apiKey: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
        },
      },
    },
  })
  await app.register(swaggerUi, { routePrefix: '/docs' })

  // ---- รูปแบบข้อผิดพลาดเดียวกันทั้งระบบ ----
  app.setErrorHandler((err: any, req, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.status).send({ error: { code: err.code, message: err.message, fields: err.fields } })
    }
    if (err.validation) {
      const fields: Record<string, string> = {}
      for (const v of err.validation) {
        const key = String(v.instancePath || v.params?.missingProperty || '_').replace(/^\//, '').replace(/\//g, '.') || String(v.params?.missingProperty ?? '_')
        fields[key || '_'] = v.message ?? 'ข้อมูลไม่ถูกต้อง'
      }
      return reply.status(400).send({ error: { code: 'bad_request', message: 'ข้อมูลที่ส่งมาไม่ถูกต้อง', fields } })
    }
    if (err.code === '23505') {
      // unique_violation — แปลงชื่อ constraint เป็นข้อความรายฟิลด์
      const [field, message] = UNIQUE_MESSAGES[err.constraint as string] ?? ['_', 'ข้อมูลซ้ำกับที่มีอยู่แล้ว']
      return reply.status(409).send({ error: { code: 'conflict', message, fields: { [field]: message } } })
    }
    if (err.code === '23503') {
      return reply.status(422).send({ error: { code: 'invalid', message: 'อ้างอิงข้อมูลที่ไม่มีอยู่ในระบบ', fields: { _: 'อ้างอิงข้อมูลที่ไม่มีอยู่ในระบบ' } } })
    }
    if (err.statusCode === 429) {
      return reply.status(429).send({ error: { code: 'rate_limited', message: 'เรียกใช้ถี่เกินไป กรุณาลองใหม่ภายหลัง' } })
    }
    if (err.statusCode && err.statusCode < 500) {
      return reply.status(err.statusCode).send({ error: { code: 'bad_request', message: err.message } })
    }
    req.log.error({ err }, 'unhandled error')
    return reply.status(500).send({ error: { code: 'internal', message: 'เกิดข้อผิดพลาดภายในระบบ' } })
  })
  app.setNotFoundHandler((_req, reply) => reply.status(404).send({ error: { code: 'not_found', message: 'ไม่พบเส้นทางที่เรียก' } }))

  app.get('/healthz', { schema: { hide: true } }, async () => {
    await pool.query('select 1')
    return { status: 'ok' }
  })

  await app.register(
    async (v1) => {
      await v1.register(authRoutes(pool, { mailer, track }))
      await v1.register(vehicleRoutes(pool))
      await v1.register(driverRoutes(pool))
      await v1.register(chargingRoutes(pool))
      await v1.register(alertRoutes(pool))
      await v1.register(reportRoutes(pool))
      await v1.register(settingsRoutes(pool, { mailer, track }))
      await v1.register(publicRoutes(pool))
      await v1.register(ingestRoutes(pool))
      await v1.register(streamRoutes(pool))
    },
    { prefix: '/api/v1' },
  )

  return app as unknown as App
}
