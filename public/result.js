const root=document.getElementById('resultApp');
if(new URLSearchParams(location.search).has('preview')){
  document.body.style.background='#000';
  const fit=()=>{const scale=Math.min(innerWidth/1920,innerHeight/1080,1);root.style.transform='scale('+scale+')';root.style.transformOrigin='top left';root.style.left=((innerWidth-1920*scale)/2)+'px'};
  fit();addEventListener('resize',fit);
}
const esc=HUD.escape;
const englishChampions=new Map();
const safeImage=src=>/^(\/[^\/]|data:image\/(?:png|jpeg|webp);base64,|https?:\/\/)/i.test(src||'')?src:'';
const team=(s,side,winner)=>{const t=s[side],logo=safeImage(t.logo);return '<div class="result-team '+side+' '+(winner===side?'win':'')+'">'+(logo?'<img src="'+esc(logo)+'">':'<span class="result-logo-fallback">'+esc((t.short||side).slice(0,3))+'</span>')+'<strong>'+esc(t.short||t.name)+'</strong><b>'+esc(t.score||0)+'</b><em>'+(winner?winner===side?'WIN':'LOSS':'—')+'</em></div>'};
const dragon=t=>{const key=String(t||'').toLowerCase();return /fire|infernal/.test(key)?'infernal':/ocean|water/.test(key)?'ocean':/mountain|earth/.test(key)?'mountain':/cloud|air/.test(key)?'cloud':/hextech/.test(key)?'hextech':/chemtech/.test(key)?'chemtech':/elder/.test(key)?'elder':''};
const drakes=types=>types?.length?'<span class="result-objectives">'+types.map(t=>{const key=dragon(t);return key?'<img src="/assets/hud/dragon-'+key+'.png" title="'+esc(t)+'">':'<span>◆</span>'}).join('')+'</span>':'—';
const bans=ids=>'<span class="result-bans">'+Array.from({length:5},(_,i)=>ids?.[i]?'<img src="'+HUD.icon(ids[i])+'">':'<span class="result-ban-empty"></span>').join('')+'</span>';
const row=(label,blue,red)=>'<div class="result-stat"><div>'+blue+'</div><small>'+label+'</small><div>'+red+'</div></div>';
function goldGraph(history=[],uploaded=HUD.state?.result?.goldData){
 const points=uploaded?.points?.length?uploaded.points.filter(p=>Number.isFinite(p.seconds)&&Number.isFinite(p.diff)).map(p=>({seconds:p.seconds*(uploaded.durationOverride>0?uploaded.durationOverride/uploaded.duration:1),blue:p.diff*(uploaded.invert?-1:1)*(uploaded.goldPerGridOverride>0?uploaded.goldPerGridOverride/2000:1),red:0})):history.filter(p=>Number.isFinite(p.seconds)&&Number.isFinite(p.blue)&&Number.isFinite(p.red));
 if(points.length<2)return '<div class="no-history">경기 중 기록된 골드 데이터가 없습니다</div>';
 const w=780,h=142,x0=50,y0=8,maxTime=Math.max(1,...points.map(p=>p.seconds)),upper=Math.max(1000,Math.ceil(Math.max(0,...points.map(p=>p.blue-p.red))/1000)*1000),lower=Math.min(0,Math.floor(Math.min(0,...points.map(p=>p.blue-p.red))/1000)*1000);
 const x=p=>x0+(p.seconds/maxTime)*(w-x0),y=p=>y0+(upper-(p.blue-p.red))/(upper-lower)*h;
 const path=points.map((p,i)=>(i?'L':'M')+x(p).toFixed(1)+' '+y(p).toFixed(1)).join(' ');
 const zero=y({blue:0,red:0}),area=path+' L'+x(points.at(-1)).toFixed(1)+' '+zero+' L'+x(points[0]).toFixed(1)+' '+zero+' Z';
 const tickTimes=[0];for(let t=300;t<maxTime-90;t+=300)tickTimes.push(t);tickTimes.push(maxTime);
 const ticks=tickTimes.map(t=>{const tx=x0+(t/maxTime)*(w-x0);return '<line x1="'+tx+'" x2="'+tx+'" y1="8" y2="150" stroke="#343045"/><text x="'+tx+'" y="175" text-anchor="middle" fill="#8e88a5" font-size="12">'+Math.round(t/60)+'</text>'}).join('');
 return '<svg viewBox="0 0 800 185" aria-label="팀 골드 차이"><defs><clipPath id="goldPositive"><rect x="0" y="0" width="800" height="'+zero+'"/></clipPath><clipPath id="goldNegative"><rect x="0" y="'+zero+'" width="800" height="180"/></clipPath></defs>'+ticks+'<line x1="50" x2="780" y1="'+zero+'" y2="'+zero+'" stroke="#62597a"/><path d="'+area+'" fill="#6466e8" opacity=".8" clip-path="url(#goldPositive)"/><path d="'+area+'" fill="#ed5471" opacity=".8" clip-path="url(#goldNegative)"/><path d="'+path+'" fill="none" stroke="#9491ee" stroke-width="1.5"/><text x="3" y="19" fill="#89819f" font-size="12">'+(upper/1000).toFixed(1)+'K</text><text x="3" y="'+(zero+4)+'" fill="#89819f" font-size="12">0</text>'+(lower<0?'<text x="0" y="154" fill="#89819f" font-size="12">'+(lower/1000).toFixed(1)+'K</text>':'')+'</svg>';
}
function damageGraph(data,snapshot){
 if(!data?.blue?.length||!data?.red?.length)return '<div class="result-empty">딜량 숫자가 보이는 그래프를 올려주세요<br><small>컨트롤 페이지 · 경기 결과 화면</small></div>';
 const max=Math.max(1,...[...data.blue,...data.red].map(p=>Number(p.damage)||0));
 const half=(side,i)=>{
  const p=data[side][i],pick=snapshot.draft[side+'Picks']?.[i];
  const name=p.playerName||(pick?.id===p.id?snapshot[side].players?.[i]:'')||englishChampions.get(Number(p.id))||p.name||'—';
  const value=p.damage===null||p.damage===undefined||p.damage===''?NaN:Number(p.damage),label=Number.isFinite(value)?(p.estimated?'≈ ':'')+(value/1000).toFixed(1)+'K':'인식 대기';
  return '<div class="damage-half '+side+'"><img src="'+HUD.icon(p.id)+'" alt="'+esc(p.name)+'"><div class="damage-detail"><div class="damage-label"><span>'+esc(name)+'</span><b title="'+esc(p.damage)+'">'+label+'</b></div><div class="damage-track"><i style="width:'+Math.min(100,(value||0)/max*100)+'%"></i></div></div></div>';
 };
 return '<div class="damage-rows">'+Array.from({length:5},(_,i)=>'<div class="damage-row">'+half('blue',i)+half('red',i)+'</div>').join('')+'</div>';
}
let signature='';
function renderResult(s){
 if(!s)return;
 const result=s.result||{},snapshot=result.snapshot||ResultCore.snapshot(s);
 const sig=JSON.stringify({snapshot,result});if(sig===signature)return;signature=sig;
 const g=snapshot.game,winner=result.winner||'';
 root.innerHTML='<header class="result-header">'+team(snapshot,'blue',winner)+'<div class="result-time"><small>GAME TIME</small><b>'+esc(g.clock||'00:00')+'</b></div>'+team(snapshot,'red',winner)+'</header><div class="result-columns"><section class="result-left"><h2 class="result-title">GAME STATS</h2>'+
 row('K / D / A',esc(ResultCore.kda(snapshot,'blue')),esc(ResultCore.kda(snapshot,'red')))+
 row('GOLD',esc(g.blueGold||'—'),esc(g.redGold||'—'))+
 row('TOWERS',esc(g.blueTowers??0),esc(g.redTowers??0))+
 row('GRUBS',esc(g.blueGrubs??0),esc(g.redGrubs??0))+
 row('HERALDS',esc(g.blueHeralds??0),esc(g.redHeralds??0))+
 row('DRAKES',drakes((g.blueDragonTypes||[]).filter(t=>dragon(t)!=='elder')),drakes((g.redDragonTypes||[]).filter(t=>dragon(t)!=='elder')))+
 row('ELDERS',drakes(Array.from({length:Math.max(0,Math.min(10,Number(g.blueElders??(g.blueDragonTypes||[]).filter(t=>dragon(t)==='elder').length)||0))},()=>'Elder')),drakes(Array.from({length:Math.max(0,Math.min(10,Number(g.redElders??(g.redDragonTypes||[]).filter(t=>dragon(t)==='elder').length)||0))},()=>'Elder')))+
 row('BARONS',esc(g.blueBarons??0),esc(g.redBarons??0))+
 row('BANS',bans(snapshot.draft.blueBans),bans(snapshot.draft.redBans))+
 '</section><section><h2 class="result-title">TOTAL DAMAGE TO CHAMPIONS</h2><div class="result-damage">'+damageGraph(result.damageData,snapshot)+'</div><div class="result-gold"><h2 class="result-title">GOLD DIFFERENCE</h2>'+goldGraph(g.goldHistory)+'</div></section></div><footer class="result-footer"><span>'+esc(snapshot.event.name)+'</span><span>'+esc(snapshot.event.round)+' · GAME '+esc(snapshot.event.game)+'</span></footer>'+(result.snapshot?'':'<div class="result-pending">결과 저장 전 미리보기</div>');
 root.querySelector('.result-gold svg')?.setAttribute('preserveAspectRatio','none');
}
fetch('/api/champion-list?lang=en').then(r=>r.json()).then(list=>{
 for(const c of Array.isArray(list)?list:[])englishChampions.set(Number(c.id),c.name);
 signature='';renderResult(HUD.state);
}).catch(()=>{});
HUD.init(renderResult);
