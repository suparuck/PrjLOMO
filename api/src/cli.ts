/**
 * เครื่องมือบริหารบัญชีผ่านบรรทัดคำสั่ง (ไม่ต้องมีผู้ดูแลเข้าเว็บก่อน) — รันใน container ของ API:
 *   docker compose exec api node dist/cli.js <คำสั่ง> [ตัวเลือก]
 *
 *   create-admin --email <อีเมล> --name <ชื่อ>   สร้างผู้ดูแลระบบ (ถามรหัสผ่านแบบซ่อนตัวอักษร)
 *   set-password --email <อีเมล>                 ตั้งรหัสผ่านใหม่ (ทุกอุปกรณ์ถูกออกจากระบบ)
 *   reset-2fa --email <อีเมล>                    ปิดการยืนยันตัวตนสองขั้นตอนของผู้ใช้ (เครื่อง/รหัสสำรองหาย; ทุกอุปกรณ์ถูกออกจากระบบ)
 *   list-users                                    แสดงผู้ใช้ทั้งหมด (ไม่แสดงรหัสผ่าน)
 *   check-defaults                                แสดงบัญชีที่ยังใช้รหัสผ่านตั้งต้น
 *   retire-defaults                               ปิดบัญชีที่ยังใช้รหัสผ่านตั้งต้นทั้งหมด (ต้องมี admin อื่นที่ใช้งานอยู่)
 *
 * รหัสผ่านไม่รับทาง argv (ติดใน history/ps) — พิมพ์ตอนถาม หรือส่งทาง stdin ด้วย --password-stdin (สำหรับสคริปต์)
 */
import { createPool } from './db'
import { AppError } from './errors'
import { disable as disableTwoFactor } from './services/twofactor'
import { askHidden } from './lib/prompt'
import { createAdmin, findDefaultPasswordUsers, retireDefaultPasswordUsers, setPassword } from './services/accounts'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function readStdin(): Promise<string> {
  let data = ''
  for await (const chunk of process.stdin) data += chunk
  return data.replace(/\r?\n$/, '')
}

async function readPassword(confirm: boolean): Promise<string> {
  if (process.argv.includes('--password-stdin')) return readStdin()
  const pw = await askHidden('รหัสผ่านใหม่ (≥8 ตัว มีตัวอักษรและตัวเลข): ')
  if (confirm && pw !== (await askHidden('ยืนยันรหัสผ่าน: '))) throw new Error('รหัสผ่านทั้งสองครั้งไม่ตรงกัน')
  return pw
}

async function main() {
  const cmd = process.argv[2]
  const pool = createPool()
  try {
    switch (cmd) {
      case 'create-admin': {
        const email = arg('email')
        const name = arg('name')
        if (!email || !name) throw new Error('ต้องระบุ --email และ --name')
        const password = await readPassword(true)
        const u = await createAdmin(pool, { email, name, password })
        console.log(`สร้างผู้ดูแลระบบแล้ว: ${u.name} <${u.email}>`)
        const weak = await findDefaultPasswordUsers(pool)
        if (weak.length) console.log(`\nคำเตือน: ยังมี ${weak.length} บัญชีที่ใช้รหัสผ่านตั้งต้น (${weak.map((w) => w.email).join(', ')})\nเข้าสู่ระบบด้วยบัญชีใหม่ให้ได้ก่อน แล้วรัน: node dist/cli.js retire-defaults`)
        break
      }
      case 'set-password': {
        const email = arg('email')
        if (!email) throw new Error('ต้องระบุ --email')
        const password = await readPassword(true)
        const u = await setPassword(pool, { email, password })
        console.log(`ตั้งรหัสผ่านใหม่ให้ ${u.email} แล้ว — ทุกอุปกรณ์ที่ล็อกอินอยู่ถูกออกจากระบบ`)
        break
      }
      case 'reset-2fa': {
        const email = arg('email')
        if (!email) throw new Error('ต้องระบุ --email')
        const u = await pool.query('select id from users where lower(email) = lower($1)', [email])
        if (!u.rows[0]) throw new Error('ไม่พบผู้ใช้')
        const r = await disableTwoFactor(pool, u.rows[0].id)
        console.log(r?.wasEnabled ? `ปิด 2FA ของ ${email} แล้ว — ทุกอุปกรณ์ที่ล็อกอินอยู่ถูกออกจากระบบ ผู้ใช้ตั้ง 2FA ใหม่เองได้ที่หน้าบัญชีของฉัน` : `${email} ไม่ได้เปิดใช้ 2FA`)
        break
      }
      case 'list-users': {
        const { rows } = await pool.query(`select email, name, role::text as role, status::text as status, last_login_at, totp_enabled_at is not null as tfa from users order by (role = 'admin') desc, email`)
        for (const r of rows) console.log(`${r.status.padEnd(8)} ${r.role.padEnd(8)} ${r.email}  (${r.name})${r.tfa ? '  · 2FA' : ''}${r.last_login_at ? '' : '  · ยังไม่เคยเข้าใช้'}`)
        break
      }
      case 'check-defaults': {
        const weak = await findDefaultPasswordUsers(pool)
        if (!weak.length) console.log('ไม่มีบัญชีที่ใช้รหัสผ่านตั้งต้น')
        else {
          console.log('บัญชีที่ยังใช้รหัสผ่านตั้งต้น:')
          for (const u of weak) console.log(`  ${u.role.padEnd(8)} ${u.email}`)
          process.exitCode = 2
        }
        break
      }
      case 'retire-defaults': {
        const closed = await retireDefaultPasswordUsers(pool)
        if (!closed.length) console.log('ไม่มีบัญชีที่ใช้รหัสผ่านตั้งต้น — ไม่ต้องปิดอะไร')
        else {
          console.log(`ปิดบัญชีที่ใช้รหัสผ่านตั้งต้นแล้ว ${closed.length} บัญชี:`)
          for (const u of closed) console.log(`  ${u.role.padEnd(8)} ${u.email}`)
          console.log('(เปิดกลับได้ที่ตั้งค่า > ผู้ใช้และสิทธิ์ แต่ต้องเปลี่ยนรหัสผ่านก่อนใช้งาน)')
        }
        break
      }
      default:
        console.log('คำสั่ง: create-admin | set-password | reset-2fa | list-users | check-defaults | retire-defaults\nดูรายละเอียดที่หัวไฟล์ api/src/cli.ts')
        process.exitCode = cmd ? 1 : 0
    }
  } finally {
    await pool.end()
  }
}

main().catch((e) => {
  const extra = e instanceof AppError && e.fields ? Object.values(e.fields).filter((v) => v !== e.message) : []
  const msg = e instanceof Error ? [e.message, ...extra].join(' · ') : String(e)
  console.error(`ผิดพลาด: ${msg}`)
  process.exit(1)
})
