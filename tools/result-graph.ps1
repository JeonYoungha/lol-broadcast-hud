param([Parameter(Mandatory=$true)][string]$ImagePath,[Parameter(Mandatory=$true)][string]$MetadataRoot,[switch]$IncludeWords)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Runtime.WindowsRuntime
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Collections.Generic;
public class DamageBar { public string side; public int y; public int top; public int bottom; public int start; public int end; public string alias; public double error; }
public static class DamageGraph {
 public static void RowText(Bitmap source,int left,int top,int bottom,int scale,string file){
  int width=source.Width-left,height=bottom-top+1,pad=18;
  using(var image=new Bitmap(width*scale+pad*2,height*scale+pad*2)){
   using(var g=Graphics.FromImage(image)){g.Clear(Color.White);}
   for(int y=0;y<height*scale;y++)for(int x=0;x<width*scale;x++){
    Color c=source.GetPixel(left+x/scale,top+y/scale);
    image.SetPixel(x+pad,y+pad,(c.R+c.G+c.B)/3>145?Color.Black:Color.White);
   }
   image.Save(file,System.Drawing.Imaging.ImageFormat.Png);
  }
 }
 public static void TextImage(Bitmap source,int top,int scale,string file,int threshold){
  using(var image=new Bitmap(source.Width*scale,(source.Height-top)*scale)){
   for(int y=0;y<image.Height;y++)for(int x=0;x<image.Width;x++){
    Color c=source.GetPixel(x/scale,top+y/scale);
    image.SetPixel(x,y,(c.R+c.G+c.B)/3>threshold?Color.Black:Color.White);
   }
   image.Save(file,System.Drawing.Imaging.ImageFormat.Png);
  }
 }
 static int ColorKind(Color c) {
  if(c.G>110 && c.B>100 && c.R<c.G*.7) return 1;
  if(c.R>150 && c.R>c.G*1.8 && c.R>c.B*1.25) return 2;
  return 0;
 }
 public static List<DamageBar> Bars(Bitmap b) {
  var bars=new List<DamageBar>(); DamageBar group=null; int lastY=-5;
  for(int y=0;y<b.Height;y++){
   int bestStart=0,bestEnd=0,bestKind=0,runStart=0,runKind=0;
   for(int x=(int)(b.Width*.055);x<=b.Width;x++){
    int kind=x<b.Width?ColorKind(b.GetPixel(x,y)):0;
    if(kind!=runKind){
     if(runKind>0 && x-runStart>bestEnd-bestStart){bestStart=runStart;bestEnd=x;bestKind=runKind;}
     runStart=x;runKind=kind;
    }
   }
   if(bestEnd-bestStart<Math.Max(10,b.Width*.012)){group=null;continue;}
   string side=bestKind==1?"blue":"red";
   if(group==null || y-lastY>1 || group.side!=side){
    group=new DamageBar{side=side,y=y,top=y,bottom=y,start=bestStart,end=bestEnd,error=1};bars.Add(group);
   } else {group.bottom=y;group.y=(group.top+y)/2; if(bestEnd>group.end){group.end=bestEnd;group.start=bestStart;}}
   lastY=y;
  }
  return bars;
 }
 public static void Match(Bitmap graph,List<DamageBar> bars,string[] files){
  foreach(var path in files){
   try{
    using(var original=new Bitmap(path))using(var icon=new Bitmap(48,48)){
     using(var g=Graphics.FromImage(icon)){g.DrawImage(original,0,0,48,48);}
     foreach(var bar in bars){
      double best=bar.error; double height=bar.bottom-bar.top+1,radius=height*.52,cx=bar.start-height*.84,cy=bar.y;
      for(int shiftY=-4;shiftY<=4;shiftY+=4)for(int shiftX=-3;shiftX<=3;shiftX+=3)for(double zoom=.75;zoom<=1.16;zoom+=.2){
       double error=0;int samples=0;
       for(int y=8;y<40;y+=2)for(int x=8;x<40;x+=2){
        double dx=(x-24)/24.0,dy=(y-24)/24.0;if(dx*dx+dy*dy>.48)continue;
        int sx=(int)Math.Round(cx+shiftX+dx*radius*zoom),sy=(int)Math.Round(cy+shiftY+dy*radius*zoom);
        if(sx<0||sy<0||sx>=graph.Width||sy>=graph.Height)continue;
        Color a=graph.GetPixel(sx,sy),b=icon.GetPixel(x,y);
        error+=(a.R-b.R)*(a.R-b.R)+(a.G-b.G)*(a.G-b.G)+(a.B-b.B)*(a.B-b.B);samples++;
       }
       double score=samples>0?Math.Sqrt(error/(samples*3))/255:1;
       if(score<best){best=score;bar.alias=System.IO.Path.GetFileNameWithoutExtension(path);bar.error=score;}
      }
     }
    }
   }catch{}
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
function Read-Words($Path,$Engine){
 $file=Await-Rt ([Windows.Storage.StorageFile]::GetFileFromPathAsync($Path)) ([Windows.Storage.StorageFile])
 $stream=Await-Rt ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
 try{
  $decoder=Await-Rt ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $bitmap=Await-Rt ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  try{$ocr=Await-Rt ($Engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult]);foreach($line in $ocr.Lines){foreach($word in $line.Words){$word}}}finally{$bitmap.Dispose()}
 }finally{$stream.Dispose()}
}
$graph=[Drawing.Bitmap]::new($ImagePath)
$axisPath=Join-Path $env:TEMP ('hud-damage-axis-'+[Guid]::NewGuid().ToString('N')+'.png')
$numbersPath=Join-Path $env:TEMP ('hud-damage-values-'+[Guid]::NewGuid().ToString('N')+'.png')
try {
 $bars=[DamageGraph]::Bars($graph)
 $blue=@($bars|Where-Object side -eq blue);$red=@($bars|Where-Object side -eq red)
 if($blue.Count -ne 5 -or $red.Count -ne 5){throw 'Could not find five blue and five red horizontal bars.'}
 $metadata=Get-Content -Raw -LiteralPath (Join-Path $MetadataRoot 'champions.json')|ConvertFrom-Json
 $icons=@(Get-ChildItem -Path (Join-Path $MetadataRoot '*\icon\*.png') -File|Sort-Object FullName -Descending|Group-Object BaseName|ForEach-Object{$_.Group[0].FullName})
 [DamageGraph]::Match($graph,$bars,[string[]]$icons)
 $engine=[Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
 $scale=[Math]::Min(3,[Math]::Floor(2400/$graph.Width));if($scale -lt 1){$scale=1}
 $axisTop=[int]($graph.Height*.94);$axisHeight=$graph.Height-$axisTop
 [DamageGraph]::TextImage($graph,$axisTop,$scale,$axisPath,65)
 [DamageGraph]::TextImage($graph,0,$scale,$numbersPath,150)
 $numberWords=@()
 if($engine){$numberWords=@(Read-Words $numbersPath $engine)}
 $values=@()
 if($engine){
  $file=Await-Rt ([Windows.Storage.StorageFile]::GetFileFromPathAsync($axisPath)) ([Windows.Storage.StorageFile])
  $stream=Await-Rt ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  try{
   $decoder=Await-Rt ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
   $bitmap=Await-Rt ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
   try{
    $ocr=Await-Rt ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
    $origin=($bars|Measure-Object start -Average).Average
    foreach($line in $ocr.Lines){foreach($word in $line.Words){
     $text=$word.Text -replace '[, .]','' -replace '[Oo]','0'
     if($text -match '^\d{4,6}$'){
      $v=[double]$text;$x=($word.BoundingRect.X+$word.BoundingRect.Width/2)/$scale
      if($v -ge 1000 -and $v -le 500000 -and $v%1000 -eq 0 -and $x -gt $origin+10){$values+=($v/($x-$origin))}
     }
    }}
   }finally{$bitmap.Dispose()}
  }finally{$stream.Dispose()}
 }
 $perPixel=$null
 if($values.Count -ge 2){$sorted=@($values|Sort-Object);$perPixel=$sorted[[int][Math]::Floor($sorted.Count/2)]}
 $output=@{blue=@();red=@();estimated=$false;scaleDetected=($null -ne $perPixel);message='Read damage numbers from the uploaded graph.'}
 foreach($bar in $bars){
  $champ=$metadata.data.PSObject.Properties|Where-Object Name -eq $bar.alias|Select-Object -First 1
  $id=0;$name=''
  if($champ -and $bar.error -lt .30){$id=[int]$champ.Value.key;$name=$champ.Value.name}
  $value=$null;$estimated=$false
  if($engine){
   $rowLeft=[Math]::Min($graph.Width-1,$bar.end+2)
   $rowTop=[Math]::Max(0,$bar.top-5);$rowBottom=[Math]::Min($graph.Height-1,$bar.bottom+5)
   [DamageGraph]::RowText($graph,$rowLeft,$rowTop,$rowBottom,3,$numbersPath)
   $rowWords=@(Read-Words $numbersPath $engine)
   $rowText=($rowWords|ForEach-Object{$_.Text}) -join ''
   if($IncludeWords){Write-Verbose ($bar.side+':'+$bar.y+':'+$rowText) -Verbose}
   $rowText=$rowText -replace '[, .]','' -replace '[Oo]','0' -replace '(?<=\d)/','7'
   if($rowText -match '^\d{3,6}$'){$value=[int]$rowText}
  }
  $exact=$numberWords|Where-Object{
   $text=$_.Text -replace '[, .]','' -replace '[Oo]','0' -replace '(?<=\d)/','7'
   $text -match '^\d{3,6}$' -and [Math]::Abs(($_.BoundingRect.Y+$_.BoundingRect.Height/2)/$scale-$bar.y) -lt 22 -and $_.BoundingRect.X/$scale -ge $bar.end-8
  }|Select-Object -First 1
  if($null -eq $value -and $exact){$value=[int]($exact.Text -replace '[, .]','' -replace '[Oo]','0' -replace '(?<=\d)/','7')}
  if($null -eq $value -and $null -ne $perPixel){$value=[int]([Math]::Round((($bar.end-$bar.start)*$perPixel)/100)*100);$estimated=$true;$output.estimated=$true}
  $output[$bar.side]+=@{id=$id;name=$name;damage=$value;estimated=$estimated;matchError=[Math]::Round($bar.error,3);bounds=@($bar.start,$bar.end,$bar.top,$bar.bottom)}
 }
 if($IncludeWords){$output.words=@($numberWords|ForEach-Object{@{text=$_.Text;x=$_.BoundingRect.X/$scale;y=$_.BoundingRect.Y/$scale}})}
 $output|ConvertTo-Json -Depth 5 -Compress
}finally{
 $graph.Dispose()
 if(Test-Path -LiteralPath $axisPath){Remove-Item -LiteralPath $axisPath}
 if(Test-Path -LiteralPath $numbersPath){Remove-Item -LiteralPath $numbersPath}
}
