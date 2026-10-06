import nodemailer from 'nodemailer'

export interface Mail {
  to: string
  subject: string
  text: string
  attachments?: { filename: string; content: Buffer; contentType?: string }[]
}

export interface Mailer {
  mode: 'smtp' | 'log' | 'off'
  send(mail: Mail): Promise<void>
}

interface Logger {
  info: (obj: object, msg: string) => void
  warn: (obj: object, msg: string) => void
}

/**
 * ตัวส่งอีเมล: smtp (ผ่าน SMTP_URL เช่น smtp://user:pass@host:587) · log (เขียนลง log — เฉพาะพัฒนา) · off (ไม่ส่ง)
 * โหมด off เป็นค่าเริ่มต้นเมื่อไม่ได้ตั้ง SMTP_URL เพื่อไม่ให้ลิงก์รีเซ็ตหลุดไปอยู่ใน log โดยไม่ตั้งใจ
 */
export function createMailer(opts: { mode: 'smtp' | 'log' | 'off'; smtpUrl?: string; from: string; log: Logger }): Mailer {
  const { mode, smtpUrl, from, log } = opts

  if (mode === 'smtp') {
    if (!smtpUrl) throw new Error('MAIL_MODE=smtp ต้องตั้งค่า SMTP_URL')
    const transport = nodemailer.createTransport(smtpUrl)
    return {
      mode,
      async send(mail) {
        await transport.sendMail({ from, to: mail.to, subject: mail.subject, text: mail.text, attachments: mail.attachments })
      },
    }
  }

  if (mode === 'log') {
    log.warn({}, 'MAIL_MODE=log: อีเมลทั้งหมด (รวมลิงก์รีเซ็ตรหัสผ่าน) จะถูกเขียนลง log — ใช้เฉพาะการพัฒนา')
    return {
      mode,
      async send(mail) {
        log.info({ to: mail.to, subject: mail.subject, body: mail.text, attachments: mail.attachments?.map((a) => a.filename) }, 'mail (log mode)')
      },
    }
  }

  log.warn({}, 'ยังไม่ได้ตั้งค่าอีเมล (SMTP_URL): ระบบจะไม่ส่งอีเมลลืมรหัสผ่าน — ผู้ดูแลระบบสร้างลิงก์รีเซ็ตให้ผู้ใช้เองได้ที่หน้าตั้งค่า')
  return {
    mode: 'off',
    async send() {
      /* ไม่ส่ง */
    },
  }
}
