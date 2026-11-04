window.ResultCapture=(()=>{
 const dialog=document.createElement('dialog');dialog.className='capture-dialog';
 dialog.innerHTML='<div class="capture-head"><h2>딜량 캡처 영역 선택</h2><button class="btn" id="cropClose">닫기</button></div><p class="hint">① 이미지에서 드래그해 영역 선택 → ② 숫자 읽기 → ③ 10명 확인 후 적용</p><div class="capture-guide"><b>초상화 + 막대 + 막대 끝 숫자</b>가 모두 포함되도록 선택하세요. 위 블루 5명, 아래 레드 5명이 모두 보여야 합니다.<div class="guide-teams"><span>● 블루 5명 ▰▰▰ 숫자</span><span>● 레드 5명 ▰▰▰ 숫자</span></div>숫자는 켜서 캡처하세요. 축 눈금은 없어도 됩니다.</div><div class="capture-stage"><canvas id="cropCanvas" aria-label="딜량 영역 선택"></canvas></div><div class="actions"><button class="btn" id="cropAll">전체 이미지 선택</button><button class="btn primary" id="cropRead">선택 영역 숫자 읽기</button><button class="btn primary" id="cropApply" disabled>확인 후 결과창에 적용</button></div><p id="cropStatus" class="hint" role="status"></p><div id="cropReview"></div>';
 document.body.appendChild(dialog);
 dialog.querySelector('.capture-guide').id='captureGuide';dialog.querySelector('.capture-head h2').id='captureTitle';dialog.querySelector('.capture-head').nextElementSibling.id='captureSteps';
 const damageGuide=dialog.querySelector('.capture-guide').innerHTML;
 const goldGuide='<b>그래프 전체 + 왼쪽 골드 눈금 + 아래 시간 눈금</b>을 한 번에 선택하세요. 0선과 선의 시작·끝이 잘리면 안 됩니다.<svg viewBox="0 0 700 160" aria-label="골드 캡처 범위 가이드" style="display:block;width:100%;max-width:700px;height:130px"><rect x="2" y="2" width="696" height="156" fill="#0b1220" stroke="#5ce4ff" stroke-dasharray="7 4"/><path d="M65 35H660M65 75H660M65 115H660" stroke="#536078"/><path d="M65 75H660" stroke="#d2bb6a" stroke-width="2"/><path d="M65 75L200 60L330 90L460 40L660 20" fill="none" stroke="#62b8f5" stroke-width="3"/><g fill="#e6ecf5" font-size="15"><text x="13" y="40">2K</text><text x="20" y="80">0</text><text x="13" y="120">2K</text><text x="65" y="145">0:00</text><text x="275" y="145">8:20</text><text x="510" y="145">16:40</text></g></svg>청록색 테두리처럼 축까지 포함하세요. 시간 숫자는 최소 2개가 필요합니다. 못 읽으면 아래에 그래프 끝 시간을 직접 입력하세요.';
 const goldOptions=document.createElement('div');goldOptions.hidden=true;goldOptions.id='goldCaptureOptions';goldOptions.className='fields';goldOptions.innerHTML='<div class="field"><label>골드 눈금 한 칸</label><input id="cropGoldGrid" type="number" min="100" step="100" value="2000"></div><div class="field"><label>그래프 끝 시간 · 빈칸이면 자동 인식</label><input id="cropGoldDuration" placeholder="예: 29:00" aria-label="골드 그래프 끝 시간"></div><div class="field"><label><input id="cropGoldInvert" type="checkbox"> 블루 / 레드 우세 방향 반대로</label></div>';dialog.querySelector('.capture-guide').after(goldOptions);
 const style=document.createElement('style');style.textContent='.capture-dialog{width:min(1120px,95vw);max-height:94vh;overflow:auto;border:1px solid #45516a;border-radius:14px;background:#111827;color:#eef2ff;padding:24px}.capture-dialog::backdrop{background:#000b}.capture-head{display:flex;justify-content:space-between;align-items:center}.capture-guide{padding:14px;background:#1c2639;border-radius:8px;line-height:1.7;margin:12px 0}.guide-teams{display:flex;gap:30px}.guide-teams span:first-child{color:#57cce0}.guide-teams span:last-child{color:#fa6b80}.capture-stage{background:#080e18;text-align:center;max-height:52vh;overflow:auto;border:1px solid #3e4a61}.capture-stage canvas{display:block;max-width:100%;height:auto;margin:auto;cursor:crosshair;touch-action:none}.capture-review{display:grid;grid-template-columns:1fr 1fr;gap:20px}.capture-review-row{display:grid;grid-template-columns:32px 1fr 120px;align-items:center;gap:10px;margin:10px 0}.capture-review-row img{width:30px;height:30px}.capture-review-row input,.capture-review-row select{min-width:0;width:100%}.capture-dialog .hint{font-size:14px}@media(max-width:650px){.capture-review{grid-template-columns:1fr}.guide-teams{flex-direction:column;gap:0}}';
 document.head.appendChild(style);
 style.textContent+='.capture-dialog [hidden]{display:none!important}.capture-dialog input{max-width:100%}';
 const get=id=>dialog.querySelector('#'+id),canvas=get('cropCanvas'),context=canvas.getContext('2d');
 let image=null,rect=null,start=null,pending=null,busy=false,champions=[],onApply=null,token=0,graphType='damage';
 function status(message){get('cropStatus').textContent=message}
 function invalidate(){pending=null;get('cropApply').disabled=true;get('cropReview').innerHTML=''}
 function draw(){
  if(!image)return;context.clearRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
  if(!rect)return;
  context.fillStyle='#0009';context.beginPath();context.rect(0,0,canvas.width,canvas.height);context.rect(rect.x,rect.y,rect.w,rect.h);context.fill('evenodd');
  context.strokeStyle='#5ce4ff';context.lineWidth=3;context.strokeRect(rect.x,rect.y,rect.w,rect.h);
 }
 function point(e){const box=canvas.getBoundingClientRect();return {x:Math.max(0,Math.min(canvas.width,(e.clientX-box.left)*canvas.width/box.width)),y:Math.max(0,Math.min(canvas.height,(e.clientY-box.top)*canvas.height/box.height))}}
 canvas.onpointerdown=e=>{if(busy)return;invalidate();start=point(e);canvas.setPointerCapture(e.pointerId);rect={x:start.x,y:start.y,w:0,h:0};draw()};
 canvas.onpointermove=e=>{if(!start)return;const p=point(e);rect={x:Math.min(start.x,p.x),y:Math.min(start.y,p.y),w:Math.abs(start.x-p.x),h:Math.abs(start.y-p.y)};draw()};
 canvas.onpointerup=()=>{start=null;status('영역 선택 완료. 숫자 읽기를 눌러주세요.')};
 canvas.onpointercancel=()=>{start=null};
 get('cropAll').onclick=()=>{if(busy)return;invalidate();rect={x:0,y:0,w:canvas.width,h:canvas.height};draw();status('전체 이미지를 선택했어요.')};
 function review(data){
  if(graphType==='gold'){data.goldPerGridOverride=Math.max(100,Number(get('cropGoldGrid').value)||2000);data.invert=get('cropGoldInvert').checked;get('cropReview').innerHTML=GoldCaptureCore.preview(data);check();return}
  get('cropReview').innerHTML='<div class="capture-review">'+['blue','red'].map(side=>'<section><h3>'+(side==='blue'?'블루 5명':'레드 5명')+'</h3>'+data[side].map((p,i)=>'<div class="capture-review-row"><img src="'+HUD.icon(p.id)+'"><select aria-label="'+side+' '+(i+1)+' 챔피언" data-side="'+side+'" data-index="'+i+'" data-key="id">'+champions.map(c=>'<option value="'+c.id+'" '+(c.id===p.id?'selected':'')+'>'+HUD.escape(c.name)+'</option>').join('')+'</select><input aria-label="'+side+' '+(i+1)+' 딜량" type="number" min="0" step="1" data-side="'+side+'" data-index="'+i+'" data-key="damage" value="'+(p.damage??'')+'"></div>').join('')+'</section>').join('')+'</div>';
  get('cropReview').querySelectorAll('select[data-side]').forEach(select=>{
   if(!data[select.dataset.side][Number(select.dataset.index)].id)select.insertAdjacentHTML('afterbegin','<option value="0" selected>챔피언 선택</option>');
  });
  check();
 }
 function check(){get('cropApply').disabled=busy||!pending||(graphType==='gold'?!GoldCaptureCore.valid(pending.data):!['blue','red'].every(side=>pending.data[side].length===5&&pending.data[side].every(p=>Number.isInteger(p.damage)&&p.damage>=0&&p.id>0)))}
 get('cropGoldGrid').oninput=get('cropGoldInvert').onchange=()=>{if(pending&&graphType==='gold')review(pending.data)};
 get('cropGoldDuration').oninput=()=>{if(pending&&graphType==='gold')invalidate()};
 get('cropReview').oninput=e=>{if(!pending)return;const input=e.target,side=input.dataset.side;if(!side)return;const p=pending.data[side][Number(input.dataset.index)];
  if(input.dataset.key==='damage'){p.damage=input.value===''?null:Number(input.value);p.estimated=false}
  else {p.id=Number(input.value);p.name=champions.find(c=>c.id===p.id)?.name||''}check();
 };
 get('cropRead').onclick=async()=>{
  if(!rect||rect.w<30||rect.h<60){status(graphType==='gold'?'그래프와 양쪽 축이 포함되도록 더 넓게 선택해주세요.':'너무 작은 영역입니다. 10명 전체를 선택해주세요.');return}
  const durationSeconds=graphType==='gold'?GoldCaptureCore.seconds(get('cropGoldDuration').value):0;
  if(graphType==='gold'&&get('cropGoldDuration').value.trim()&&!durationSeconds){status('끝 시간은 분:초로 입력해주세요. 예: 29:00');return}
  busy=true;invalidate();get('cropRead').disabled=true;goldOptions.querySelectorAll('input').forEach(input=>input.disabled=true);status(graphType==='gold'?'선택 영역의 골드 그래프와 축을 읽는 중…':'선택 영역의 숫자를 읽는 중…');const current=token;
  try{
   const rx=image.naturalWidth/canvas.width,ry=image.naturalHeight/canvas.height;
   const sx=Math.round(rect.x*rx),sy=Math.round(rect.y*ry),sw=Math.min(image.naturalWidth-sx,Math.round(rect.w*rx)),sh=Math.min(image.naturalHeight-sy,Math.round(rect.h*ry));
   const scale=Math.min(1,1800/sw,1400/sh),crop=document.createElement('canvas');crop.width=Math.round(sw*scale);crop.height=Math.round(sh*scale);
   crop.getContext('2d').drawImage(image,sx,sy,sw,sh,0,0,crop.width,crop.height);
   const response=await fetch('/api/result-image',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dataUrl:crop.toDataURL('image/png'),preview:true,graphType,durationSeconds})});
   const result=await response.json();if(current!==token)return;if(!response.ok||!result.data)throw Error(result.analysisError||result.error||'영역을 다시 선택해주세요.');
   if(graphType==='gold'&&result.data.detectedGoldPerGrid>0)get('cropGoldGrid').value=result.data.detectedGoldPerGrid;
   pending=result;review(result.data);status(graphType==='gold'?'골드 차이를 복원했어요. '+(result.data.detectedGoldPerGrid>0?'눈금 한 칸 '+result.data.detectedGoldPerGrid+'골드 감지. ':'눈금 값을 자동 확인하지 못했으니 직접 확인해주세요. ')+'아래 미리보기와 경기 길이·눈금·우세 방향을 확인한 후 적용하세요. 아직 결과창은 바뀌지 않았습니다.':result.analysisError||'10명의 숫자를 읽었어요. 챔피언과 딜량을 확인하고 적용하세요. 아직 결과창은 바뀌지 않았습니다.');
  }catch(e){if(current===token)status(e.message)}finally{busy=false;get('cropRead').disabled=false;goldOptions.querySelectorAll('input').forEach(input=>input.disabled=false);check()}
 };
 get('cropApply').onclick=async()=>{
  if(get('cropApply').disabled)return;busy=true;check();status('결과창에 적용 중…');
  try{
   const data=structuredClone(pending.data);let result;
   if(graphType==='gold'){data.estimated=true;result={goldImage:pending.url,goldData:data};}
   else{data.missingCount=0;data.warning='';data.estimated=['blue','red'].some(side=>data[side].some(p=>p.estimated));result={damageImage:pending.url,damageData:data,damageAnalysisError:''};}
   if(!HUD.state.result?.snapshot)result.snapshot=ResultCore.snapshot(HUD.state);
   const response=await HUD.update({result});if(!response.ok)throw Error(response.error||'저장 실패');
   onApply?.(graphType==='gold'?'확인한 골드 차이 그래프를 결과창에 적용했어요. (이미지 복원 근사치)':'확인한 딜량 10명을 결과창에 적용했어요.');dialog.close();
  }catch(e){status(e.message)}finally{busy=false;check()}
 };
 get('cropClose').onclick=()=>{if(!busy)dialog.close()};
 dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault()});dialog.addEventListener('close',()=>{token++;start=null;invalidate()});
 async function open(file,options={}){
  if(busy)return;token++;const current=token;graphType=options.graphType==='gold'?'gold':'damage';image=null;rect=null;start=null;context.clearRect(0,0,canvas.width,canvas.height);get('cropRead').disabled=true;champions=options.champions||[];onApply=options.onApply;invalidate();
  get('captureTitle').textContent=graphType==='gold'?'골드 차이 캡처 영역 선택':'딜량 캡처 영역 선택';get('captureSteps').textContent=graphType==='gold'?'① 축까지 포함해 영역 선택 → ② 그래프 인식 → ③ 미리보기 확인 후 적용':'① 이미지에서 드래그해 영역 선택 → ② 숫자 읽기 → ③ 10명 확인 후 적용';get('captureGuide').innerHTML=graphType==='gold'?goldGuide:damageGuide;goldOptions.hidden=graphType!=='gold';get('cropGoldDuration').value='';get('cropGoldGrid').value=options.goldPerGrid||2000;get('cropGoldInvert').checked=!!options.invert;get('cropRead').textContent=graphType==='gold'?'선택 영역 그래프 인식':'선택 영역 숫자 읽기';canvas.setAttribute('aria-label',graphType==='gold'?'골드 그래프 영역 선택':'딜량 영역 선택');status('이미지를 불러오는 중…');dialog.showModal();
  try{
   if(graphType==='damage'&&!champions.length){const response=await fetch('/api/champion-list');const list=await response.json();if(!response.ok||!Array.isArray(list))throw Error('한글 챔피언 목록을 읽지 못했어요. 다시 열어주세요.');champions=list}
   if(current!==token)return;
   const source=URL.createObjectURL(file);
   let loadedImage;
   try{loadedImage=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('이미지를 열 수 없습니다.'));img.src=source})}finally{URL.revokeObjectURL(source)}
   if(current!==token)return;
   image=loadedImage;
   const scale=Math.min(1,Math.min(1000,innerWidth*.85)/image.naturalWidth,Math.max(160,innerHeight*.46)/image.naturalHeight);canvas.width=Math.round(image.naturalWidth*scale);canvas.height=Math.round(image.naturalHeight*scale);
   rect={x:0,y:0,w:canvas.width,h:canvas.height};draw();status(graphType==='gold'?'드래그해서 그래프 전체·왼쪽 골드 눈금·아래 시간 눈금을 포함하세요. 이미 잘라둔 그래프라면 전체 선택으로 인식하세요.':'이미지에서 드래그해 딜량 영역을 선택하세요. 이미 잘라둔 그래프라면 전체 선택 그대로 읽으면 됩니다.');
  }catch(e){if(current===token)status(e.message)}finally{if(current===token)get('cropRead').disabled=!image}
 }
 return {open};
})();
