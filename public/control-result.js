window.ResultControls=(()=>{
 const card=document.createElement('div');card.className='card full';
 card.innerHTML='<h2>경기 결과 화면</h2><div class="fields"><div class="field"><label>승리 팀</label><select id="resultWinner"><option value="">선택 전</option><option value="blue">블루팀 승리</option><option value="red">레드팀 승리</option></select></div><div class="field"><label>딜량 그래프 이미지 · PNG / JPG / WebP</label><input id="resultDamageFile" type="file" accept="image/png,image/jpeg,image/webp"></div></div><div class="actions"><button id="captureResult" class="btn primary">현재 경기 결과 저장</button><a class="btn" href="/result.html" target="_blank">결과 화면 열기</a><button id="removeResultImage" class="btn">딜량 이미지 지우기</button></div><p id="resultStatus" class="hint"></p><img id="resultImagePreview" style="display:none;max-width:100%;max-height:180px;object-fit:contain"><p class="hint">경기 종료 후 결과를 저장하고, 챔피언별 딜량 그래프 부분을 잘라 이미지를 올리세요. 저장된 통계는 다음 경기로 넘어가도 유지됩니다. 처음 이미지를 올릴 때 저장된 결과가 없으면 현재 통계를 자동 저장합니다.</p><details><summary style="cursor:pointer;font-size:12px;color:#aab5c8">결과 통계 보정</summary><div id="resultEditFields" class="fields" style="margin-top:14px"></div></details>';
 document.querySelector('.control-grid').appendChild(card);
 card.querySelector('#resultImagePreview').nextElementSibling.textContent='경기 종료 후 통계를 저장하고 딜량 이미지를 선택하세요. 전체 스크린샷도 올릴 수 있습니다. 영역 지정 → 숫자 읽기 → 10명 확인 후 적용 순서로 진행하며, 적용 전에는 기존 결과창이 유지됩니다.';
 const reanalyze=document.createElement('button');reanalyze.className='btn';reanalyze.textContent='딜량 이미지 다시 읽기';card.querySelector('.actions').appendChild(reanalyze);
 reanalyze.onclick=async()=>{
  uploading=true;reanalyze.disabled=true;status('딜량 숫자를 다시 읽는 중…');
  try{const response=await fetch('/api/result-analyze',{method:'POST'}),result=await response.json();if(!result.ok)throw Error(result.error);status(result.analysisError||'딜량 10명 재인식 완료')}catch(e){status(e.message)}finally{uploading=false;reanalyze.disabled=false}
 };
 const damageEditor=document.createElement('details');damageEditor.innerHTML='<summary>딜량 · 챔피언 · 선수명 보정</summary><div id="damageEditRows"></div>';card.appendChild(damageEditor);
 let editorSignature='',championOptions='',champions=[];
 fetch('/api/champion-list').then(r=>r.json()).then(data=>{champions=Array.isArray(data)?data:[];championOptions=champions.map(c=>'<option value="'+c.id+'">'+HUD.escape(c.name)+'</option>').join('');editorSignature='';render(HUD.state)}).catch(()=>{});
 const byId=id=>document.getElementById(id);
 const fields=[['clock','경기 시간','text'],['blueKda','블루 K/D/A','text'],['redKda','레드 K/D/A','text'],['blueGold','블루 골드','text'],['redGold','레드 골드','text'],['blueTowers','블루 포탑','number'],['redTowers','레드 포탑','number'],['blueHeralds','블루 전령','number'],['redHeralds','레드 전령','number'],['blueElders','블루 장로','number'],['redElders','레드 장로','number'],['blueBarons','블루 바론','number'],['redBarons','레드 바론','number']];
 fields.splice(fields.findIndex(([key])=>key==='blueHeralds'),0,['blueGrubs','블루 유충','number'],['redGrubs','레드 유충','number']);
 byId('resultEditFields').innerHTML=fields.map(([key,label,type])=>'<div class="field"><label>'+label+'</label><input data-result-field="'+key+'" type="'+type+'" '+(type==='number'?'min="0"':'')+'></div>').join('');
 let uploading=false,noticeUntil=0;
 const goldBox=document.createElement('div');goldBox.innerHTML='<h3>골드 차이 그래프 이미지</h3><p class="hint">시간 눈금, 골드 눈금과 0선이 보이도록 그래프를 캡처하세요. 이미지를 그대로 붙이지 않고 선을 읽어 다시 그립니다. 이미지 복원 값은 근사치입니다.</p><div class="fields"><div class="field"><label>골드 그래프 이미지</label><input id="resultGoldFile" type="file" accept="image/png,image/jpeg,image/webp"></div><div class="field"><label>눈금 한 칸의 골드 (기본 2000)</label><input id="goldGridValue" type="number" min="100" step="100" value="2000"></div><div class="field"><label>그래프 경기 길이 (분:초 · 자동 감지 후 보정)</label><input id="goldGraphDuration" placeholder="예: 29:00"></div><div class="field"><label><input id="goldGraphInvert" type="checkbox"> 블루 / 레드 골드 차이 반대로 표시</label></div></div><div class="actions"><button class="btn" id="clearGoldGraph">업로드 골드 그래프 지우기</button></div><p id="goldGraphStatus" class="hint"></p>';card.appendChild(goldBox);
 byId('resultGoldFile').onchange=async()=>{
  const file=byId('resultGoldFile').files[0];if(!file)return;
  if(!/^image\/(png|jpeg|webp)$/.test(file.type)||file.size>25*1024*1024){byId('goldGraphStatus').textContent='25MB 이하 이미지 파일을 선택하세요.';return}
  byId('resultGoldFile').disabled=true;
  try{await ResultCapture.open(file,{graphType:'gold',goldPerGrid:Number(byId('goldGridValue').value)||2000,invert:byId('goldGraphInvert').checked,onApply:text=>byId('goldGraphStatus').textContent=text});}
  catch(e){byId('goldGraphStatus').textContent=e.message}finally{byId('resultGoldFile').disabled=false;byId('resultGoldFile').value=''}
 };
 const goldGuide=document.createElement('div');goldGuide.className='capture-guide';goldGuide.innerHTML='<strong>골드 그래프 스크린샷 가이드</strong><p>① 그래프 처음부터 끝까지 ② 왼쪽 골드 눈금과 0선 ③ 아래 시간 숫자 최소 2개를 함께 캡처하세요.</p><p>게임 화면 전체를 올려도 파일 선택 후 영역을 직접 지정할 수 있습니다. 영역 인식 → 복원 미리보기 → 확인 후 적용 순서이며, 실패하거나 닫으면 기존 결과는 유지됩니다. 시간 숫자가 잘렸으면 분석창에서 그래프 끝 시간을 입력하세요.</p>';goldBox.querySelector('p.hint').after(goldGuide);
 for(const id of ['goldGridValue','goldGraphDuration','goldGraphInvert'])byId(id).onchange=async()=>{
  if(!HUD.state.result?.goldData)return;
  const data=structuredClone(HUD.state.result.goldData),time=byId('goldGraphDuration').value.match(/^(\d{1,3}):([0-5]\d)$/);
  if(!time){byId('goldGraphStatus').textContent='경기 길이는 분:초로 입력하세요. 예: 29:00';return}
  data.durationOverride=Number(time[1])*60+Number(time[2]);data.goldPerGridOverride=Math.max(100,Number(byId('goldGridValue').value)||2000);data.invert=byId('goldGraphInvert').checked;
  try{await update({result:{goldData:data}})}catch(e){status(e.message)}
 };
 byId('clearGoldGraph').onclick=async()=>{try{await update({result:{goldData:null,goldImage:''}});byId('goldGraphStatus').textContent='업로드 골드 그래프를 지웠어요.'}catch(e){status(e.message)}};
 function status(text,keep=true){byId('resultStatus').textContent=text;if(keep)noticeUntil=Date.now()+5000}
 async function update(patch){const response=await HUD.update(patch);if(!response.ok)throw Error(response.error||'결과 저장 실패');return response}
 byId('resultWinner').onchange=async()=>{try{await update({result:{winner:byId('resultWinner').value}})}catch(e){status(e.message)}};
 byId('captureResult').onclick=async()=>{try{await update({result:{snapshot:ResultCore.snapshot(HUD.state),winner:byId('resultWinner').value,damageImage:'',damageData:null,goldData:null,goldImage:''}});status('현재 경기 통계를 저장했어요. 딜량과 골드 차이 이미지를 올려주세요.')}catch(e){status(e.message)}};
 byId('removeResultImage').onclick=async()=>{try{await update({result:{damageImage:'',damageData:null}})}catch(e){status(e.message)}};
 byId('damageEditRows').addEventListener('change',async event=>{
  const input=event.target,side=input.dataset.side,index=Number(input.dataset.index),key=input.dataset.key;if(!side||!key)return;
  const data=structuredClone(HUD.state.result.damageData);const p=data[side][index];
  if(key==='id'){p.id=Number(input.value);p.name=champions.find(c=>c.id===p.id)?.name||p.name}
  else if(key==='damage'){p.damage=Math.max(0,Number(input.value)||0);p.estimated=false}
  else p.playerName=input.value;
  try{await update({result:{damageData:data}})}catch(e){status(e.message)}
 });
 byId('resultEditFields').addEventListener('change',async event=>{
   const key=event.target.dataset.resultField;if(!key)return;
   const snapshot=HUD.state.result?.snapshot?structuredClone(HUD.state.result.snapshot):ResultCore.snapshot(HUD.state);
   snapshot.game[key]=event.target.type==='number'?Math.max(0,Number(event.target.value)||0):event.target.value;
   try{await update({result:{snapshot}})}catch(e){status(e.message)}
 });
 function imageData(file){return new Promise((resolve,reject)=>{
   const source=URL.createObjectURL(file),image=new Image();
   image.onload=()=>{try{const ratio=Math.min(1,1800/image.naturalWidth,1400/image.naturalHeight),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(image.naturalHeight*ratio));const context=canvas.getContext('2d');context.fillStyle='#191827';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);resolve(canvas.toDataURL('image/jpeg',.94))}catch(e){reject(e)}finally{URL.revokeObjectURL(source)}};
   image.onerror=()=>{URL.revokeObjectURL(source);reject(Error('이미지를 읽을 수 없어요. PNG 또는 JPG로 다시 선택해주세요.'))};image.src=source;
 })}
 byId('resultDamageFile').onchange=async()=>{
   const file=byId('resultDamageFile').files[0];if(!file)return;
   if(!/^image\/(png|jpeg|webp)$/.test(file.type)||file.size>25*1024*1024){status('PNG/JPG/WebP 이미지(25MB 이하)를 선택해주세요.');return}
   try{await ResultCapture.open(file,{champions,onApply:status})}catch(e){status(e.message)}finally{byId('resultDamageFile').value=''}
 };
 function render(s){
   if(!s)return;
   const result=s.result||{},snapshot=result.snapshot||ResultCore.snapshot(s);
   const gd=result.goldData;if(gd){
    const seconds=Math.round(gd.durationOverride||gd.duration);
    if(document.activeElement!==byId('goldGraphDuration'))byId('goldGraphDuration').value=Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
    if(document.activeElement!==byId('goldGridValue'))byId('goldGridValue').value=gd.goldPerGridOverride||2000;
    byId('goldGraphInvert').checked=Boolean(gd.invert);
   }
   const editor=byId('damageEditRows');
   const nextEditorSignature=JSON.stringify(result.damageData||null);
   if(nextEditorSignature!==editorSignature&&!editor.contains(document.activeElement)){
    editorSignature=nextEditorSignature;
    editor.innerHTML=result.damageData?['blue','red'].map(side=>'<h3>'+(side==='blue'?'블루':'레드')+'</h3>'+result.damageData[side].map((p,i)=>{
     const attrs=' data-side="'+side+'" data-index="'+i+'" ';
     return '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin:8px 0"><select'+attrs+'data-key="id">'+(championOptions||'<option value="'+p.id+'">'+HUD.escape(p.name)+'</option>')+'</select><input'+attrs+'data-key="playerName" placeholder="선수명" value="'+HUD.escape(p.playerName||'')+'"><input'+attrs+'data-key="damage" type="number" min="0" value="'+(p.damage??'')+'"></div>';
    }).join('')).join(''):'<p class="hint">딜량 이미지를 올리면 보정 항목이 나타납니다.</p>';
    editor.querySelectorAll('select[data-side]').forEach(select=>select.value=String(result.damageData[select.dataset.side][Number(select.dataset.index)].id));
   }
   if(document.activeElement!==byId('resultWinner'))byId('resultWinner').value=result.winner||'';
   const preview=byId('resultImagePreview');preview.style.display=result.damageImage?'block':'none';if(result.damageImage&&preview.getAttribute('src')!==result.damageImage)preview.src=result.damageImage;
   for(const [key] of fields){const input=card.querySelector('[data-result-field="'+key+'"]');if(document.activeElement!==input)input.value=key==='blueKda'?ResultCore.kda(snapshot,'blue'):key==='redKda'?ResultCore.kda(snapshot,'red'):(snapshot.game[key]??'')}
   if(!uploading&&Date.now()>noticeUntil)status(result.snapshot?'저장된 결과: '+snapshot.event.name+' · GAME '+snapshot.event.game+' · '+snapshot.game.clock+(result.damageImage?' · 딜량 이미지 적용됨':' · 딜량 이미지 대기'):'아직 결과가 저장되지 않았어요. 경기 종료 후 현재 경기 결과 저장을 눌러주세요.',false);
 }
 return {render};
})();
