param([Parameter(Mandatory=$true)][string]$ImagePath,[int]$DurationSeconds=0)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Runtime.WindowsRuntime
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Collections.Generic;
public class GoldTracePoint {public double x;public double diff;}
public class GoldTraceResult {public int left,right,zero;public double spacing;public List<GoldTracePoint> points=new List<GoldTracePoint>();}
public static class GoldTrace {
 public static GoldTraceResult Read(Bitmap b,int zeroHint){
  var result=new GoldTraceResult();int best=0;
  for(int y=zeroHint>=0?Math.Max(0,zeroHint-5):(int)(b.Height*.05);y<(zeroHint>=0?Math.Min(b.Height,zeroHint+6):(int)(b.Height*.95));y++){
   int count=0,start=-1,end=0;
   for(int x=(int)(b.Width*.04);x<b.Width;x++){
    Color c=b.GetPixel(x,y);bool warm=c.R>120&&c.G>110&&c.B>60&&c.R-c.B>20&&Math.Abs(c.R-c.G)<25;
    bool hinted=c.R>110&&c.G>90&&c.B>50&&c.R-c.B>20&&Math.Abs(c.R-c.G)<100;
    if(warm||hinted){count++;if(start<0)start=x;end=x;}
   }
   if(count>best){best=count;result.zero=y;result.left=start;result.right=end;}
  }
  if(best<b.Width*.5)throw new Exception("Could not find the zero-gold horizontal line. Include the axes.");
  var grid=new List<int>();int last=-3;
  for(int y=(int)(b.Height*.12);y<(int)(b.Height*.9);y++){
   int count=0;
   for(int x=result.left;x<=result.right;x++){Color c=b.GetPixel(x,y);if(c.R>40&&Math.Abs(c.R-c.G)<25&&Math.Abs(c.G-c.B)<20)count++;}
   if(count>(result.right-result.left)*.65&&y-last>3){grid.Add(y);last=y;}
  }
  var steps=new List<int>();for(int i=1;i<grid.Count;i++){int delta=grid[i]-grid[i-1];if(delta>b.Height*.06&&delta<b.Height*.2)steps.Add(delta);}
  if(steps.Count<2)throw new Exception("Could not read grid spacing. Include horizontal gold grid lines.");
  steps.Sort();result.spacing=steps[steps.Count/2];
  for(int x=result.left;x<=result.right;x+=3){
   var ys=new List<int>();
   for(int xx=x;xx<=Math.Min(x+2,result.right);xx++)for(int y=(int)(b.Height*.06);y<(int)(b.Height*.9);y++){
    Color c=b.GetPixel(xx,y);
    bool blue=c.B>145&&c.G>100&&c.R<c.G*.8&&c.B>c.G*1.15;
    bool red=c.R>170&&c.G<90&&c.B<130;
    if(blue||red)ys.Add(y);
   }
   if(ys.Count>0){ys.Sort();result.points.Add(new GoldTracePoint{x=x,diff=(result.zero-ys[ys.Count/2])*2000/result.spacing});}
  }
  if(result.points.Count<30)throw new Exception("Could not find the gold-difference curve.");
  result.points.Insert(0,new GoldTracePoint{x=result.left,diff=0});
  return result;
 }
 public static void AxisImage(Bitmap b,string file){
  int top=(int)(b.Height*.9);
  using(var image=new Bitmap(b.Width*2,(b.Height-top)*2)){
   for(int y=0;y<image.Height;y++)for(int x=0;x<image.Width;x++){Color c=b.GetPixel(x/2,top+y/2);image.SetPixel(x,y,(c.R+c.G+c.B)/3>90?Color.Black:Color.White);}
   image.Save(file,System.Drawing.Imaging.ImageFormat.Png);
  }
 }
 public static void LabelsImage(Bitmap b,string file){
  int width=(int)(b.Width*.05)*3,height=(int)(b.Height*.9)*3;
  using(var image=new Bitmap(width+120,height+60)){
   using(var g=Graphics.FromImage(image)){g.Clear(Color.White);}
   for(int y=0;y<height;y++)for(int x=0;x<width;x++){Color c=b.GetPixel(x/3,y/3);image.SetPixel(x+60,y+30,(c.R+c.G+c.B)/3>90?Color.Black:Color.White);}
   image.Save(file,System.Drawing.Imaging.ImageFormat.Png);
  }
 }
}
'@
$null=[Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime]
$null=[Windows.Graphics.Imaging.BitmapDecoder,Windows.Foundation,ContentType=WindowsRuntime]
$null=[Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]
function Await-Rt($Operation,[Type]$Type){
 $method=[System.WindowsRuntimeSystemExtensions].GetMethods()|Where-Object{$_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1}|Select-Object -First 1
 $task=$method.MakeGenericMethod($Type).Invoke($null,@($Operation));$task.Wait();return $task.Result
}
$b=[Drawing.Bitmap]::new($ImagePath)
$temp=Join-Path $env:TEMP ('hud-gold-axis-'+[Guid]::NewGuid().ToString('N')+'.png')
try {
 $null=[Windows.Globalization.Language,Windows.Globalization,ContentType=WindowsRuntime]
 $engine=[Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new('en-US'))
 if(!$engine){$engine=[Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()}
 $zeroHint=-1;$detectedGrid=0
 if($engine){
  [GoldTrace]::LabelsImage($b,$temp)
  $labelFile=Await-Rt ([Windows.Storage.StorageFile]::GetFileFromPathAsync($temp)) ([Windows.Storage.StorageFile])
  $labelStream=Await-Rt ($labelFile.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  try{
   $labelDecoder=Await-Rt ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($labelStream)) ([Windows.Graphics.Imaging.BitmapDecoder])
   $labelBitmap=Await-Rt ($labelDecoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
   try{
    $labels=Await-Rt ($engine.RecognizeAsync($labelBitmap)) ([Windows.Media.Ocr.OcrResult])
    $values=@()
    foreach($line in $labels.Lines){foreach($word in $line.Words){
     $label=$word.Text -replace '[Oo]','0' -replace '[Il]','1' -replace '\s',''
     if($label -eq '0' -and ($word.BoundingRect.Y-30)/3 -gt $b.Height*.05 -and ($word.BoundingRect.Y-30)/3 -lt $b.Height*.9){$zeroHint=[int](($word.BoundingRect.Y-30+$word.BoundingRect.Height/2)/3)}
     if($label -match '^(\d+(?:\.\d+)?)[kK]$'){$values+=([double]$Matches[1]*1000)}
    }}
    if($values.Count -ge 2){$unique=@($values|Sort-Object -Unique);$deltas=@();for($i=1;$i -lt $unique.Count;$i++){$deltas+=($unique[$i]-$unique[$i-1])};if($deltas.Count){$detectedGrid=($deltas|Sort-Object)[0]}elseif($unique.Count -eq 1 -and $unique[0] -eq 1000){$detectedGrid=1000}}
   }finally{$labelBitmap.Dispose()}
  }finally{$labelStream.Dispose()}
 }
 $trace=[GoldTrace]::Read($b,$zeroHint);[GoldTrace]::AxisImage($b,$temp)
 $ticks=@()
 if($engine -and $DurationSeconds -le 0){
  $file=Await-Rt ([Windows.Storage.StorageFile]::GetFileFromPathAsync($temp)) ([Windows.Storage.StorageFile])
  $stream=Await-Rt ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  try{
   $decoder=Await-Rt ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
   $bitmap=Await-Rt ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
   try{
    $ocr=Await-Rt ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
    foreach($line in $ocr.Lines){$words=@($line.Words);for($i=0;$i -lt $words.Count;$i++){
     for($length=1;$length -le 3 -and ($i+$length) -le $words.Count;$length++){
      $text=(($words[$i..($i+$length-1)]|ForEach-Object{$_.Text}) -join '') -replace '[Oo]','0' -replace '\s',''
      if($text -match '^(\d{1,3})[:;.]([0-5]\d)$'){$first=$words[$i];$last=$words[$i+$length-1];$ticks+=@{x=($first.BoundingRect.X+$last.BoundingRect.X+$last.BoundingRect.Width)/4;seconds=([int]$Matches[1]*60+[int]$Matches[2])};$i+=$length-1;break}
     }
    }}
   }finally{$bitmap.Dispose()}
  }finally{$stream.Dispose()}
 }
 if($DurationSeconds -gt 0){$rate=$DurationSeconds/[double]($trace.right-$trace.left)}else{
  if($ticks.Count -lt 2){throw 'Could not read time labels. Include at least two time labels such as 0:00 and 8:20.'}
  $ticks=@($ticks|Sort-Object x);$rates=@()
  for($i=1;$i -lt $ticks.Count;$i++){if($ticks[$i].x-$ticks[$i-1].x -gt 20 -and $ticks[$i].seconds -gt $ticks[$i-1].seconds){$rates+=($ticks[$i].seconds-$ticks[$i-1].seconds)/($ticks[$i].x-$ticks[$i-1].x)}}
  if($rates.Count -lt 1){throw 'Could not read time scale. Re-select the time labels or enter the duration.'}
  $rates=@($rates|Sort-Object);$rate=$rates[[int][Math]::Floor($rates.Count/2)]
 }
 $points=@($trace.points|ForEach-Object{@{seconds=[Math]::Round(($_.x-$trace.left)*$rate,1);diff=[int]([Math]::Round($_.diff/10)*10)}})
 @{points=$points;estimated=$true;duration=[Math]::Round(($trace.right-$trace.left)*$rate);source='image';zeroY=$trace.zero;goldPerGrid=2000;detectedGoldPerGrid=$detectedGrid;gridSpacing=$trace.spacing;ticks=$ticks;timeSource=$(if($DurationSeconds -gt 0){'manual'}else{'ocr'})}|ConvertTo-Json -Depth 6 -Compress
}catch{@{error=$_.Exception.Message}|ConvertTo-Json -Compress;exit 1}finally{$b.Dispose();if(Test-Path -LiteralPath $temp){Remove-Item -LiteralPath $temp}}

