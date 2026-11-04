function teamCanvasLayout(width,height){const scale=Math.max(0,Math.min(width/1920,height/1080));return {scale,left:Math.max(0,(width-1920*scale)/2),top:0};}
window.DraftTeam=(()=>{
  const team=new URLSearchParams(location.search).get('team');if(!['blue','red'].includes(team))return {render(){}};
  const token=location.hash.slice(1);let state=null,champions=[],queue=Promise.resolve(),selected=0,lastTurn='',busy=false,pendingHover=null,hoverBusy=false;
  document.body.classList.add('team-mode');
  document.documentElement.classList.add('team-overlay');
  const viewport=document.createElement('div');viewport.className='team-viewport';const canvas=document.createElement('div');canvas.className='team-canvas';viewport.append(canvas);document.body.append(viewport);canvas.append(document.querySelector('#app'));
  const panel=document.createElement('section');panel.className='team-picker';panel.innerHTML=`<div class="picker-toolbar"><strong id="teamTitle"></strong><span id="teamStatus"></span><input id="championSearch" placeholder="챔피언 검색 (한글 / 영문)" aria-label="챔피언 검색"></div><div id="teamMessage" role="status"></div><div class="champion-grid"></div><div class="picker-actions"><span id="selectedChampion">챔피언을 선택하세요</span><button id="teamReady">준비 완료</button><button id="teamLock">선택 확정</button></div>`;canvas.append(panel);
  const el=id=>panel.querySelector('#'+id),message=text=>el('teamMessage').textContent=text;
  function fit(){const box=viewport.getBoundingClientRect(),visible=window.visualViewport;const layout=teamCanvasLayout(Math.min(box.width,visible?.width||box.width),Math.min(box.height,visible?.height||box.height));canvas.style.transform=`scale(${layout.scale})`;canvas.style.left=layout.left+'px';canvas.style.top=layout.top+'px';}
  addEventListener('resize',fit);window.visualViewport?.addEventListener('resize',fit);if(window.ResizeObserver)new ResizeObserver(fit).observe(viewport);requestAnimationFrame(fit);fit();
  const available=()=>state?.webDraft?.enabled&&state.webDraft.status==='running'&&state.webDraft.action?.side===team;
  function used(id){return (state.fearless?.games||[]).some(game=>game.picks.includes(id))||['blue','red'].some(side=>state.draft[side+'Bans'].includes(id)||state.draft[side+'Picks'].some(p=>p.id===id&&p.locked))}
  function drawGrid(){const query=el('championSearch').value.trim().toLowerCase();panel.querySelector('.champion-grid').innerHTML=champions.filter(c=>(c.name+' '+c.english).toLowerCase().includes(query)).map(c=>`<button class="champion-choice ${c.id===selected?'selected':''}" data-id="${c.id}" ${!available()||used(c.id)?'disabled':''}><img src="${HUD.icon(c.id)}" loading="lazy" alt=""><span>${HUD.escape(c.name)}</span></button>`).join('');}
  async function send(action,extra={},turn=state?.webDraft){if(!turn)throw Error('진행자가 웹 밴픽 방을 생성해야 합니다.');const response=await fetch('/api/web-draft/action',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action,room:turn.room,step:turn.step,...extra})});const data=await response.json();if(!response.ok)throw Error(data.error||'연결 오류');message('');HUD.refresh();}
  function queueHover(id,turn){pendingHover={id,turn};if(hoverBusy)return;hoverBusy=true;queue=(async()=>{while(pendingHover){const next=pendingHover;pendingHover=null;try{await send('hover',{id:next.id},next.turn)}catch(error){message(error.message)}}})().finally(()=>{hoverBusy=false});}
  panel.querySelector('.champion-grid').addEventListener('click',event=>{const button=event.target.closest('button[data-id]');if(!button||button.disabled||busy)return;const id=Number(button.dataset.id);selected=id;const turn={...state.webDraft};panel.querySelectorAll('.champion-choice').forEach(choice=>choice.classList.toggle('selected',Number(choice.dataset.id)===id));el('selectedChampion').textContent=champions.find(c=>c.id===id)?.name||'';queueHover(id,turn);});
  // Capture the clicked ID rather than the latest selection when queued requests run.
  el('championSearch').addEventListener('input',drawGrid);
  for(const [id,action] of [['teamReady','ready'],['teamLock','lock']])el(id).addEventListener('click',async()=>{if(busy)return;const turn=state?.webDraft?{...state.webDraft}:null;busy=true;render(state);try{await queue;await send(action,{},turn);}catch(error){message(error.message)}finally{busy=false;render(state)}});
  const app=document.querySelector('#app');let drag=null;
  const swapEnabled=()=>!busy&&state?.webDraft?.enabled&&state.webDraft.status==='finished';
  const ownCard=target=>target?.closest?.(`.draft-side.${team} .pick`);
  function clearDrag(){app.querySelectorAll('.drag-source,.drag-target').forEach(card=>card.classList.remove('drag-source','drag-target'));drag=null;}
  app.addEventListener('dragstart',event=>{if(ownCard(event.target))event.preventDefault()});
  app.addEventListener('pointerdown',event=>{const card=ownCard(event.target);if(!card||!swapEnabled()||event.button!==0)return;const from=Number(card.dataset.swapIndex);drag={from,fromId:state.draft[team+'Picks'][from].id,room:state.webDraft.room,pointer:event.pointerId,x:event.clientX,y:event.clientY,moved:false};app.setPointerCapture(event.pointerId);event.preventDefault()});
  app.addEventListener('pointermove',event=>{if(!drag||drag.pointer!==event.pointerId)return;if(Math.hypot(event.clientX-drag.x,event.clientY-drag.y)>6)drag.moved=true;if(!drag.moved)return;app.querySelectorAll('.drag-target').forEach(card=>card.classList.remove('drag-target'));const from=app.querySelector(`.draft-side.${team} .pick[data-swap-index="${drag.from}"]`);from?.classList.add('drag-source');const target=ownCard(document.elementFromPoint(event.clientX,event.clientY));if(target&&Number(target.dataset.swapIndex)!==drag.from)target.classList.add('drag-target');event.preventDefault()});
  app.addEventListener('pointerup',async event=>{if(!drag||drag.pointer!==event.pointerId)return;const gesture=drag,target=ownCard(document.elementFromPoint(event.clientX,event.clientY)),to=target?Number(target.dataset.swapIndex):-1;clearDrag();if(app.hasPointerCapture(event.pointerId))app.releasePointerCapture(event.pointerId);if(!gesture.moved||to<0||to===gesture.from||!swapEnabled()||gesture.room!==state.webDraft.room)return;const toId=state.draft[team+'Picks'][to].id;busy=true;render(state);try{await send('swap',{from:gesture.from,to,fromId:gesture.fromId,toId});message('픽 위치를 교환했습니다.')}catch(error){message(error.message)}finally{busy=false;render(state)}});
  app.addEventListener('pointercancel',clearDrag);app.addEventListener('lostpointercapture',clearDrag);
  function render(s){state=s;if(!s)return;const w=s.webDraft,turn=w?.room+':'+w?.step;if(turn!==lastTurn){selected=0;lastTurn=turn;drawGrid()}
    el('teamTitle').textContent=s[team].name+' · '+(team==='blue'?'블루':'레드');
    const own=available();el('teamStatus').textContent=!w?.enabled?'웹 밴픽 방 대기':w.status==='lobby'?'양 팀 준비 대기':w.status==='finished'?'자리 교환 · '+s.draft.timer+'초 남음':w.status==='complete'?'교환 종료 · 밴픽 확정':w.status==='paused'?'일시정지':own?(w.action.type==='ban'?'우리 팀 밴 차례':'우리 팀 픽 차례'):'상대 팀 선택 중';
    el('teamReady').hidden=w?.status!=='lobby';el('teamReady').disabled=busy||!!w?.ready?.[team];
    el('teamLock').hidden=!own;el('teamLock').disabled=busy||!w?.hover;el('teamLock').textContent=w?.action?.type==='ban'?'밴 확정':'픽 확정';
    app.querySelectorAll(`.draft-side.${team} .pick`).forEach((card,index)=>{card.dataset.swapIndex=index;card.classList.toggle('swap-card',swapEnabled());card.title=swapEnabled()?'다른 자기 팀 픽 카드로 드래그하여 교환':'';});
    if(w?.status==='finished')el('selectedChampion').textContent='자기 팀 픽 카드를 드래그하여 자리 교환';
    if(w?.status==='complete')el('selectedChampion').textContent='교환 시간이 종료됐습니다.';
    if(w?.notice)message(w.notice);
    // Only update disabled state on ticks; keep search and scroll position intact.
    panel.querySelectorAll('.champion-choice').forEach(button=>button.disabled=busy||!own||used(Number(button.dataset.id)));
    if(w?.hover&&own&&!hoverBusy){selected=w.hover;el('selectedChampion').textContent=champions.find(c=>c.id===selected)?.name||'';panel.querySelectorAll('.champion-choice').forEach(button=>button.classList.toggle('selected',Number(button.dataset.id)===selected))}
  }
  Promise.all([fetch('/api/champion-list').then(r=>{if(!r.ok)throw Error('챔피언 목록을 불러오지 못했습니다.');return r.json()}),fetch('/api/champion-list?lang=en').then(r=>r.json())]).then(([ko,en])=>{champions=ko.map(c=>({...c,english:en.find(e=>e.id===c.id)?.name||''}));drawGrid();render(state)}).catch(error=>message(error.message));
  if(!token)message('팀 전용 링크로 접속하세요.');
  return {render};
})();
