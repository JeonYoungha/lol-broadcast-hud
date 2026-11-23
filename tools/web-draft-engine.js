const ORDER = [
  ...['blue','red','blue','red','blue','red'].map(side=>({side,type:'ban'})),
  ...['blue','red','red','blue','blue','red'].map(side=>({side,type:'pick'})),
  ...['red','blue','red','blue'].map(side=>({side,type:'ban'})),
  ...['red','blue','blue','red'].map(side=>({side,type:'pick'}))
];
const seriesLength = value => Number(value) === 3 ? 3 : 5;
const winsToFinish = bestOf => (seriesLength(bestOf) + 1) / 2;

function createEngine(state,{now=Date.now,championName,championIds,random=Math.random,roomId}) {
  const emptyPick=()=>({id:0,name:'',skinId:0,locked:false});
  const web=()=>state.webDraft;
  function current(){const w=web();if(!w?.enabled||w.status!=='running')return null;const action=ORDER[w.step];return action&&w.firstSide==='red'?{...action,side:action.side==='blue'?'red':'blue'}:action}
  function publish(){
    const w=web();if(!w?.enabled)return;
    const action=current();
    w.action=action?{...action,slot:ORDER.slice(0,w.step).filter(a=>a.side===(w.firstSide==='red'?(action.side==='blue'?'red':'blue'):action.side)&&a.type===action.type).length}:null;
    state.draft.activeBanSlots={blue:-1,red:-1};
    if(w.action?.type==='ban')state.draft.activeBanSlots[w.action.side]=w.action.slot;
    const phases={finished:'SWAP PHASE',complete:'DRAFT COMPLETE',paused:'DRAFT PAUSED',suspended:'DRAFT SUSPENDED'};
    state.draft.phase=action?`${action.side.toUpperCase()} ${action.type.toUpperCase()} ${w.step+1}`:(phases[w.status]||'WAITING FOR TEAMS');
    state.draft.timer=action||w.status==='finished'?Math.max(0,Math.ceil((w.deadline-now())/1000)):0;
  }
  function beginTurn(){const w=web();w.hover=0;w.status=w.step>=ORDER.length?'finished':'running';w.deadline=now()+(w.status==='running'?w.turnSeconds:40)*1000;publish()}
  function create(seconds=30,firstSide='blue'){
    if(!['blue','red'].includes(firstSide))throw Error('선픽 진영이 잘못됐습니다.');
    state.webDraft={enabled:true,room:roomId(),status:'lobby',step:0,turnSeconds:Math.max(10,Math.min(120,Number(seconds)||30)),firstSide,ready:{blue:false,red:false},hover:0,deadline:0,action:null,notice:''};
    state.draft.bluePicks=Array.from({length:5},emptyPick);state.draft.redPicks=Array.from({length:5},emptyPick);
    state.draft.blueBans=Array(5).fill(0);state.draft.redBans=Array(5).fill(0);publish();
  }
  function used(id){return (state.fearless?.games||[]).some(game=>game.picks.includes(id))||['blue','red'].some(side=>state.draft[side+'Bans'].includes(id)||state.draft[side+'Picks'].some(p=>p.id===id&&p.locked))}
  function lock(id){const w=web(),a=w.action;if(!a)throw Error('진행 중인 턴이 없습니다.');
    if(!id&&a.type==='pick')throw Error('챔피언을 먼저 선택하세요.');
    if(a.type==='ban')state.draft[a.side+'Bans'][a.slot]=id;
    else state.draft[a.side+'Picks'][a.slot]={id,name:championName(id),skinId:0,locked:true};
    w.step++;w.notice='';beginTurn();
    return {locked:{id,name:id?championName(id):'',type:a.type}};
  }
  function selectedChampion(value) {
    if (!Number.isInteger(value)||!championName(value)||used(value)) throw Error('확정할 챔피언을 다시 선택하세요.');
    return value;
  }
  function arrange(rofsSide,category,selection,opponent){
    if(!['blue','red'].includes(rofsSide)||!['side','pick'].includes(category))throw Error('RoFS 팀과 선택 항목을 확인하세요.');
    if(category==='side'&&(!['blue','red'].includes(selection)||!['first','second'].includes(opponent)))throw Error('진영 및 선후픽을 확인하세요.');
    if(category==='pick'&&(!['first','second'].includes(selection)||!['blue','red'].includes(opponent)))throw Error('선후픽 및 진영을 확인하세요.');
    const other=rofsSide==='blue'?'red':'blue';
    const blueTeam=category==='side'?(selection==='blue'?rofsSide:other):(opponent==='blue'?other:rofsSide);
    const firstTeam=category==='pick'?(selection==='first'?rofsSide:other):(opponent==='first'?other:rofsSide);
    const firstSide=firstTeam===blueTeam?'blue':'red';
    if(blueTeam==='red'){
      const blueColor=state.blue.color,redColor=state.red.color;
      [state.blue,state.red]=[state.red,state.blue];
      state.blue.color=blueColor;state.red.color=redColor;
    }
    return firstSide;
  }
  function startSeries(options){
    if (state.fearless?.active&&!state.fearless.complete&&
        (!web()?.room||options.replaceRoom!==web().room)) {
      throw Error('진행 중인 시리즈가 있습니다. 기존 시리즈를 이어서 진행하세요.');
    }
    const firstSide=arrange(options.rofsSide,options.category,options.selection,options.opponent);
    const bestOf=seriesLength(options.bestOf??state.event?.bestOf);
    state.fearless={games:[],active:true,complete:false,bestOf};state.blue.score=0;state.red.score=0;
    if(state.event){state.event.game=1;state.event.bestOf=bestOf;}
    create(options.seconds,firstSide);
    state.fearless.id=web().room;
  }
  function nextSet(options){
    const w=web();if(!state.fearless?.active||state.fearless.complete)throw Error('진행 중인 피어리스 시리즈가 없습니다.');
    if(!w?.enabled||w.status!=='complete')throw Error('스왑 시간이 끝난 뒤 경기 결과를 기록하세요.');
    if(!['blue','red'].includes(options.winner))throw Error('승리 팀을 선택하세요.');
    const picks=['blue','red'].flatMap(side=>state.draft[side+'Picks'].map(p=>p.locked?p.id:0));
    if(picks.length!==10||picks.some(id=>!id)||new Set(picks).size!==10)throw Error('확정된 픽 10개를 확인하세요.');
    const loser=options.winner==='blue'?'red':'blue';
    const won=Number(state[options.winner].score||0)+1;
    const needed=winsToFinish(state.fearless.bestOf??state.event?.bestOf);
    if(won<needed){
      if(options.rofsSide!==loser)throw Error('다음 세트 RoFS는 직전 패배 팀에 있습니다.');
      if(!['side','pick'].includes(options.category)||(options.category==='side'&&(!['blue','red'].includes(options.selection)||!['first','second'].includes(options.opponent)))||(options.category==='pick'&&(!['first','second'].includes(options.selection)||!['blue','red'].includes(options.opponent))))throw Error('다음 세트 RoFS 선택을 확인하세요.');
    }
    state.fearless.undo={blue:structuredClone(state.blue),red:structuredClone(state.red),draft:structuredClone(state.draft),event:structuredClone(state.event||{}),webDraft:structuredClone(w)};
    if(state.result?.snapshot&&state.result.snapshot.seriesScorePending===undefined&&Number(state.result.snapshot.event?.game)===Number(state.event?.game))state.result.snapshot.seriesScorePending=true;
    state.fearless.games.push({game:state.fearless.games.length+1,picks,winner:options.winner});
    state[options.winner].score=won;
    if(won>=needed){state.fearless.complete=true;w.notice='시리즈 종료';publish();return}
    const firstSide=arrange(options.rofsSide,options.category,options.selection,options.opponent);
    if(state.event)state.event.game=state.fearless.games.length+1;
    create(w.turnSeconds,firstSide);
  }
  function undoSet(){
    const previous=state.fearless?.undo,w=web();if(!previous)throw Error('되돌릴 세트 결과가 없습니다.');
    const lobby=w?.status==='lobby'||(w?.status==='suspended'&&w.suspendedFrom==='lobby');
    if(!state.fearless.complete&&!lobby)throw Error('다음 세트 밴픽이 시작되기 전까지만 결과를 되돌릴 수 있습니다.');
    state.blue=previous.blue;state.red=previous.red;state.draft=previous.draft;state.event=previous.event;state.webDraft=previous.webDraft;
    state.webDraft.room=roomId();state.fearless.games.pop();state.fearless.complete=false;delete state.fearless.undo;publish();
  }
  function tick(){const w=web();if(!w?.enabled)return;if(w.status==='finished'&&now()>=w.deadline){w.status='complete';w.deadline=0;w.notice='교환 시간이 종료되어 밴픽이 확정됐습니다.';}publish();if(current()&&now()>=w.deadline){
    if(w.action.type==='ban'){lock(0);w.notice='밴 시간이 종료되어 밴 없음으로 넘어갔습니다.';}
    else if(w.hover)lock(w.hover);
    else {const pool=championIds().filter(id=>!used(id));if(pool.length){lock(pool[Math.floor(random()*pool.length)]);w.notice='시간 초과로 랜덤 픽이 확정되었습니다.';}else {w.pausedFrom='running';w.remaining=w.turnSeconds;w.status='paused';w.notice='선택 가능한 챔피언 목록이 없어 일시정지했습니다.';publish()}}
  }}
  function command(side,body){tick();const w=web();if(!w?.enabled)throw Error('웹 밴픽 방이 없습니다.');
    if(body.room!==w.room)throw Error('새 방이 열렸습니다. 새 링크로 접속하세요.');
    if(body.action==='ready'||body.action==='unready'){
      if(w.status!=='lobby')throw Error('이미 시작된 밴픽입니다.');
      if(body.action==='ready'&&!championIds().length)throw Error('챔피언 목록을 불러온 뒤 준비하세요.');
      w.ready[side]=body.action==='ready';
      if(w.ready.blue&&w.ready.red)beginTurn();
      publish();return;
    }
    if(body.action==='swap'){if(w.status!=='finished')throw Error('픽 완료 후 교환할 수 있습니다.');const {from,to}=body;if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<0||from>4||to>4)throw Error('교환 위치가 잘못됐습니다.');const picks=state.draft[side+'Picks'];if((body.fromId!==undefined&&body.fromId!==picks[from].id)||(body.toId!==undefined&&body.toId!==picks[to].id))throw Error('픽 위치가 변경됐습니다. 다시 드래그하세요.');[picks[from],picks[to]]=[picks[to],picks[from]];return}
    if(!current()||w.action.side!==side)throw Error('우리 팀 차례가 아닙니다.');
    if(body.step!==w.step)throw Error('턴이 바뀌었습니다. 다시 선택하세요.');
    if(body.action==='lock')return lock(selectedChampion(body.id));
    if(body.action!=='hover')throw Error('지원하지 않는 동작입니다.');
    const id=selectedChampion(body.id);
    w.hover=id;
    if(w.action.type==='pick')state.draft[side+'Picks'][w.action.slot]={id,name:championName(id),skinId:0,locked:false};
    publish();
  }
  const timed = status => status==='running'||status==='finished';
  function pause(w, seconds) {
    w.pausedFrom=w.status;
    w.remaining=Math.max(1,seconds);
    w.status='paused';
  }
  function resume(w) {
    w.status=w.pausedFrom==='finished'?'finished':'running';
    w.deadline=now()+(w.remaining||(w.status==='finished'?40:w.turnSeconds))*1000;
    delete w.pausedFrom;
    delete w.remaining;
  }
  function admin(action){
    const w=web();
    if(!w)throw Error('먼저 방을 생성하세요.');
    const activeSeries=state.fearless?.active&&!state.fearless.complete;
    // Older versions closed the room completely. Recover it if its draft is still intact.
    if (!w.enabled&&action==='resume'&&activeSeries&&state.draft.phase==='WEB DRAFT CLOSED') {
      w.enabled=true;
      if(timed(w.status))pause(w,Math.ceil((w.deadline-now())/1000)||w.turnSeconds);
      w.notice='저장된 시리즈를 복원했습니다. 일시정지된 경우 재개를 눌러주세요.';
      publish();return;
    }
    if(!w.enabled)throw Error('먼저 방을 생성하세요.');
    tick();
    if(action==='close'){
      if(activeSeries){
        if(w.status==='suspended')return;
        if(timed(w.status))pause(w,state.draft.timer);
        w.suspendedFrom=w.status;w.status='suspended';w.notice='시리즈 중단 · 진행자가 이어하기를 누르면 복구됩니다.';
      }else{
        w.enabled=false;state.draft.activeBanSlots={blue:-1,red:-1};state.draft.phase='WEB DRAFT CLOSED';state.draft.timer=0;return;
      }
    }else if(action==='pause'&&timed(w.status)){
      pause(w,state.draft.timer);
      w.notice='진행자가 일시정지했습니다.';
    }else if(action==='resume'&&['paused','suspended'].includes(w.status)){
      if(w.status==='suspended'){
        w.status=w.suspendedFrom||'lobby';
        delete w.suspendedFrom;
      }
      if(w.status==='paused')resume(w);
      w.notice='';
    }else throw Error('현재 상태에서는 실행할 수 없습니다.');
    publish();
  }
  // A stopped host must not consume turns while nobody can connect.
  if(web()?.enabled&&timed(web().status)){
    const w=web();
    pause(w,Number.isFinite(state.draft.timer)?state.draft.timer:(w.status==='finished'?40:w.turnSeconds));
    w.notice='서버 재시작으로 일시정지했습니다.';
    publish();
  }
  return {create,command,admin,tick,current,startSeries,nextSet,undoSet};
}
module.exports={createEngine,ORDER};
