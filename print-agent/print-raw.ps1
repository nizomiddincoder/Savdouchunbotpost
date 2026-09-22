# Raw ESC/POS baytlarni Windows print spooler orqali printerga yuboradi.
# print-agent agent.js tomonidan chaqiriladi:
#   powershell -NoProfile -ExecutionPolicy Bypass -File print-raw.ps1 -PrinterName "..." -FilePath "....bin"
# Chiqish kodlari: 0 = PRINTED, 3 = printer nomi topilmadi, 4 = yozish xatosi, 5 = bo'sh fayl, 6 = boshqa xato
param([string]$PrinterName, [string]$FilePath)
$ErrorActionPreference = 'Stop'
try {
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
      if (!StartPagePrinter(h)) return 4;
      IntPtr p = Marshal.AllocHGlobal(data.Length);
      try {
        Marshal.Copy(data, 0, p, data.Length);
        int written;
        if (!WritePrinter(h, p, data.Length, out written) || written != data.Length) return 4;
      } finally { Marshal.FreeHGlobal(p); }
      EndPagePrinter(h);
      EndDocPrinter(h);
      return 0;
    } finally { ClosePrinter(h); }
  }
}
"@
  $bytes = [System.IO.File]::ReadAllBytes($FilePath)
  if (-not $bytes -or $bytes.Length -eq 0) { Write-Output 'EMPTYFILE'; exit 5 }
  $r = [RawPrinterHelper]::Send($PrinterName, $bytes)
  if ($r -eq 0) { Write-Output 'PRINTED'; exit 0 }
  elseif ($r -eq 3) { Write-Output ('OPENFAIL ' + $PrinterName); exit 3 }
  else { Write-Output 'WRITEFAIL'; exit 4 }
} catch {
  Write-Output ('EXC ' + $_.Exception.Message)
  exit 6
}
