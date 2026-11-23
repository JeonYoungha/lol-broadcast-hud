const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const lineup = require('./live-lineup');
const server = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
const liveCode = server.slice(server.indexOf('function updateLiveLineups('), server.indexOf('function applyChampSelect('));
const captureCode = server.slice(server.indexOf('function latestScreenCs('), server.indexOf('function startGoldOcr('));
const state = {
  webDraft: {enabled:true,status:'finished',room:'room-1'}, connection:{autoSync:true},
  game:{clock:'00:00',screenGoldOcr:true,manualBarons:true,blueBarons:3,manualHeralds:true,redHeralds:1},
  draft:{bluePicks:[{id:1,locked:true},{id:2,locked:true}],redPicks:[{id:3,locked:true}],blueBans:[4],redBans:[5]}
};
const player = (championId,team,kills,position,questId) => ({
  championId,team,championName:'C'+championId,position,
  scores:{kills,deaths:1,assists:2,creepScore:[110,44,66][championId-1]},
  items:questId?[{itemID:questId,slot:7}]:[]
});
const live = {
  gameData:{gameTime:120},
  allPlayers:[player(1,'ORDER',3,'TOP',1207),player(2,'ORDER',4,'BOTTOM',1200),player(3,'CHAOS',2,'BOTTOM',1202)],
  events:{Events:[{EventName:'TurretKilled',KillerTeam:'ORDER',EventTime:100}]}
};
let calls=0,now=10000;
const ctx = {
  ...lineup,state,championLookup:new Map(),lastLiveSeconds:null,Date:{now:()=>now},
  livePlayers:{blue:[],red:[]},observedRoles:{blue:new Map(),red:new Map()},autoQuestDetected:{blue:{},red:{}},
  roleQuestSignal:()=>null,spellKey:()=>'',liveRequest:async()=>{calls++;return live},broadcast:()=>{},save:()=>{},console,
  goldText:n=>String(n),recordGoldHistory:()=>{},resetQuestIconBaseline:()=>{}
};
vm.createContext(ctx);
vm.runInContext(captureCode+liveCode,ctx);

(async()=>{
  const originalDraft=JSON.stringify(state.draft);
  await ctx.syncLeague();
  assert.equal(calls,0);
  state.webDraft.status='complete';
  await ctx.syncLeague();
  assert.equal(calls,1);
  assert.equal(state.game.clock,'02:00');
  assert.equal(state.game.blueTowers,1);
  assert.equal(state.game.blueKills,7);
  assert.equal(state.game.blueBarons,3);
  assert.equal(state.game.redHeralds,1);
  assert.equal(state.game.blueRoleQuests.bot,true);
  const rows=()=>state.game.lineups.blue;
  assert.deepEqual(Array.from(rows(),p=>p.id),[2,0,0,1,0]);
  assert.equal(rows()[0].cs,null);
  assert.equal(state.game.sidePanelRoster.blue[0].role,'bot');
  assert.equal(JSON.stringify(state.draft),originalDraft);

  // The stock scoreboard, the lane order and the draft order can all differ.
  const frame={
    blue:[6000,5000],red:[4000],blueKda:['4/1/2','3/1/2'],redKda:['2/1/2'],
    blueCs:[44,110],blueCsZoom:[44,110],redCs:[66],redCsZoom:[66]
  };
  ctx.applyGoldOcr(frame);assert.equal(rows()[3].cs,null);
  ctx.applyGoldOcr(frame);
  assert.equal(rows()[0].cs,44);
  assert.equal(rows()[3].cs,110);
  assert.equal(state.game.laneGoldDiffs[3],1000);
  ctx.applyGoldOcr({...frame,blueCs:[440,110],blueCsZoom:[440,110]});
  ctx.applyGoldOcr({...frame,blueCs:[440,110],blueCsZoom:[440,110]});
  assert.equal(rows()[0].cs,44);
  ctx.applyGoldOcr({...frame,blueCs:[45,110],blueCsZoom:[45,110]});
  assert.equal(rows()[0].cs,45);
  const ambiguous=lineup.matchScoreboardRows(
    [1,2].map(id=>({id,player:{scores:{creepScore:30}}})),['0/0/0','0/0/0'],[30,30]);
  assert.deepEqual(ambiguous,[null,null,null,null,null]);
  ctx.applyGoldOcr({reason:'not-visible'});
  live.allPlayers[0].items=[];
  state.game.manualBarons=false;
  state.game.manualHeralds=false;
  await ctx.syncLeague();
  assert.equal(rows()[3].cs,110);
  assert.equal(state.game.blueBarons,0);
  assert.equal(state.game.redHeralds,0);
  assert.equal(JSON.stringify(state.draft),originalDraft);

  let resolve;
  ctx.liveRequest=()=>new Promise(r=>{resolve=r});
  const pending=ctx.syncLeague();
  state.webDraft={enabled:true,status:'lobby',room:'room-2'};
  resolve({...live,gameData:{gameTime:300}});
  await pending;
  assert.equal(state.game.clock,'02:00');

  const full=Array.from({length:10},(_,i)=>player(i+1,i<5?'ORDER':'CHAOS',i,'',null));
  state.webDraft={enabled:true,status:'complete',room:'room-1'};
  ctx.liveRequest=async()=>({...live,allPlayers:full,gameData:{gameTime:140}});
  await ctx.syncLeague();
  state.game.goldHistory=[{seconds:140,blue:6000,red:5900}];
  const oldSerial=state.game.matchSerial;
  ctx.liveRequest=async()=>({...live,allPlayers:full.slice(0,-1),gameData:{gameTime:142}});
  await ctx.syncLeague();
  assert.equal(state.game.matchSerial,oldSerial);
  assert.equal(state.game.goldHistory.length,1);
  assert.equal(state.game.clock,'02:20');
  now+=6000;ctx.liveRequest=async()=>{throw Error('offline');};await ctx.syncLeague();
  assert.equal(state.game.liveFeed.status,'stale');
  assert.match(state.connection.status,/끊김/);
  assert.equal(state.game.liveFeed.clock,'02:20');
  Object.assign(state.game,{manualBarons:true,blueBarons:2,manualHeralds:true,redHeralds:1,manualGrubs:true,blueGrubs:3});
  ctx.liveRequest=async()=>({...live,allPlayers:full.map(p=>({...p,championId:p.championId+10})),gameData:{gameTime:15}});
  await ctx.syncLeague();
  assert.equal(state.game.matchSerial,oldSerial+1);
  assert.equal(state.game.liveFeed.status,'live');
  assert.equal(state.game.manualBarons,false);assert.equal(state.game.blueBarons,0);
  assert.equal(state.game.manualHeralds,false);assert.equal(state.game.redHeralds,0);
  assert.equal(state.game.manualGrubs,false);assert.equal(state.game.blueGrubs,0);
  assert.equal(state.game.goldHistory.length,0);
  console.log('PASS live roles, trusted CS, ambiguous rows, partial roster, rollover and reconnect');
})().catch(error=>{console.error(error);process.exitCode=1;});
