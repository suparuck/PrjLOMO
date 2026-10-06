import readline from 'node:readline'

interface Streams {
  input: NodeJS.ReadableStream & { isTTY?: boolean }
  output: NodeJS.WritableStream
}

/**
 * ถามค่าโดยไม่แสดงตัวอักษรที่พิมพ์ (รหัสผ่าน) — แสดงเฉพาะคำถามและการขึ้นบรรทัดใหม่
 * ต้องเป็น TTY (docker compose exec ปกติมี TTY ถ้าไม่ใส่ -T) ไม่เช่นนั้นให้ส่งทาง stdin ด้วย --password-stdin
 */
export function askHidden(question: string, io: Streams = { input: process.stdin, output: process.stdout }): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!io.input.isTTY) {
      return reject(new Error('ไม่มี TTY สำหรับพิมพ์รหัสผ่าน — ใช้ docker compose exec (ไม่ใส่ -T) หรือส่งรหัสทาง stdin ด้วย --password-stdin'))
    }
    const rl = readline.createInterface({ input: io.input, output: io.output, terminal: true })
    // readline เขียนทุกตัวอักษรที่พิมพ์ลงเอาต์พุตผ่านเมธอดนี้ — ดักไว้ ไม่ให้แสดงจนกว่าจะถามคำถามเสร็จ
    const w = rl as unknown as { _writeToOutput: (s: string) => void }
    let muted = false
    const original = w._writeToOutput.bind(rl)
    w._writeToOutput = (s: string) => {
      if (!muted) original(s)
      else if (s.includes('\n') || s.includes('\r')) io.output.write('\n')
    }
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer)
    })
    muted = true
  })
}
