param([Parameter(Mandatory=$true)][int]$ParentPid)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Runtime.WindowsRuntime
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class HudWindow {
  public delegate bool EnumProc(IntPtr hwnd, IntPtr lParam);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc callback, IntPtr lParam);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr hwnd);
  [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr hwnd, out RECT rect);
  [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr hwnd, ref POINT point);
  [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  public static void UsePhysicalPixels() {
    try { if (SetProcessDpiAwarenessContext(new IntPtr(-4))) return; } catch (EntryPointNotFoundException) {}
    SetProcessDPIAware();
  }
  public static bool IsForeground(int processId) { uint pid; GetWindowThreadProcessId(GetForegroundWindow(), out pid); return pid == processId; }
  public static bool TryFind(int processId, out RECT best) {
    RECT selected = new RECT(); bool found = false; long bestArea = 0;
    EnumWindows((hwnd, param) => {
      uint pid; GetWindowThreadProcessId(hwnd, out pid);
      if (pid != processId || !IsWindowVisible(hwnd) || IsIconic(hwnd)) return true;
      RECT rect; if (!GetClientRect(hwnd, out rect)) return true;
      int width = rect.Right - rect.Left, height = rect.Bottom - rect.Top;
      long area = (long)width * height;
      POINT start = new POINT();
      if (width >= 1280 && height >= 720 && area > bestArea && ClientToScreen(hwnd, ref start)) {
        selected = new RECT { Left = start.X, Top = start.Y, Right = start.X + width, Bottom = start.Y + height };
        bestArea = area; found = true;
      }
      return true;
    }, IntPtr.Zero);
    best = selected;
    return found;
  }
}
'@
[HudWindow]::UsePhysicalPixels()
$null = [Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder,Windows.Foundation,ContentType=WindowsRuntime]
$null = [Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]

function Await-WinRt($Operation, [Type]$ResultType) {
  $method = [System.WindowsRuntimeSystemExtensions].GetMethods() |
    Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 } |
    Select-Object -First 1
  $task = $method.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
  $task.Wait()
  return $task.Result
}

function Read-OcrWords([string]$ImagePath, $Engine) {
  $file = Await-WinRt ([Windows.Storage.StorageFile]::GetFileFromPathAsync($ImagePath)) ([Windows.Storage.StorageFile])
  $stream = Await-WinRt ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  try {
    $decoder = Await-WinRt ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bitmap = Await-WinRt ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    try {
      $result = Await-WinRt ($Engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
      foreach ($line in $result.Lines) { foreach ($word in $line.Words) { $word } }
    } finally { if ($bitmap) { $bitmap.Dispose() } }
  } finally { if ($stream) { $stream.Dispose() } }
}

$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
$capturePath = Join-Path $env:TEMP "lol-hud-gold-$ParentPid.png"
$csCapturePath = Join-Path $env:TEMP "lol-hud-cs-$ParentPid.png"
$digitCapturePath = Join-Path $env:TEMP "lol-hud-digits-$ParentPid.png"
try {
  while (Get-Process -Id $ParentPid -ErrorAction SilentlyContinue) {
    $bitmap=$null; $csBitmap=$null; $digitBitmap=$null
    try {
      $game = Get-Process -Name 'League of Legends' -ErrorAction SilentlyContinue | Select-Object -First 1
      if (-not $game) {
        [Console]::Out.WriteLine(([pscustomobject]@{ok=$false;reason='no-game';questIconCapture='no-game'} | ConvertTo-Json -Compress))
        Start-Sleep -Milliseconds 1000
        continue
      }
      $rect = New-Object HudWindow+RECT
      if (-not [HudWindow]::TryFind($game.Id,[ref]$rect)) {
        [Console]::Out.WriteLine(([pscustomobject]@{ok=$false;reason='no-window';questIconCapture='not-visible'} | ConvertTo-Json -Compress))
        Start-Sleep -Milliseconds 1000
        continue
      }
      $gameBounds = [Drawing.Rectangle]::new($rect.Left,$rect.Top,($rect.Right-$rect.Left),($rect.Bottom-$rect.Top))
      $monitor = [Windows.Forms.Screen]::FromRectangle($gameBounds)
      if (-not $monitor.Bounds.Contains($gameBounds)) {
        [Console]::Out.WriteLine(([pscustomobject]@{ok=$false;reason='off-screen';questIconCapture='not-visible'} | ConvertTo-Json -Compress))
        Start-Sleep -Milliseconds 1000
        continue
      }
      $aspect=$gameBounds.Width/[double]$gameBounds.Height
      if ([math]::Abs($aspect-(16/9)) -gt 0.03) {
        [Console]::Out.WriteLine(([pscustomobject]@{ok=$false;width=$gameBounds.Width;height=$gameBounds.Height;reason='aspect'} | ConvertTo-Json -Compress))
        Start-Sleep -Milliseconds 1000
        continue
      }
      $scaleX=$gameBounds.Width/1920.0; $scaleY=$gameBounds.Height/1080.0
      $capturedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
      $bitmap = New-Object Drawing.Bitmap $gameBounds.Width,$gameBounds.Height
      $graphics = [Drawing.Graphics]::FromImage($bitmap)
      try { $graphics.CopyFromScreen($gameBounds.Location,[Drawing.Point]::Empty,$gameBounds.Size) } finally { $graphics.Dispose() }
      $gameBounds = [Drawing.Rectangle]::new(0,0,$bitmap.Width,$bitmap.Height)
      $bitmap.Save($capturePath,[Drawing.Imaging.ImageFormat]::Png)
      $cropLeft=[int][math]::Round($gameBounds.Left+860*$scaleX)
      $cropTop=[int][math]::Round($gameBounds.Top+850*$scaleY)
      $cropWidth=[int][math]::Round(220*$scaleX)
      $cropHeight=[int][math]::Round(225*$scaleY)
      $csBitmap=New-Object Drawing.Bitmap 660,675
      $csGraphics=[Drawing.Graphics]::FromImage($csBitmap)
      try {
        $csGraphics.InterpolationMode=[Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $csGraphics.DrawImage($bitmap,[Drawing.Rectangle]::new(0,0,660,675),[Drawing.Rectangle]::new($cropLeft,$cropTop,$cropWidth,$cropHeight),[Drawing.GraphicsUnit]::Pixel)
      } finally { $csGraphics.Dispose() }
      $csBitmap.Save($csCapturePath,[Drawing.Imaging.ImageFormat]::Png)
      $csBitmap.Dispose(); $csBitmap=$null
      $digitBitmap=New-Object Drawing.Bitmap 350,180
      $digitGraphics=[Drawing.Graphics]::FromImage($digitBitmap)
      try { $digitGraphics.Clear([Drawing.Color]::Black) } finally { $digitGraphics.Dispose() }
      $samples=@(@{x=600;color='blue'},@{x=670;color='blue'},@{x=1192;color='red'},@{x=1257;color='red'})
      for($n=0;$n -lt 4;$n++){
        $sample=$samples[$n]
        for($dy=0;$dy -lt 26;$dy++){
          for($dx=0;$dx -lt 16;$dx++){
            $screenX=[int][math]::Round($gameBounds.Left+($sample.x-8+$dx)*$scaleX)
            $screenY=[int][math]::Round($gameBounds.Top+(14+$dy)*$scaleY)
            $pixel=$bitmap.GetPixel($screenX,$screenY)
            $visible=if($sample.color -eq 'blue'){$pixel.B -gt $pixel.R+22 -and $pixel.G -gt $pixel.R+10}else{$pixel.R -gt $pixel.G+15 -and $pixel.R -gt $pixel.B+10}
            if($visible){for($yy=0;$yy -lt 5;$yy++){for($xx=0;$xx -lt 5;$xx++){$digitBitmap.SetPixel(20+$n*80+$dx*5+$xx,20+$dy*5+$yy,[Drawing.Color]::White)}}}
          }
        }
      }
      $digitBitmap.Save($digitCapturePath,[Drawing.Imaging.ImageFormat]::Png)
      $digitBitmap.Dispose(); $digitBitmap=$null
      $questIcons=@{blue=@();red=@()}
      $visibleBars=0
      if($game -and -not [HudWindow]::IsForeground($game.Id)){
        foreach($barX in @(31,1844)){for($row=0;$row -lt 5;$row++){
          $foundGreen=$false
          for($dx=0;$dx -lt 36 -and -not $foundGreen;$dx+=3){for($dy=0;$dy -lt 7;$dy+=2){
            $px=[int][math]::Round($gameBounds.Left+($barX+$dx)*$scaleX);$py=[int][math]::Round($gameBounds.Top+(204+$row*103+$dy)*$scaleY)
            if($px -ge 0 -and $py -ge 0 -and $px -lt $bitmap.Width -and $py -lt $bitmap.Height){$c=$bitmap.GetPixel($px,$py);if($c.G -gt 80 -and $c.G -gt $c.R*1.2 -and $c.G -gt $c.B*1.05){$foundGreen=$true;break}}
          }}
          if($foundGreen){$visibleBars++}
        }}
      }
      $questIconCapture=if(-not $game){'no-game'}elseif([HudWindow]::IsForeground($game.Id) -or $visibleBars -ge 2){'active'}else{'not-visible'}
      if($questIconCapture -eq 'active'){
        foreach($side in @('blue','red')){
          $startX=if($side -eq 'blue'){8}else{1898}
          for($row=0;$row -lt 5;$row++){
            $bytes=New-Object byte[] 192; $n=0
            for($dy=0;$dy -lt 8;$dy++){for($dx=0;$dx -lt 8;$dx++){
              $px=[int][math]::Round($gameBounds.Left+($startX+$dx*1.5)*$scaleX)
              $py=[int][math]::Round($gameBounds.Top+(205+$row*103+$dy*1.5)*$scaleY)
              if($px -ge 0 -and $py -ge 0 -and $px -lt $bitmap.Width -and $py -lt $bitmap.Height){$pixel=$bitmap.GetPixel($px,$py);$bytes[$n]=$pixel.R;$bytes[$n+1]=$pixel.G;$bytes[$n+2]=$pixel.B};$n+=3
            }}
            $questIcons[$side]+= [Convert]::ToBase64String($bytes)
          }
        }
      }
      $bitmap.Dispose(); $bitmap=$null
      $blue = @($null,$null,$null,$null,$null)
      $red = @($null,$null,$null,$null,$null)
      $blueCs = @($null,$null,$null,$null,$null)
      $redCs = @($null,$null,$null,$null,$null)
      $blueCsZoom = @($null,$null,$null,$null,$null)
      $redCsZoom = @($null,$null,$null,$null,$null)
      $blueKda = @($null,$null,$null,$null,$null)
      $redKda = @($null,$null,$null,$null,$null)
      $blueGrubs=$null; $redGrubs=$null
      $blueParts=@{}; $redParts=@{}
      $blueCsParts=@{}; $redCsParts=@{}
      $blueKdaParts=@{}; $redKdaParts=@{}
      $blueCsZoomParts=@{}; $redCsZoomParts=@{}
      0..4 | ForEach-Object {
        $blueParts[$_]=New-Object System.Collections.ArrayList
        $redParts[$_]=New-Object System.Collections.ArrayList
        $blueCsParts[$_]=New-Object System.Collections.ArrayList
        $redCsParts[$_]=New-Object System.Collections.ArrayList
        $blueKdaParts[$_]=New-Object System.Collections.ArrayList
        $redKdaParts[$_]=New-Object System.Collections.ArrayList
        $blueCsZoomParts[$_]=New-Object System.Collections.ArrayList
        $redCsZoomParts[$_]=New-Object System.Collections.ArrayList
      }
      $words = Read-OcrWords $capturePath $engine
      foreach ($word in $words) {
        $x=([double]$word.BoundingRect.X-$gameBounds.Left)/$scaleX; $y=([double]$word.BoundingRect.Y-$gameBounds.Top)/$scaleY; $h=[double]$word.BoundingRect.Height/$scaleY
        $part=[pscustomobject]@{x=$x;text=($word.Text -replace '\s','')}
        if ($y -lt 850 -or $y -gt 1075) { continue }
        $row=[int][math]::Round((($y+$h/2)-875)/44)
        if ($row -lt 0 -or $row -gt 4) { continue }
        if ([math]::Abs(($y+$h/2)-(875+44*$row)) -gt 15) { continue }
        if ($x -ge 650 -and $x -le 790) { [void]$blueParts[$row].Add($part) }
        elseif ($x -ge 1140 -and $x -le 1280) { [void]$redParts[$row].Add($part) }
        if ($x -ge 860 -and $x -le 930) { [void]$blueCsParts[$row].Add($part) }
        elseif ($x -ge 1000 -and $x -le 1070) { [void]$redCsParts[$row].Add($part) }
        if ($x -ge 790 -and $x -lt 860) { [void]$blueKdaParts[$row].Add($part) }
        elseif ($x -ge 1050 -and $x -lt 1138) { [void]$redKdaParts[$row].Add($part) }
      }
      $digitWords=Read-OcrWords $digitCapturePath $engine
      $digitText=(($digitWords | Sort-Object {$_.BoundingRect.X} | ForEach-Object {$_.Text}) -join '') -replace '\s',''
      if($digitText -match '^\d{4}$'){
        $blueGrubs=[int][string]$digitText[1]
        $redGrubs=[int][string]$digitText[3]
        if($blueGrubs -gt 6){$blueGrubs=$null}
        if($redGrubs -gt 6){$redGrubs=$null}
      }
      $zoomWords=Read-OcrWords $csCapturePath $engine
      foreach ($word in $zoomWords) {
        $x=860+[double]$word.BoundingRect.X/3; $y=850+[double]$word.BoundingRect.Y/3; $h=[double]$word.BoundingRect.Height/3
        $row=[int][math]::Round((($y+$h/2)-875)/44)
        if ($row -lt 0 -or $row -gt 4 -or [math]::Abs(($y+$h/2)-(875+44*$row)) -gt 15) { continue }
        $part=[pscustomobject]@{x=$x;text=($word.Text -replace '\s','')}
        if ($x -ge 860 -and $x -le 930) { [void]$blueCsZoomParts[$row].Add($part) }
        elseif ($x -ge 1000 -and $x -le 1070) { [void]$redCsZoomParts[$row].Add($part) }
      }
      $blueText=@('','','','',''); $redText=@('','','','','')
      $blueCsText=@('','','','',''); $redCsText=@('','','','','')
      0..4 | ForEach-Object {
        $row=$_
        $blueText[$row]=(($blueParts[$row] | Sort-Object x | ForEach-Object {$_.text}) -join '')
        $redText[$row]=(($redParts[$row] | Sort-Object x | ForEach-Object {$_.text}) -join '')
        if ($blueText[$row] -match '^(\d+)[\(\[]([0-9]+)[\)\]]$') { $blue[$row]=[int]$Matches[2] }
        if ($redText[$row] -match '^(\d+)[\(\[]([0-9]+)[\)\]]$') { $red[$row]=[int]$Matches[2] }
        $blueCsText[$row]=(($blueCsParts[$row] | Sort-Object x | ForEach-Object {$_.text}) -join '')
        $redCsText[$row]=(($redCsParts[$row] | Sort-Object x | ForEach-Object {$_.text}) -join '')
        $blueKdaText=(($blueKdaParts[$row] | Sort-Object x | ForEach-Object {$_.text}) -join '')
        $redKdaText=(($redKdaParts[$row] | Sort-Object x | ForEach-Object {$_.text}) -join '')
        if ($blueKdaText -match '(?<![0-9/])(\d{1,2})/(\d{1,2})/(\d{1,2})(?![0-9/])') { $blueKda[$row]=[string]::Format('{0}/{1}/{2}',[int]$Matches[1],[int]$Matches[2],[int]$Matches[3]) }
        if ($redKdaText -match '(?<![0-9/])(\d{1,2})/(\d{1,2})/(\d{1,2})(?![0-9/])') { $redKda[$row]=[string]::Format('{0}/{1}/{2}',[int]$Matches[1],[int]$Matches[2],[int]$Matches[3]) }
        $blueCandidate=$blueCsParts[$row] | Where-Object {$_.text -match '^(\d{1,4})(?:\D|$)'} | Sort-Object @{Expression={[math]::Abs($_.x-885)}} | Select-Object -First 1
        $redCandidate=$redCsParts[$row] | Where-Object {$_.text -match '^(\d{1,4})(?:\D|$)'} | Sort-Object @{Expression={[math]::Abs($_.x-1025)}} | Select-Object -First 1
        $blueZoomCandidate=$blueCsZoomParts[$row] | Where-Object {$_.text -match '^(\d{1,4})(?:\D|$)'} | Sort-Object @{Expression={[math]::Abs($_.x-885)}} | Select-Object -First 1
        $redZoomCandidate=$redCsZoomParts[$row] | Where-Object {$_.text -match '^(\d{1,4})(?:\D|$)'} | Sort-Object @{Expression={[math]::Abs($_.x-1025)}} | Select-Object -First 1
        if ($blueCandidate.text -match '^(\d{1,4})(?:\D|$)' -and [int]$Matches[1] -le 2000) { $blueCs[$row]=[int]$Matches[1] }
        if ($redCandidate.text -match '^(\d{1,4})(?:\D|$)' -and [int]$Matches[1] -le 2000) { $redCs[$row]=[int]$Matches[1] }
        if ($blueZoomCandidate.text -match '^(\d{1,4})(?:\D|$)' -and [int]$Matches[1] -le 2000) { $blueCsZoom[$row]=[int]$Matches[1] }
        if ($redZoomCandidate.text -match '^(\d{1,4})(?:\D|$)' -and [int]$Matches[1] -le 2000) { $redCsZoom[$row]=[int]$Matches[1] }
      }
      $blueCount=@($blue | Where-Object { $null -ne $_ }).Count
      $redCount=@($red | Where-Object { $null -ne $_ }).Count
      [Console]::Out.WriteLine(([pscustomobject]@{ok=($blueCount -gt 0 -and $redCount -gt 0);capturedAt=$capturedAt;width=$gameBounds.Width;height=$gameBounds.Height;blue=$blue;red=$red;blueCs=$blueCs;redCs=$redCs;blueCsZoom=$blueCsZoom;redCsZoom=$redCsZoom;blueKda=$blueKda;redKda=$redKda;blueGrubs=$blueGrubs;redGrubs=$redGrubs;blueCsText=$blueCsText;redCsText=$redCsText;blueText=$blueText;redText=$redText;blueCount=$blueCount;redCount=$redCount;questIcons=$questIcons;questIconCapture=$questIconCapture} | ConvertTo-Json -Compress -Depth 4))
    } catch {
      [Console]::Out.WriteLine(([pscustomobject]@{ok=$false;reason='ocr';message=$_.Exception.Message;trace=$_.ScriptStackTrace} | ConvertTo-Json -Compress))
    } finally {
      if($bitmap){$bitmap.Dispose()}
      if($csBitmap){$csBitmap.Dispose()}
      if($digitBitmap){$digitBitmap.Dispose()}
    }
    Start-Sleep -Milliseconds 700
  }
} finally {
  Remove-Item -LiteralPath $capturePath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $csCapturePath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $digitCapturePath -Force -ErrorAction SilentlyContinue
}
