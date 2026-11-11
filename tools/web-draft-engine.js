const ORDER = [
  ...['blue','red','blue','red','blue','red'].map(side=>({side,type:'ban'})),
  ...['blue','red','red','blue','blue','red'].map(side=>({side,type:'pick'})),
  ...['red','blue','red','blue'].map(side=>({side,type:'ban'})),
  ...['red','blue','blue','red'].map(side=>({side,type:'pick'}))
];
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
    state.draft.phase=action?`${action.side.toUpperCase()} ${action.type.toUpperCase()} ${w.step+1}`:w.status==='finished'?'SWAP PHASE':w.status==='complete'?'DRAFT COMPLETE':w.status==='paused'?'DRAFT PAUSED':'WAITING FOR TEAMS';
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
  function lock(skip=false){const w=web(),a=w.action;if(!a)throw Error('진행 중인 턴이 없습니다.');const id=skip?0:w.hover;
    if(!id&&a.type==='pick')throw Error('챔피언을 먼저 선택하세요.');
    if(a.type==='ban')state.draft[a.side+'Bans'][a.slot]=id;
    else state.draft[a.side+'Picks'][a.slot]={id,name:championName(id),skinId:0,locked:true};
    w.step++;w.notice='';beginTurn();
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
    const firstSide=arrange(options.rofsSide,options.category,options.selection,options.opponent);
    state.fearless={games:[],active:true,complete:false};state.blue.score=0;state.red.score=0;
    if(state.event){state.event.game=1;state.event.bestOf=5;}
    create(options.seconds,firstSide);
  }
  function nextSet(options){
    const w=web();if(!state.fearless?.active||state.fearless.complete)throw Error('진행 중인 피어리스 시리즈가 없습니다.');
    if(!w?.enabled||w.status!=='complete')throw Error('스왑 시간이 끝난 뒤 경기 결과를 기록하세요.');
    if(!['blue','red'].includes(options.winner))throw Error('승리 팀을 선택하세요.');
    const picks=['blue','red'].flatMap(side=>state.draft[side+'Picks'].map(p=>p.locked?p.id:0));
    if(picks.length!==10||picks.some(id=>!id)||new Set(picks).size!==10)throw Error('확정된 픽 10개를 확인하세요.');
    const loser=options.winner==='blue'?'red':'blue';
    const won=Number(state[options.winner].score||0)+1;
    if(won<3){
      if(options.rofsSide!==loser)throw Error('다음 세트 RoFS는 직전 패배 팀에 있습니다.');
      if(!['side','pick'].includes(options.category)||(options.category==='side'&&(!['blue','red'].includes(options.selection)||!['first','second'].includes(options.opponent)))||(options.category==='pick'&&(!['first','second'].includes(options.selection)||!['blue','red'].includes(options.opponent))))throw Error('다음 세트 RoFS 선택을 확인하세요.');
    }
    state.fearless.undo={blue:structuredClone(state.blue),red:structuredClone(state.red),draft:structuredClone(state.draft),event:structuredClone(state.event||{}),webDraft:structuredClone(w)};
    if(state.result?.snapshot&&state.result.snapshot.seriesScorePending===undefined&&Number(state.result.snapshot.event?.game)===Number(state.event?.game))state.result.snapshot.seriesScorePending=true;
    state.fearless.games.push({game:state.fearless.games.length+1,picks,winner:options.winner});
    state[options.winner].score=won;
    if(won>=3){state.fearless.complete=true;w.notice='시리즈 종료';publish();return}
    const firstSide=arrange(options.rofsSide,options.category,options.selection,options.opponent);
    if(state.event)state.event.game=state.fearless.games.length+1;
    create(w.turnSeconds,firstSide);
  }
  function undoSet(){
    const previous=state.fearless?.undo,w=web();if(!previous)throw Error('되돌릴 세트 결과가 없습니다.');
    if(!state.fearless.complete&&(!w||w.status!=='lobby'||w.ready.blue||w.ready.red))throw Error('다음 세트 준비 완료 전까지만 결과를 되돌릴 수 있습니다.');
    state.blue=previous.blue;state.red=previous.red;state.draft=previous.draft;state.event=previous.event;state.webDraft=previous.webDraft;
    state.webDraft.room=roomId();state.fearless.games.pop();state.fearless.complete=false;delete state.fearless.undo;publish();
  }
  function tick(){const w=web();if(!w?.enabled)return;if(w.status==='finished'&&now()>=w.deadline){w.status='complete';w.deadline=0;w.notice='교환 시간이 종료되어 밴픽이 확정됐습니다.';}publish();if(current()&&now()>=w.deadline){
    if(w.action.type==='ban'){lock(true);w.notice='밴 시간이 종료되어 밴 없음으로 넘어갔습니다.';}
    else if(w.hover)lock();
    else {const pool=championIds().filter(id=>!used(id));if(pool.length){w.hover=pool[Math.floor(random()*pool.length)];lock();w.notice='시간 초과로 랜덤 픽이 확정되었습니다.';}else {w.status='paused';w.notice='선택 가능한 챔피언 목록이 없어 일시정지했습니다.';publish()}}
  }}
  function command(side,body){tick();const w=web();if(!w?.enabled)throw Error('웹 밴픽 방이 없습니다.');
    if(body.room!==w.room)throw Error('새 방이 열렸습니다. 새 링크로 접속하세요.');
    if(body.action==='ready'){if(w.status!=='lobby')throw Error('이미 시작된 밴픽입니다.');w.ready[side]=true;if(w.ready.blue&&w.ready.red)beginTurn();publish();return}
    if(body.action==='swap'){if(w.status!=='finished')throw Error('픽 완료 후 교환할 수 있습니다.');const {from,to}=body;if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<0||from>4||to>4)throw Error('교환 위치가 잘못됐습니다.');const picks=state.draft[side+'Picks'];if((body.fromId!==undefined&&body.fromId!==picks[from].id)||(body.toId!==undefined&&body.toId!==picks[to].id))throw Error('픽 위치가 변경됐습니다. 다시 드래그하세요.');[picks[from],picks[to]]=[picks[to],picks[from]];return}
    if(!current()||w.action.side!==side)throw Error('우리 팀 차례가 아닙니다.');
    if(body.step!==w.step)throw Error('턴이 바뀌었습니다. 다시 선택하세요.');
    if(body.action==='hover'){const id=Number(body.id);if(!Number.isInteger(id)||!championName(id)||used(id))throw Error('선택할 수 없는 챔피언입니다.');w.hover=id;if(w.action.type==='pick')state.draft[side+'Picks'][w.action.slot]={id,name:championName(id),skinId:0,locked:false};}
    else if(body.action==='lock')lock();else throw Error('지원하지 않는 동작입니다.');publish();
  }
  function admin(action){const w=web();if(!w?.enabled)throw Error('먼저 방을 생성하세요.');
    if(action==='close'){w.enabled=false;state.draft.activeBanSlots={blue:-1,red:-1};state.draft.phase='WEB DRAFT CLOSED';state.draft.timer=0;return}
    if(action==='pause'&&w.status==='running'){w.remaining=Math.max(1,Math.ceil((w.deadline-now())/1000));w.status='paused';}
    else if(action==='resume'&&w.status==='paused'){w.status='running';w.deadline=now()+(w.remaining||w.turnSeconds)*1000;w.remaining=0;w.notice='';}
    else throw Error('현재 상태에서는 실행할 수 없습니다.');publish();
  }
  // A stopped host must not consume turns while nobody can connect.
  if(web()?.enabled&&web().status==='running'){web().remaining=Math.max(1,state.draft.timer||web().turnSeconds);web().status='paused';web().notice='서버 재시작으로 일시정지했습니다.';publish()}
  return {create,command,admin,tick,current,startSeries,nextSet,undoSet};
}
module.exports={createEngine,ORDER};
