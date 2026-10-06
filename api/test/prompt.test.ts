import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { PassThrough } from 'node:stream'
import { askHidden } from '../src/lib/prompt'

/** TTY จำลอง: อินพุตที่พิมพ์เป็นตัวอักษร และเอาต์พุตที่จับข้อความไว้ */
function fakeTty() {
  const input = Object.assign(new PassThrough(), { isTTY: true, setRawMode: () => undefined })
  const output = Object.assign(new PassThrough(), { isTTY: true, columns: 80 })
  let out = ''
  output.on('data', (d) => (out += d.toString()))
  return { input, output, text: () => out }
}

describe('askHidden (ถามรหัสผ่านโดยไม่แสดงตัวอักษร)', () => {
  it('คืนค่าที่พิมพ์ แต่ไม่ปรากฏรหัสผ่านในเอาต์พุต (แสดงเฉพาะคำถามกับขึ้นบรรทัดใหม่)', async () => {
    const t = fakeTty()
    const p = askHidden('รหัสผ่านใหม่: ', t)
    t.input.write('Sup3r-Secret-Pass\n')
    assert.equal(await p, 'Sup3r-Secret-Pass')
    assert.ok(t.text().includes('รหัสผ่านใหม่: '), 'แสดงคำถาม')
    assert.ok(!t.text().includes('Sup3r'), `เอาต์พุตต้องไม่มีรหัสผ่าน: ${JSON.stringify(t.text())}`)
  })

  it('พิมพ์ทีละตัวอักษรและลบถอยหลัง (backspace) ก็ไม่รั่ว และได้ค่าที่แก้แล้ว', async () => {
    const t = fakeTty()
    const p = askHidden('รหัสผ่าน: ', t)
    for (const ch of 'abcX') t.input.write(ch)
    t.input.write('\u007f') // backspace ลบ X
    for (const ch of 'Z9\n') t.input.write(ch)
    assert.equal(await p, 'abcZ9')
    assert.ok(!/abc|Z9/.test(t.text()), `เอาต์พุตต้องไม่มีตัวอักษรที่พิมพ์: ${JSON.stringify(t.text())}`)
  })

  it('ไม่มี TTY → ปฏิเสธพร้อมวิธีแก้ (ไม่ค้างรอ)', async () => {
    const input = Object.assign(new PassThrough(), { isTTY: false })
    await assert.rejects(() => askHidden('x: ', { input, output: new PassThrough() }), /--password-stdin/)
  })
})
