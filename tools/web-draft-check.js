const assert=require('assert/strict');
const {createEngine,ORDER}=require('./web-draft-engine');
let time=0,room=0;
const state={draft:{},blue:{players:['manual']},red:{players:['manual']}};
const options={now:()=>time,roomId:()=>String(++room),championName:id=>id>0&&id<=200?'Champion '+id:undefined,championIds:()=>Array.from({length:200},(_,i)=>i+1),random:()=>0};
const engine=createEngine(state,options),command=(side,action,extra={})=>engine.command(side,{room:state.webDraft.room,step:state.webDraft.step,action,...extra});
engine.create(10);assert.equal(state.blue.players[0],'manual');assert.equal(state.webDraft.status,'lobby');
command('blue','ready');command('red','ready');assert.equal(state.webDraft.action.side,'blue');
assert.throws(()=>command('red','hover',{id:1}));
assert.throws(()=>command('blue','skip'));assert.equal(state.webDraft.step,0);
command('blue','hover',{id:99});time+=11000;engine.tick();assert.equal(state.draft.blueBans[0],0);assert(state.webDraft.notice.includes('밴 없음'));assert.equal(state.webDraft.hover,0);
command('red','hover',{id:1});command('red','lock');assert.equal(state.draft.redBans[0],1);
assert.equal(state.webDraft.action.slot,1);assert.throws(()=>command('blue','hover',{id:1}));
while(state.webDraft.step<6){time+=11000;engine.tick()}
assert.equal(state.webDraft.action.type,'pick');
time+=11000;engine.tick();assert.equal(state.draft.bluePicks[0].id,2);assert.equal(state.draft.bluePicks[0].locked,true);assert.equal(state.webDraft.step,7);
command('red','hover',{id:3});assert.equal(state.draft.redPicks[0].locked,false);
time+=11000;engine.tick();assert.equal(state.draft.redPicks[0].id,3);assert.equal(state.draft.redPicks[0].locked,true);
const oldStep=state.webDraft.step;engine.admin('pause');time+=50000;engine.tick();assert.equal(state.webDraft.step,oldStep);engine.admin('resume');
assert.throws(()=>engine.command('red',{room:state.webDraft.room,step:0,action:'hover',id:4}));
while(state.webDraft.status==='running'){time+=11000;engine.tick()}
assert.equal(state.webDraft.status,'finished');for(const side of ['blue','red'])assert.equal(state.draft[side+'Picks'].filter(p=>p.locked).length,5);
const all=[...state.draft.bluePicks,...state.draft.redPicks].map(p=>p.id);assert.equal(new Set(all).size,10);assert(!all.includes(1));
const first=state.draft.bluePicks[0].id;command('blue','swap',{from:0,to:4});assert.equal(state.draft.bluePicks[4].id,first);
assert.throws(()=>command('blue','swap',{from:0,to:4,fromId:first,toId:first}));
assert.equal(state.draft.timer,40);time+=39000;engine.tick();assert.equal(state.draft.timer,1);command('red','swap',{from:0,to:4});time+=1000;assert.throws(()=>command('blue','swap',{from:0,to:4}));assert.equal(state.webDraft.status,'complete');assert.equal(state.draft.timer,0);
const oldRoom=state.webDraft.room;engine.create();assert.throws(()=>engine.command('blue',{room:oldRoom,action:'ready'}));
command('blue','ready');command('red','ready');const restored=createEngine(state,options);assert.equal(state.webDraft.status,'paused');restored.admin('resume');restored.admin('close');assert.equal(state.webDraft.enabled,false);
assert.equal(ORDER.length,20);console.log('PASS web draft: order, permissions, skip slots, hover, random timeout, uniqueness, pause, swaps, stale commands, restart');
