<#
.SYNOPSIS
  ตรวจว่าไฟล์สำรองที่ดึงมา "ถอดรหัสและอ่านกลับได้จริง" ด้วยกุญแจส่วนตัว (ไฟล์สำรองที่ไม่เคยทดสอบถอดรหัสยังไม่ถือว่าสำรองแล้ว)

.DESCRIPTION
  ใช้ Docker + image ev-monitor-backup (มี age และ pg_restore) ถอดรหัสไฟล์ล่าสุด (หรือไฟล์ที่ระบุด้วย -File) ในหน่วยความจำของ container
  แล้วนับตารางข้อมูลด้วย pg_restore --list ไม่เขียนอะไรลงดิสก์เครื่องนี้ กุญแจส่วนตัวถูกเมาท์แบบอ่านอย่างเดียวชั่วคราว
  ออกด้วยรหัส 0 = ผ่าน, 1 = ไม่ผ่าน
#>
param(
  [string]$Dest = 'C:\SC\backups-offsite',
  [string]$Identity = 'C:\SC\age-evmonitor.key',
  [string]$File = '',
  [string]$Image = 'ev-monitor-backup:latest'
)
$ErrorActionPreference = 'Stop'
if (-not $File) { $File = (Get-ChildItem $Dest -Filter 'evmonitor-*.dump.age' | Sort-Object Name | Select-Object -Last 1).Name }
if (-not $File) { Write-Host 'ไม่พบไฟล์ .dump.age ในโฟลเดอร์ปลายทาง'; exit 1 }
if (-not (Test-Path $Identity)) { Write-Host "ไม่พบกุญแจส่วนตัว: $Identity"; exit 1 }
Write-Host "ตรวจ: $File"
# คำสั่งส่งผ่านตัวแปรสภาพแวดล้อม + ไม่ใช้เครื่องหมาย " ในอาร์กิวเมนต์ (Windows PowerShell 5.1 ตัด " ออกเมื่อเรียกโปรแกรมภายนอก)
$cmd = "age -d -i /id /in/$File | pg_restore --list | grep -c 'TABLE DATA'"
$env:MSYS_NO_PATHCONV = '1'
$tables = & docker run --rm -e "CMD=$cmd" -v "${Dest}:/in:ro" -v "${Identity}:/id:ro" --entrypoint sh $Image -c 'eval $CMD' 2>&1
if ($LASTEXITCODE -ne 0 -or [int]$tables -lt 5) { Write-Host "ไม่ผ่าน: ถอดรหัส/อ่านไม่ได้ หรือตารางน้อยผิดปกติ ($tables)"; exit 1 }
Write-Host "ผ่าน: ถอดรหัสและอ่านกลับได้ ($tables ตารางข้อมูล)"
exit 0
