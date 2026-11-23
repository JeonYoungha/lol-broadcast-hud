function teamCanvasLayout(width,height){const scale=Math.max(0,Math.min(width/1920,height/1080));return {scale,left:Math.max(0,(width-1920*scale)/2),top:0};}
window.DraftTeam=(()=>{
  const query=new URLSearchParams(location.search),team=query.get('team');
  if(!['blue','red'].includes(team))return {render(){}};
  const token=location.hash.slice(1),linkedRoom=query.get('room');
  let state=null,champions=[],selected=0,lastTurn='',busy=false,pendingHover=null,hoverBusy=false;
  let selectedLocally=false,lastNotice='';
  document.body.classList.add('team-mode');
  document.documentElement.classList.add('team-overlay');
  const viewport=document.createElement('div');viewport.className='team-viewport';const canvas=document.createElement('div');canvas.className='team-canvas';viewport.append(canvas);document.body.append(viewport);canvas.append(document.querySelector('#app'));
  const panel=document.createElement('section');panel.className='team-picker';panel.innerHTML=`<div class="picker-toolbar"><strong id="teamTitle"></strong><span id="teamStatus"></span><input id="championSearch" placeholder="챔피언 검색 (한글 / 영문)" aria-label="챔피언 검색"></div><div id="teamMessage" role="status"></div><div class="champion-grid"></div><div class="picker-actions"><span id="selectedChampion">챔피언을 선택하세요</span><button id="teamReady">준비 완료</button><button id="teamLock">선택 확정</button></div>`;canvas.append(panel);
  const el=id=>panel.querySelector('#'+id),message=text=>el('teamMessage').textContent=text;
  const loadButton=document.createElement('button');
  loadButton.type='button';loadButton.textContent='챔피언 목록 다시 불러오기';loadButton.hidden=true;
  el('teamReady').before(loadButton);
  el('teamReady').disabled=el('teamLock').disabled=true;
  function fit(){const box=viewport.getBoundingClientRect(),visible=window.visualViewport;const layout=teamCanvasLayout(Math.min(box.width,visible?.width||box.width),Math.min(box.height,visible?.height||box.height));canvas.style.transform=`scale(${layout.scale})`;canvas.style.left=layout.left+'px';canvas.style.top=layout.top+'px';}
  addEventListener('resize',fit);window.visualViewport?.addEventListener('resize',fit);if(window.ResizeObserver)new ResizeObserver(fit).observe(viewport);requestAnimationFrame(fit);fit();
  const linkMatches=w=>Boolean(token&&w?.enabled&&(!linkedRoom||linkedRoom===w.room));
  const available=()=>linkMatches(state?.webDraft)&&state.webDraft.status==='running'&&state.webDraft.action?.side===team;
  const turnKey=w=>w?`${w.room}:${w.step}`:'';
  function used(id){return (state.fearless?.games||[]).some(game=>game.picks.includes(id))||['blue','red'].some(side=>state.draft[side+'Bans'].includes(id)||state.draft[side+'Picks'].some(p=>p.id===id&&p.locked))}
  function drawGrid(){const query=el('championSearch').value.trim().toLowerCase();panel.querySelector('.champion-grid').innerHTML=champions.filter(c=>(c.name+' '+c.english).toLowerCase().includes(query)).map(c=>`<button class="champion-choice ${c.id===selected?'selected':''}" data-id="${c.id}" ${!available()||used(c.id)?'disabled':''}><img src="${HUD.icon(c.id)}" loading="lazy" alt=""><span>${HUD.escape(c.name)}</span></button>`).join('');}
  async function send(action,extra={},turn=state?.webDraft) {
    if(!linkMatches(turn))throw Error('현재 세트의 팀 전용 링크로 접속하세요.');
    const response=await fetch('/api/web-draft/action',{
      method:'POST',signal:AbortSignal.timeout(4000),
      headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
      body:JSON.stringify({action,room:turn.room,step:turn.step,...extra})
    });
    const data=await response.json();
    if(!response.ok)throw Error(data.error||'연결 오류');
    HUD.refresh();
    return data;
  }
  async function queueHover(id,turn) {
    pendingHover={id,turn};
    if(hoverBusy)return;
    hoverBusy=true;
    try {
      while(pendingHover) {
        const next=pendingHover;pendingHover=null;
        if(!available()||lastTurn!==turnKey(next.turn)||busy)continue;
        try{await send('hover',{id:next.id},next.turn);}
        catch(error){
          if(!busy&&available()&&lastTurn===turnKey(next.turn)&&selected===next.id)
            message('선택 미리보기 전송 실패 · 확정 버튼으로 선택을 보낼 수 있습니다.');
        }
      }
    } finally {hoverBusy=false;}
  }
  panel.querySelector('.champion-grid').addEventListener('click',event=>{
    const button=event.target.closest('button[data-id]');
    if(!button||button.disabled||busy||!available())return;
    selected=Number(button.dataset.id);selectedLocally=true;
    message('');
    render(state);
    queueHover(selected,{...state.webDraft});
  });
  el('championSearch').addEventListener('input',drawGrid);
  el('teamReady').addEventListener('click',async()=>{
    const w=state?.webDraft;
    if(busy||!linkMatches(w)||w.status!=='lobby'||(!champions.length&&!w.ready?.[team]))return;
    busy=true;render(state);
    try {
      await send(w.ready?.[team]?'unready':'ready',{},w);
      message('');
    } catch(error){message(error.name==='TimeoutError'?'준비 상태를 확인할 수 없습니다. 다시 연결되면 상태를 확인하세요.':error.message);}
    finally{busy=false;render(state);}
  });
  el('teamLock').addEventListener('click',async()=>{
    if(busy||!available()||!selected)return;
    const turn={...state.webDraft},id=selected;
    pendingHover=null;
    busy=true;render(state);
    try {
      const {locked}=await send('lock',{id},turn);
      if(locked) message(`${locked.type==='ban'?'밴':'픽'} 확정 · ${champions.find(c=>c.id===locked.id)?.name||locked.name}`);
    } catch(error){
      message(error.name==='TimeoutError'?'확정 응답을 받지 못했습니다. 현재 턴의 확정 결과를 확인하세요.':error.message);
    } finally{busy=false;render(state);}
  });
  const app=document.querySelector('#app');let drag=null;
  const swapEnabled=()=>!busy&&linkMatches(state?.webDraft)&&state.webDraft.status==='finished';
  const ownCard=target=>target?.closest?.(`.draft-side.${team} .pick`);
  function clearDrag(){app.querySelectorAll('.drag-source,.drag-target').forEach(card=>card.classList.remove('drag-source','drag-target'));drag=null;}
  app.addEventListener('dragstart',event=>{if(ownCard(event.target))event.preventDefault()});
  app.addEventListener('pointerdown',event=>{const card=ownCard(event.target);if(!card||!swapEnabled()||event.button!==0)return;const from=Number(card.dataset.swapIndex);drag={from,fromId:state.draft[team+'Picks'][from].id,room:state.webDraft.room,pointer:event.pointerId,x:event.clientX,y:event.clientY,moved:false};app.setPointerCapture(event.pointerId);event.preventDefault()});
  app.addEventListener('pointermove',event=>{if(!drag||drag.pointer!==event.pointerId)return;if(Math.hypot(event.clientX-drag.x,event.clientY-drag.y)>6)drag.moved=true;if(!drag.moved)return;app.querySelectorAll('.drag-target').forEach(card=>card.classList.remove('drag-target'));const from=app.querySelector(`.draft-side.${team} .pick[data-swap-index="${drag.from}"]`);from?.classList.add('drag-source');const target=ownCard(document.elementFromPoint(event.clientX,event.clientY));if(target&&Number(target.dataset.swapIndex)!==drag.from)target.classList.add('drag-target');event.preventDefault()});
  app.addEventListener('pointerup',async event=>{if(!drag||drag.pointer!==event.pointerId)return;const gesture=drag,target=ownCard(document.elementFromPoint(event.clientX,event.clientY)),to=target?Number(target.dataset.swapIndex):-1;clearDrag();if(app.hasPointerCapture(event.pointerId))app.releasePointerCapture(event.pointerId);if(!gesture.moved||to<0||to===gesture.from||!swapEnabled()||gesture.room!==state.webDraft.room)return;const toId=state.draft[team+'Picks'][to].id;busy=true;render(state);try{await send('swap',{from:gesture.from,to,fromId:gesture.fromId,toId});message('픽 위치를 교환했습니다.')}catch(error){message(error.message)}finally{busy=false;render(state)}});
  app.addEventListener('pointercancel',clearDrag);app.addEventListener('lostpointercapture',clearDrag);
  function updateClock(seconds){if(linkMatches(state?.webDraft)&&state.webDraft.status==='finished')el('teamStatus').textContent='자리 교환 · '+seconds+'초 남음'}
  function render(s){state=s;if(!s)return;const w=s.webDraft,turn=turnKey(w);
    const own=available(),validLink=linkMatches(w);
    if(turn!==lastTurn){selected=0;selectedLocally=false;lastTurn=turn;drawGrid()}
    if(own&&!selectedLocally)selected=w.hover||0;
    el('teamTitle').textContent=s[team].name+' · '+(team==='blue'?'블루':'레드');
    el('teamStatus').textContent=!w?.enabled?'웹 밴픽 방 대기':!validLink?'현재 세트의 새 팀 링크로 접속하세요':w.status==='lobby'?'양 팀 준비 대기':w.status==='finished'?'자리 교환 · '+s.draft.timer+'초 남음':w.status==='complete'?'교환 종료 · 밴픽 확정':w.status==='suspended'?'시리즈 중단':w.status==='paused'?'일시정지':own?(w.action.type==='ban'?'우리 팀 밴 차례':'우리 팀 픽 차례'):'상대 팀 선택 중';
    el('teamReady').hidden=!validLink||w.status!=='lobby';
    el('teamReady').disabled=busy||(!champions.length&&!w?.ready?.[team]);
    el('teamReady').textContent=w?.ready?.[team]?'준비 취소':'준비 완료';
    el('teamLock').hidden=!own;el('teamLock').disabled=busy||!selected;el('teamLock').textContent=w?.action?.type==='ban'?'밴 확정':'픽 확정';
    app.querySelectorAll(`.draft-side.${team} .pick`).forEach((card,index)=>{card.dataset.swapIndex=index;card.classList.toggle('swap-card',swapEnabled());card.title=swapEnabled()?'다른 자기 팀 픽 카드로 드래그하여 교환':'';});
    if(w?.status==='finished')el('selectedChampion').textContent='자기 팀 픽 카드를 드래그하여 자리 교환';
    if(w?.status==='complete')el('selectedChampion').textContent='교환 시간이 종료됐습니다.';
    if(own)el('selectedChampion').textContent=champions.find(c=>c.id===selected)?.name||'챔피언을 선택하세요';
    else if(w?.status!=='finished'&&w?.status!=='complete')el('selectedChampion').textContent='';
    if(w?.notice&&w.notice!==lastNotice)message(w.notice);
    lastNotice=w?.notice||'';
    // Only update disabled state on ticks; keep search and scroll position intact.
    panel.querySelectorAll('.champion-choice').forEach(button=>{
      const id=Number(button.dataset.id);
      button.disabled=busy||!own||used(id);
      button.classList.toggle('selected',own&&id===selected);
    });
  }
  async function loadChampions() {
    loadButton.hidden=true;
    const read=async url=>{
      const response=await fetch(url,{signal:AbortSignal.timeout(6000)});
      if(!response.ok)throw Error('챔피언 목록 연결 실패');
      const list=await response.json();
      if(!Array.isArray(list)||!list.length)throw Error('챔피언 목록이 비어 있습니다.');
      return list;
    };
    const [ko,en]=await Promise.allSettled([read('/api/champion-list'),read('/api/champion-list?lang=en')]);
    const list=ko.value||en.value;
    if(!list){message('챔피언 목록을 불러오지 못했습니다. 다시 불러온 뒤 준비하세요.');loadButton.hidden=false;render(state);return;}
    const english=new Map((en.value||[]).map(c=>[c.id,c.name]));
    champions=list.map(c=>({...c,english:english.get(c.id)||''}));
    if(token)message('');
    drawGrid();render(state);
  }
  loadButton.addEventListener('click',loadChampions);
  loadChampions();
  if(!token)message('팀 전용 링크로 접속하세요.');
  return {render,updateClock};
})();
