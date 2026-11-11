const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const server=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
const code=server.slice(server.indexOf('async function syncLiveGame('),server.indexOf('function applyChampSelect('));
let calls=0,broadcasts=0;
const state={webDraft:{enabled:true,status:'finished',room:'room-1'},connection:{autoSync:true},game:{clock:'00:00'},draft:{bluePicks:[{id:1,locked:true},{id:2,locked:true}],redPicks:[{id:3,locked:true}],blueBans:[4],redBans:[5],activeBanSlots:{blue:-1,red:-1}}};
const player=(championId,team,kills)=>({championId,team,championName:'C'+championId,scores:{kills,deaths:1,assists:2,creepScore:10},items:[]});
const live={gameData:{gameTime:120},allPlayers:[player(2,'ORDER',4),player(1,'ORDER',3),player(3,'CHAOS',2)],events:{Events:[{EventName:'TurretKilled',KillerTeam:'ORDER',EventTime:100}]}};
const ctx={state,championLookup:new Map(),apiCsCells:{blue:[],red:[]},screenGrubCounts:{blue:null,red:null},lastLiveSeconds:null,latestScreenCs:()=>null,roleQuestSignal:()=>null,spellKey:()=>'',clearGoldOcr:()=>{},liveRequest:async()=>{calls++;return live},broadcast:()=>{broadcasts++},console};
vm.createContext(ctx);vm.runInContext(code,ctx);
(async()=>{
 await ctx.syncLeague();assert.equal(calls,0);assert.equal(state.draft.bluePicks[0].kda,undefined);
 state.webDraft.status='complete';await ctx.syncLeague();assert.equal(calls,1);assert.equal(state.game.clock,'02:00');assert.equal(state.game.blueTowers,1);assert.equal(state.game.blueKills,7);
 assert.deepEqual(Array.from(state.draft.bluePicks,p=>p.id),[1,2]);assert.equal(state.draft.bluePicks[0].kda.kills,3);assert.equal(state.draft.bluePicks[1].kda.kills,4);assert(state.draft.bluePicks.every(p=>p.locked));assert.deepEqual(state.draft.blueBans,[4]);assert(broadcasts>0);
 let resolve;ctx.liveRequest=()=>new Promise(r=>{resolve=r});const pending=ctx.syncLeague();state.webDraft={enabled:true,status:'lobby',room:'room-2'};resolve({...live,gameData:{gameTime:300}});await pending;assert.equal(state.game.clock,'02:00');
 console.log('PASS web draft remains intact while completed draft receives live stats; stale responses are ignored');
})().catch(e=>{console.error(e);process.exitCode=1});
