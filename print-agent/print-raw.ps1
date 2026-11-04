# Raw ESC/POS baytlarni Windows print spooler orqali printerga yuboradi.
# print-agent agent.js tomonidan chaqiriladi:
#   powershell -NoProfile -ExecutionPolicy Bypass -File print-raw.ps1 -PrinterName "..." -FilePath "....bin"
#
# Chiqish kodlari: 0 = PRINTED, 3 = printer nomi topilmadi, 4 = yozish xatosi,
#                  5 = bo'sh fayl, 6 = boshqa xato, 7 = navbatda tiqilib qoldi (STUCK)
#
# MUHIM: WritePrinter muvaffaqiyatli bo'lishi "qog'oz chiqdi" degani EMAS — u faqat
# spooler ishni qabul qilganini bildiradi. Printer o'chgan yoki qog'oz tugagan bo'lsa
# ish navbatda qotib qoladi va undan keyingi BARCHA cheklar ham chiqmaydi — "2 chek
# chiqdi, keyin hech narsa chiqmayapti" muammosi aynan shu. Shuning uchun:
#   1) yuborishdan oldin bizning eski urinishlarimiz va xato holatdagi ishlar tozalanadi;
#   2) yuborilgandan keyin ish navbatdan chiqishi (printer haqiqatan olgani) kutiladi;
#   3) chiqmasa ish o'chiriladi va STUCK qaytariladi — agent qayta urinadi.
#
# Navbat Win32_PrintJob (CIM) orqali tekshiriladi: PrintManagement moduli har safar
# ~4 soniya yuklanadi, CIM esa ~1 soniya — chek tezroq chiqadi.
param(
  [string]$PrinterName,
  [string]$FilePath,
  [int]$WaitSeconds = 25,    # ish navbatdan chiqishini kutish vaqti
  [int]$StuckSeconds = 45,   # shu vaqtdan oshgan begona ish "tiqilgan" hisoblanadi
  [switch]$NoClean           # navbatni tozalashni o'chirish
)
$ErrorActionPreference = 'Stop'
$DOC_NAME = 'POS Chek'

$canCheck = $false
try { if (Get-Command Get-CimInstance -ErrorAction Stop) { $canCheck = $true } } catch { $canCheck = $false }

function Get-Jobs {
  if (-not $canCheck) { return @() }
  try {
    return @(Get-CimInstance -ClassName Win32_PrintJob -ErrorAction Stop |
      Where-Object { ($_.Name -replace ',\s*\d+$', '') -eq $PrinterName })
  } catch { return @() }
}
function Get-OwnJobs {
  if (-not $canCheck) { return @() }
  return @(Get-Jobs | Where-Object { $_.Document -eq $DOC_NAME })
}
function Get-JobAge($job) {
  try {
    $t = $job.TimeSubmitted
    if ($t -is [datetime]) { return ((Get-Date) - $t).TotalSeconds }
    $s = [string]$t
    if ($s -match '^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})') {
      $d = [datetime]::ParseExact($Matches[1] + $Matches[2] + $Matches[3] + $Matches[4] + $Matches[5] + $Matches[6], 'yyyyMMddHHmmss', $null)
      return ((Get-Date) - $d).TotalSeconds
    }
  } catch {}
  return 0
}
function Remove-JobSafe($job) {
  try { Remove-CimInstance -InputObject $job -ErrorAction Stop; return $true } catch { return $false }
}

# Bizning eski urinishlarimizdan qolgan ishlarni o'chiradi (tiqilib qolgan chek)
function Clear-OwnJobs {
  if (-not $canCheck -or $NoClean) { return 0 }
  $n = 0
  foreach ($j in Get-OwnJobs) { if (Remove-JobSafe $j) { $n++ } }
  return $n
}
# Xato holatidagi yoki juda uzoq turgan (begona) ishlarni o'chiradi
function Clear-BadJobs([int]$minAge) {
  if (-not $canCheck -or $NoClean) { return 0 }
  $n = 0
  foreach ($j in Get-Jobs) {
    if ($j.Document -eq $DOC_NAME) { continue }
    $bad = $false
    try {
      if ($j.JobStatus -match 'Error|Offline|Blocked|PaperOut|UserIntervention|Paused|Deleted' -or
          $j.Status -match 'Error|Offline|Blocked|PaperOut|UserIntervention|Paused|Deleted') { $bad = $true }
      elseif ($minAge -gt 0 -and (Get-JobAge $j) -gt $minAge) { $bad = $true }
    } catch {}
    if ($bad -and (Remove-JobSafe $j)) { $n++ }
  }
  return $n
}

try {
  $bytes = [System.IO.File]::ReadAllBytes($FilePath)
} catch {
  Write-Output ('EXC ' + $_.Exception.Message)
  exit 6
}
if (-not $bytes -or $bytes.Length -eq 0) { Write-Output 'EMPTYFILE'; exit 5 }

# Eski tiqilgan ishlarni tozalaymiz — aks holda yangi chek ham navbatda qotib qoladi
$cleaned = (Clear-OwnJobs) + (Clear-BadJobs $StuckSeconds)
if ($cleaned -gt 0) { Write-Output ('CLEANED ' + $cleaned) }

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class RawPrinterHelper {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
  public struct DOCINFOA {
    [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
  }
  [DllImport("winspool.Drv", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);
  [DllImport("winspool.Drv", SetLastError = true)]
  public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", SetLastError = true)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, int Level, [In] ref DOCINFOA di);
  [DllImport("winspool.Drv", SetLastError = true)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", SetLastError = true)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", SetLastError = true)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", SetLastError = true)]
  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);
  public static int Send(string printer, byte[] data) {
    IntPtr h;
    if (!OpenPrinter(printer, out h, IntPtr.Zero)) return 3;
    try {
      var di = new DOCINFOA { pDocName = "POS Chek", pDataType = "RAW" };
      if (!StartDocPrinter(h, 1, ref di)) return 4;
      if (!StartPagePrinter(h)) { EndDocPrinter(h); return 4; }
      IntPtr p = Marshal.AllocHGlobal(data.Length);
      int written;
      bool ok;
      try {
        Marshal.Copy(data, 0, p, data.Length);
        ok = WritePrinter(h, p, data.Length, out written) && written == data.Length;
      } finally { Marshal.FreeHGlobal(p); }
      EndPagePrinter(h);
      EndDocPrinter(h);
      return ok ? 0 : 4;
    } finally { ClosePrinter(h); }
  }
}
"@

$r = [RawPrinterHelper]::Send($PrinterName, $bytes)
if ($r -eq 3) { Write-Output ('OPENFAIL ' + $PrinterName); exit 3 }
if ($r -eq 4) { Write-Output 'WRITEFAIL'; exit 4 }

# Ishni spooler qabul qildi. Endi bizning ish navbatdan chiqishini kutamiz —
# ya'ni printer baytlarni haqiqatan oldi. Chiqmasa: tiqilgan, tozalaymiz va
# STUCK qaytaramiz (agent qayta urinadi, chek yo'qolmaydi).
if ($canCheck) {
  Start-Sleep -Milliseconds 700
  $deadline = (Get-Date).AddSeconds($WaitSeconds)
  while ($true) {
    if ((Get-OwnJobs).Count -eq 0) { Write-Output 'PRINTED'; exit 0 }
    if ((Get-Date) -ge $deadline) { break }
    Start-Sleep -Milliseconds 500
  }
  $left = Clear-OwnJobs
  Write-Output ('STUCK ' + $left)
  exit 7
}

Write-Output 'PRINTED'
exit 0
