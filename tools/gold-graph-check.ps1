param([Parameter(Mandatory=$true)][string]$Fixture,[Parameter(Mandatory=$true)][string]$WorkDirectory,[string]$RedFixture='')
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$scriptFile=Join-Path $PSScriptRoot 'result-gold-graph.ps1'
$auto=powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptFile -ImagePath $Fixture | ConvertFrom-Json
if($auto.points.Count -lt 250 -or [math]::Abs($auto.points[-1].diff-7020) -gt 250){throw 'Original gold curve regression'}
if(!(Test-Path -LiteralPath $WorkDirectory)){New-Item -ItemType Directory -Path $WorkDirectory | Out-Null}
$cropPath=Join-Path $WorkDirectory 'gold-without-time-test.png'
$image=[Drawing.Bitmap]::new($Fixture)
try{$crop=$image.Clone([Drawing.Rectangle]::new(0,0,$image.Width,$image.Height-55),$image.PixelFormat);try{$crop.Save($cropPath,[Drawing.Imaging.ImageFormat]::Png)}finally{$crop.Dispose()}}finally{$image.Dispose()}
$failed=powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptFile -ImagePath $cropPath | ConvertFrom-Json
if(!$failed.error -or $failed.error -notmatch 'time labels|time scale'){throw 'Missing time labels must be reported clearly'}
$manual=powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptFile -ImagePath $cropPath -DurationSeconds 1800 | ConvertFrom-Json
if($manual.duration -ne 1800 -or $manual.timeSource -ne 'manual' -or $manual.points.Count -lt 250){throw 'Manual-duration fallback failed'}
Write-Output ('PASS original: '+$auto.points.Count+' points, '+$auto.duration+' seconds, final '+$auto.points[-1].diff)
Write-Output ('PASS missing-time error; manual fallback: '+$manual.points.Count+' points, '+$manual.duration+' seconds, final '+$manual.points[-1].diff)
if($RedFixture){
 $red=powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptFile -ImagePath $RedFixture | ConvertFrom-Json
 if($red.error -or $red.points.Count -lt 300 -or [math]::Abs($red.zeroY-233) -gt 2 -or $red.detectedGoldPerGrid -ne 1000){throw 'Red-filled zero line or 1K grid regression'}
 $final=$red.points[-1].diff*$red.detectedGoldPerGrid/2000
 if([math]::Abs($final+3700) -gt 200){throw 'Red-filled curve scale regression'}
 Write-Output ('PASS red-filled zero line: '+$red.points.Count+' points, grid '+$red.detectedGoldPerGrid+', final '+$final)
}
