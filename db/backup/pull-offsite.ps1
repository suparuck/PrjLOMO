<#
.SYNOPSIS
  ดึงไฟล์สำรองที่เข้ารหัสแล้ว (*.dump.age) จากเซิร์ฟเวอร์ลงเครื่องนี้ — รันเองหรือตั้งเวลาด้วย Task Scheduler (ดู db/README.md)

.DESCRIPTION
  เซิร์ฟเวอร์ (db/backup/offsite.sh) เข้ารหัสด้วยกุญแจสาธารณะ age แล้วพักไว้ที่ /srv/evmonitor-offsite
  สคริปต์นี้เชื่อมต่อด้วยบัญชี evpull ซึ่ง "อ่านอย่างเดียว" (SFTP -R บังคับที่ authorized_keys, ไม่มี shell/sudo)
  ดึงเฉพาะไฟล์ที่ยังไม่มีในเครื่อง · ตรวจขนาดตรงกับต้นทาง และหัวไฟล์ต้องเป็น age ก่อนเปลี่ยนชื่อเป็นไฟล์จริง
  ไม่ลบไฟล์ใดในเครื่องนี้ (จัดการพื้นที่เอง) · กุญแจถอดรหัสส่วนตัวไม่เกี่ยวข้องกับสคริปต์นี้ (ใช้ตอนตรวจ/กู้เท่านั้น)

  ออกด้วยรหัส 0 = สำเร็จ, 1 = มีข้อผิดพลาด, 2 = สำเร็จแต่เตือน (ไฟล์ล่าสุดที่เซิร์ฟเวอร์เก่าเกิน MaxAgeHours — การสำรองฝั่งเซิร์ฟเวอร์อาจหยุด)
#>
param(
  [string]$Server = 'monitor.lomo2u.com',
  [string]$User = 'evpull',
  [string]$Key = 'C:\SC\id_evpull',
  [string]$Dest = 'C:\SC\backups-offsite',
  [string]$Remote = '/srv/evmonitor-offsite',
  [int]$MaxAgeHours = 30
)
$ErrorActionPreference = 'Stop'
$log = Join-Path $Dest 'pull.log'
New-Item -ItemType Directory -Force -Path $Dest | Out-Null
function Log($m) { $line = '{0} {1}' -f (Get-Date -Format 's'), $m; Write-Host $line; Add-Content -Path $log -Value $line -Encoding utf8 }

# StrictHostKeyChecking=yes: ต้องมี host key ใน known_hosts แล้วเท่านั้น (กันการเชื่อมต่อครั้งแรกถูกสวมรอยโดยไม่รู้ตัว)
$sftpOpts = @('-i', $Key, '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=20', '-q')

# รัน sftp ด้วยไฟล์คำสั่งแบบ LF (การส่งผ่าน pipe ของ PowerShell 5.1 ใส่ CRLF ทำให้ path มีตัว CR ต่อท้ายแล้วเชื่อมต่อล้มเหลว)
function Invoke-Sftp([string[]]$Commands) {
  $tmp = [System.IO.Path]::GetTempFileName()
  try {
    [System.IO.File]::WriteAllText($tmp, (($Commands -join "`n") + "`n"), (New-Object System.Text.UTF8Encoding($false)))
    $out = & sftp @sftpOpts -b $tmp "$User@$Server" 2>&1
    return [pscustomobject]@{ Code = $LASTEXITCODE; Out = @($out | ForEach-Object { "$_" }) }
  } finally { Remove-Item $tmp -Force -ErrorAction SilentlyContinue }
}

try {
  # 1) รายการไฟล์ที่ต้นทาง
  $r = Invoke-Sftp @("ls -l $Remote")
  if ($r.Code -ne 0) { throw "เชื่อมต่อ/อ่านรายการไม่สำเร็จ: $($r.Out -join ' ')" }
  $remoteFiles = @{}
  foreach ($l in $r.Out) {
    # รูปแบบที่ sftp ให้มา: -rw-r--r--    ? root     root        63833 Oct 13 16:52 /srv/evmonitor-offsite/evmonitor-….dump.age
    if ($l -match '^-\S+\s+\S+\s+\S+\s+\S+\s+(\d+)\s+\w+\s+\d+\s+[\d:]+\s+(?:\S*/)?(evmonitor-\d{8}-\d{6}\.dump\.age)\s*$') { $remoteFiles[$Matches[2]] = [int64]$Matches[1] }
  }
  if ($remoteFiles.Count -eq 0) { throw "ไม่พบไฟล์สำรองที่ต้นทาง ($Remote)" }

  # 2) เลือกที่ต้องดึง: ยังไม่มี หรือขนาดต่างจากต้นทาง
  $need = @($remoteFiles.Keys | Where-Object {
      $p = Join-Path $Dest $_
      -not (Test-Path $p) -or (Get-Item $p).Length -ne $remoteFiles[$_]
    } | Sort-Object)
  Log "ต้นทางมี $($remoteFiles.Count) ไฟล์, ต้องดึงเพิ่ม $($need.Count)"

  if ($need.Count -gt 0) {
    $destFwd = $Dest -replace '\\', '/'
    $g = Invoke-Sftp @($need | ForEach-Object { "get $Remote/$_ $destFwd/$_.part" })
    if ($g.Code -ne 0) { throw "ดึงไฟล์ไม่สำเร็จ: $($g.Out -join ' ')" }
    foreach ($n in $need) {
      $part = Join-Path $Dest "$n.part"
      $final = Join-Path $Dest $n
      if (-not (Test-Path $part)) { throw "ไม่พบไฟล์ที่ดึงมา: $n" }
      $size = (Get-Item $part).Length
      if ($size -ne $remoteFiles[$n]) { Remove-Item $part -Force; throw "ขนาดไม่ตรง $n (ได้ $size ต้นทาง $($remoteFiles[$n]))" }
      $head = [System.Text.Encoding]::ASCII.GetString([System.IO.File]::ReadAllBytes($part)[0..20])
      if (-not $head.StartsWith('age-encryption.org/v1')) { Remove-Item $part -Force; throw "$n ไม่ใช่ไฟล์ age (หัวไฟล์ผิด) — ไม่รับไฟล์นี้" }
      Move-Item -Force $part $final
      Log "ได้รับ $n ($size ไบต์)"
    }
  }

  # 3) เตือนถ้าฝั่งเซิร์ฟเวอร์ไม่สร้างไฟล์ใหม่มานาน
  $newest = ($remoteFiles.Keys | Sort-Object | Select-Object -Last 1)
  $stamp = [datetime]::ParseExact(($newest -replace '^evmonitor-(\d{8}-\d{6})\.dump\.age$', '$1'), 'yyyyMMdd-HHmmss', $null)  # เวลา UTC ตามชื่อไฟล์
  $ageH = ((Get-Date).ToUniversalTime() - $stamp).TotalHours
  if ($ageH -gt $MaxAgeHours) { Log ("คำเตือน: ไฟล์ล่าสุด $newest เก่า {0:N1} ชั่วโมง — ตรวจ service backup บนเซิร์ฟเวอร์" -f $ageH); exit 2 }
  Log ("เสร็จสิ้น: ไฟล์ล่าสุด $newest (อายุ {0:N1} ชั่วโมง)" -f $ageH)
  exit 0
} catch {
  Log "ผิดพลาด: $($_.Exception.Message)"
  exit 1
}
