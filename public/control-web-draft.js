(()=>{
  const card=document.createElement('div');card.className='card full';card.innerHTML=`<h2>웹 대회 밴픽 · 롤 클라이언트 없이 진행</h2><p class="hint">방 생성은 현재 밴픽을 초기화합니다. 팀명·선수명·로고는 유지합니다. 웹 모드 중에는 롤 자동 연결이 밴픽을 덮어쓰지 않습니다.</p><div class="fields"><div class="field"><label>한 턴 시간 (초)</label><input id="webTurnSeconds" type="number" min="10" max="120" value="30"></div><div class="field wide"><label>참가자가 접속할 서버 주소</label><input id="webBaseUrl" placeholder="예: https://대회서버주소 또는 http://서버PC주소:3197"></div></div><div class="actions"><button class="btn primary" data-web="create">새 방 생성</button><button class="btn" data-web="links">접속 링크 보기</button><button class="btn" data-web="pause">일시정지</button><button class="btn" data-web="resume">재개</button><button class="btn danger" data-web="close">웹 모드 종료</button></div><p id="webDraftStatus" role="status"></p><div id="webDraftLinks"></div><p class="hint">양 팀 준비 완료 → 5밴/5픽 → 팀별 자리 교환. 시간 종료 시 선택 중인 챔피언을 자동 확정하며, 빈 밴은 건너뜁니다. 빈 픽은 일시정지합니다. 팀 링크는 해당 팀에만 전달하세요. 관전자는 기존 draft.html 주소를 OBS에서 사용합니다.</p>`;
  card.querySelectorAll('.hint').forEach(hint=>hint.textContent=hint.textContent.replace('빈 픽은 일시정지합니다.','빈 픽은 랜덤 확정합니다.').replace('시간 종료 시 선택 중인 챔피언을 자동 확정하며, 빈 밴은 건너뜁니다.','밴 시간 종료 시 미확정 밴은 밴 없음으로 넘깁니다. 픽 시간 종료 시 선택 중인 챔피언은 확정합니다.'));
  document.querySelector('.control-grid').prepend(card);const el=id=>card.querySelector('#'+id);el('webBaseUrl').value=location.origin;let links=null,busy=false;
  const series=document.createElement('div');series.className='card';series.innerHTML=`<h3>BO3 / BO5 하드 피어리스 · RoFS</h3><p class="hint">1세트 코인토스 결과와 양 팀의 선택을 입력하세요. 다음 세트는 직전 경기 진영을 기준으로 승리 팀과 패배 팀의 RoFS 선택을 입력합니다. 새 세트마다 새 팀 링크를 전달하세요.</p><div class="fields"><div class="field"><label>직전 세트 승리 팀</label><select id="seriesWinner"><option value="blue">직전 블루팀</option><option value="red">직전 레드팀</option></select></div><div class="field"><label>RoFS 보유 팀</label><select id="seriesRofs"><option value="blue">현재 블루팀</option><option value="red">현재 레드팀</option></select></div><div class="field"><label>RoFS 선택 항목</label><select id="seriesCategory"><option value="side">진영 선택</option><option value="pick">선후픽 선택</option></select></div><div class="field"><label>RoFS 팀의 선택</label><select id="seriesSelection"></select></div><div class="field"><label>상대 팀의 선택</label><select id="seriesOpponent"></select></div></div><div class="actions"><button class="btn primary" id="seriesStart">새 피어리스 시리즈 시작</button><button class="btn" id="seriesNext">경기 결과 저장 · 다음 세트</button></div><p id="seriesStatus" role="status"></p>`;card.append(series);
  series.querySelector('.hint').textContent='1세트는 코인토스 승리 팀을 RoFS 보유 팀으로 선택하세요. 다음 세트는 승리 팀과 RoFS 보유 팀의 이름을 선택하세요. 새 세트마다 새 팀 링크를 전달하세요.';
  const progress=document.createElement('p');
  progress.className='hint';
  progress.setAttribute('role','status');
  series.querySelector('h3').after(progress);
  let teamSignature='',roomKey=null,currentRoom;
  const formFields=['seriesWinner','seriesRofs','seriesCategory','seriesSelection','seriesOpponent','webTurnSeconds'];
  const formKey=room=>'hud.series-form.'+room;
  function saveForm() {
    if(!currentRoom)return;
    try{sessionStorage.setItem(formKey(currentRoom),JSON.stringify(Object.fromEntries(formFields.map(id=>[id,el(id).value]))));}catch(_){}
  }
  function seriesChoices(){
    const side=el('seriesCategory').value==='side';
    el('seriesSelection').innerHTML=side?'<option value="blue">블루 진영</option><option value="red">레드 진영</option>':'<option value="first">선픽</option><option value="second">후픽</option>';
    el('seriesOpponent').innerHTML=side?'<option value="first">선픽</option><option value="second">후픽</option>':'<option value="blue">블루 진영</option><option value="red">레드 진영</option>';
  }
  el('seriesCategory').addEventListener('change',seriesChoices);
  formFields.forEach(id=>el(id).addEventListener('change',saveForm));
  seriesChoices();
  function restoreForm(room,seconds) {
    let draft={};
    if(room)try{draft=JSON.parse(sessionStorage.getItem(formKey(room)))||{};}catch(_){}
    el('seriesWinner').value=draft.seriesWinner||'';
    el('seriesRofs').value=draft.seriesRofs||'';
    el('seriesCategory').value=draft.seriesCategory==='pick'?'pick':'side';
    seriesChoices();
    for(const id of ['seriesSelection','seriesOpponent']) {
      if(Array.from(el(id).options).some(option=>option.value===draft[id])) el(id).value=draft[id];
    }
    el('webTurnSeconds').value=Number(draft.webTurnSeconds)||seconds||30;
  }
  async function recoverLinks(room) {
    try {
      const response=await fetch('/api/web-draft/links',{cache:'no-store'});
      const data=await response.json();
      if(!response.ok)throw Error(data.error||'팀 링크를 불러오지 못했습니다.');
      if(data.room!==room||HUD.state?.webDraft?.room!==room||!HUD.state.webDraft.enabled)return;
      links=data.links;
      showLinks();
    } catch(error) {
      if(currentRoom===room) el('webDraftStatus').textContent=error.message;
    }
  }
  function renderTeams(s) {
    if(!s?.blue||!s?.red)return;
    const w=s.webDraft,room=w?.room||null;
    const names=[String(s.blue.name||'').trim()||'이름 미입력 · 블루',String(s.red.name||'').trim()||'이름 미입력 · 레드'];
    if(names[0]===names[1]){names[0]+=' · 블루';names[1]+=' · 레드';}
    const signature=JSON.stringify(names);
    if(signature!==teamSignature){
      teamSignature=signature;
      for(const id of ['seriesWinner','seriesRofs']){
        const select=el(id),value=select.value;
        select.replaceChildren(new Option('팀 선택',''),new Option(names[0],'blue'),new Option(names[1],'red'));
        select.value=['blue','red'].includes(value)?value:'';
      }
    }
    if(currentRoom!==room){currentRoom=room;restoreForm(room,w?.turnSeconds);}
    const key=room&&w.enabled?room:'';
    if(roomKey!==key){
      roomKey=key;
      links=null;
      showLinks();
      if(key)recoverLinks(room);
    }
    const seriesState=s.fearless;
    const inSeries=Boolean(seriesState?.active&&!seriesState.complete);
    const saved=seriesState?.games?.length||0;
    const status=seriesState?.active
      ? `${seriesState.complete?'시리즈 종료':`${s.event?.game||saved+1}세트 · ${w?.status==='suspended'?'중단됨':s.draft?.phase||'진행 대기'}`} · ${names[0]} ${s.blue.score||0} : ${s.red.score||0} ${names[1]} · 저장된 세트 ${saved}개`
      : '피어리스 시리즈 대기 중';
    if(progress.textContent!==status)progress.textContent=status;
    el('seriesStart').textContent=inSeries?'새 시리즈로 초기화':'새 피어리스 시리즈 시작';
    el('seriesNext').disabled=!inSeries||!w?.enabled||w.status!=='complete';
    el('seriesNext').textContent=finishesSeries(s)?'경기 결과 저장 · 시리즈 종료':'경기 결과 저장 · 다음 세트';
    card.querySelector('[data-web="close"]').textContent=inSeries?'시리즈 중단':'웹 모드 종료';
    card.querySelector('[data-web="close"]').disabled=!w?.enabled||w.status==='suspended';
    card.querySelector('[data-web="pause"]').disabled=!w?.enabled||!['running','finished'].includes(w.status);
    const resume=card.querySelector('[data-web="resume"]');
    resume.textContent=w?.status==='suspended'||(w&&!w.enabled&&inSeries)?'시리즈 이어하기':'재개';
    resume.disabled=!w||(!w.enabled&&!inSeries)||(w.enabled&&!['paused','suspended'].includes(w.status));
    undo.disabled=!(seriesState?.undo&&
      (seriesState.complete||w?.status==='lobby'||w?.suspendedFrom==='lobby'));
  }
  function finishesSeries(s) {
    const winner=el('seriesWinner').value;
    const needed=Number(s.fearless?.bestOf??s.event?.bestOf)===3?2:3;
    return Boolean(winner&&Number(s[winner].score||0)+1>=needed);
  }
  window.WebDraftControls={render:renderTeams};
  el('seriesWinner').addEventListener('change',()=>{if(HUD.state)renderTeams(HUD.state);});
  async function seriesAction(action){
    const s=HUD.state;
    if(busy||!s)return;
    const room=s.webDraft?.room,starting=action==='series-create',ending=!starting&&finishesSeries(s);
    const winner=el('seriesWinner').value,rofsSide=el('seriesRofs').value;
    if((!starting&&!winner)||(!ending&&!rofsSide)){
      el('seriesStatus').textContent=starting?'코인토스에서 이긴 RoFS 보유 팀을 선택하세요.':'승리 팀과 RoFS 보유 팀을 선택하세요.';
      return;
    }
    const prompt=starting?'새 시리즈를 시작하고 기존 시리즈 기록과 세트 스코어를 초기화할까요?'
      :`${s[winner].name||winner} 승리로 저장하고 ${ending?'시리즈를 종료':'다음 세트를 시작'}할까요?`;
    if(!confirm(prompt))return;
    busy=true;
    try{
      const body={action,room,replaceRoom:starting?room:undefined,
        bestOf:s.event?.bestOf,seconds:Number(el('webTurnSeconds').value),
        winner,rofsSide,category:el('seriesCategory').value,selection:el('seriesSelection').value,opponent:el('seriesOpponent').value};
      const response=await fetch('/api/web-draft/admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const data=await response.json();
      if(!response.ok)throw Error(data.error);
      links=data.links;showLinks();
      el('seriesStatus').textContent=ending?'시리즈 결과를 저장했습니다.':'새 세트의 팀 링크를 전달하세요.';
    }catch(error){el('seriesStatus').textContent=error.message;}
    finally{busy=false;}
  }
  el('seriesStart').addEventListener('click',()=>seriesAction('series-create'));el('seriesNext').addEventListener('click',()=>seriesAction('next-set'));
  const undo=document.createElement('button');undo.className='btn';undo.textContent='직전 세트 결과 되돌리기';series.querySelector('.actions').append(undo);undo.addEventListener('click',async()=>{if(busy||!confirm('직전 세트 결과를 되돌릴까요? 다음 세트 밴픽 시작 전 또는 시리즈 종료 직후에만 가능합니다.'))return;busy=true;try{const response=await fetch('/api/web-draft/admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'undo-set',room:HUD.state?.webDraft?.room})});const data=await response.json();if(!response.ok)throw Error(data.error);links=data.links;showLinks();el('seriesStatus').textContent='결과를 되돌렸습니다. 승리 팀과 RoFS를 다시 입력하세요.'}catch(error){el('seriesStatus').textContent=error.message}finally{busy=false}});
  function showLinks(){if(!links){el('webDraftLinks').replaceChildren();return;}let base;try{base=new URL(el('webBaseUrl').value);if(!['http:','https:'].includes(base.protocol))throw Error();}catch(_){el('webDraftStatus').textContent='올바른 서버 주소를 입력하세요.';return}
    el('webDraftLinks').innerHTML=[['blue','블루팀'],['red','레드팀'],['observer','관전자 / OBS']].filter(([side])=>side==='observer'||links[side]).map(([side,label])=>{const url=base.origin+(links[side]||'/draft.html');return `<p style="overflow-wrap:anywhere"><strong>${label}</strong> · <a href="${HUD.escape(url)}" target="_blank" rel="noopener noreferrer">${HUD.escape(url)}</a></p>`}).join('');}
  el('webBaseUrl').addEventListener('change',showLinks);
  const publicControls=document.createElement('div');publicControls.className='actions';publicControls.innerHTML='<button class="btn primary" id="startPublicDraft">외부 접속 시작</button><button class="btn danger" id="stopPublicDraft">외부 접속 종료</button><span id="publicDraftStatus" role="status">외부 연결 확인 중…</span>';card.querySelector('.actions').after(publicControls);
  const cloudflareGuide=document.createElement('p');cloudflareGuide.className='hint';cloudflareGuide.hidden=true;cloudflareGuide.innerHTML='Cloudflare 공식 페이지에서 Windows 64-bit 실행 파일을 받은 뒤 이름을 <strong>cloudflared.exe</strong>로 바꾸고 프로그램 폴더의 <strong>runtime</strong> 폴더에 넣어주세요. 그런 다음 외부 접속 시작을 다시 누르세요. <a href="https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/" target="_blank" rel="noopener noreferrer">다운로드 페이지 열기</a>';publicControls.after(cloudflareGuide);
  const startPublic=el('startPublicDraft'),stopPublic=el('stopPublicDraft');let publicBusy=false,lastPublicUrl='',publicInfo={running:false};
  function drawPublic(){startPublic.disabled=publicBusy||publicInfo.running;stopPublic.disabled=publicBusy||!publicInfo.running||publicInfo.stopping;el('publicDraftStatus').textContent=publicInfo.stopping?'외부 접속 종료 중…':publicInfo.ready?'외부 접속 가능 · 임시 HTTPS':publicInfo.running?'외부 주소 생성 중…':publicInfo.error?'외부 접속 꺼짐 · '+publicInfo.error:'외부 접속 꺼짐';}
  async function refreshPublic(){try{const response=await fetch('/api/web-draft/public-status');if(!response.ok)throw Error();publicInfo=await response.json();drawPublic();if(publicInfo.ready&&publicInfo.url){lastPublicUrl=publicInfo.url;if(el('webBaseUrl').value!==publicInfo.url){el('webBaseUrl').value=publicInfo.url;showLinks()}}else if(!publicInfo.running&&lastPublicUrl&&el('webBaseUrl').value===lastPublicUrl){el('webBaseUrl').value=location.origin;lastPublicUrl='';showLinks()}}catch(_){startPublic.disabled=true;stopPublic.disabled=true;el('publicDraftStatus').textContent='외부 연결 상태 확인 실패 · 서버 연결을 확인하세요.'}}
  refreshPublic();setInterval(refreshPublic,1500);
  async function togglePublic(action){if(publicBusy)return;if(action==='start'&&publicInfo.cloudflaredInstalled===false){cloudflareGuide.hidden=false;el('webDraftStatus').textContent='Cloudflare 연결 도구가 없어 다운로드 안내를 열었어요.';window.open('https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/','_blank','noopener,noreferrer');return}const prompt=action==='start'?'Cloudflare 임시 HTTPS로 팀명·선수명·로고·밴픽 현황을 공개할까요? 팀 조작은 전용 링크로만 가능하며 진행자 화면은 공개하지 않습니다.':'외부 참가자 연결을 종료할까요? 로컬 HUD와 밴픽 데이터는 유지됩니다.';if(!confirm(prompt))return;publicBusy=true;drawPublic();try{const response=await fetch('/api/web-draft/public-'+action,{method:'POST'}),data=await response.json();if(!response.ok)throw Error(data.error||'외부 연결을 변경하지 못했습니다.');cloudflareGuide.hidden=true;el('webDraftStatus').textContent=action==='start'?'외부 주소 생성 요청 완료. 주소가 표시되면 접속 링크 보기를 눌러주세요.':'외부 연결 종료를 요청했습니다.';}catch(error){el('webDraftStatus').textContent=error.message;await refreshPublic();if(action==='start'&&publicInfo.cloudflaredInstalled===false)cloudflareGuide.hidden=false}finally{publicBusy=false;await refreshPublic()}}
  startPublic.addEventListener('click',()=>togglePublic('start'));stopPublic.addEventListener('click',()=>togglePublic('stop'));
  card.addEventListener('click',async event=>{const button=event.target.closest('[data-web]');if(!button||busy)return;const action=button.dataset.web;
    if(action==='links'){if(currentRoom)await recoverLinks(currentRoom);return;}
    if(action==='create'&&!confirm('현재 밴픽을 비우고 새 웹 밴픽 방을 생성할까요? 이전 팀 링크는 만료됩니다.'))return;
    if(action==='close'){
      const series=HUD.state?.fearless;
      const prompt=series?.active&&!series.complete
        ?'밴픽을 잠시 중단할까요? 같은 팀 링크로 이어갈 수 있습니다.'
        :'웹 밴픽 방을 종료할까요?';
      if(!confirm(prompt))return;
    }
    busy=true;button.disabled=true;try{const response=await fetch('/api/web-draft/admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,room:HUD.state?.webDraft?.room,seconds:Number(el('webTurnSeconds').value)})});const data=await response.json();if(!response.ok)throw Error(data.error);links=data.links;showLinks();el('webDraftStatus').textContent=action==='create'?'방 생성 완료. 팀 전용 링크를 전달하세요.':'적용 완료.';}catch(error){el('webDraftStatus').textContent=error.message}finally{busy=false;button.disabled=false;if(HUD.state)renderTeams(HUD.state);}});
  renderTeams(HUD.state);
})();
