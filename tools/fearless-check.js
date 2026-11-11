const assert=require('assert/strict');
const {createEngine}=require('./web-draft-engine');
let now=0,room=0;
const state={draft:{},event:{game:0},blue:{name:'A',score:0,color:'#0050d1',logo:'a.png',tagline:'A label'},red:{name:'B',score:0,color:'#ff4f6d',logo:'b.png',tagline:'B label'}};
const engine=createEngine(state,{now:()=>now,roomId:()=>String(++room),championName:id=>id>0&&id<=200?'Champion '+id:undefined,championIds:()=>Array.from({length:200},(_,i)=>i+1),random:()=>0});
const send=(side,action,more={})=>engine.command(side,{room:state.webDraft.room,step:state.webDraft.step,action,...more});
engine.startSeries({seconds:10,rofsSide:'blue',category:'side',selection:'red',opponent:'second'});
assert.equal(state.red.name,'A');assert.equal(state.blue.name,'B');assert.equal(state.webDraft.firstSide,'red');
assert.equal(state.blue.color,'#0050d1');assert.equal(state.red.color,'#ff4f6d');assert.equal(state.red.logo,'a.png');assert.equal(state.red.tagline,'A label');
send('blue','ready');send('red','ready');assert.equal(state.webDraft.action.side,'red');
while(state.webDraft.status==='running'){now+=11000;engine.tick()}
const firstPicks=['blue','red'].flatMap(side=>state.draft[side+'Picks'].map(p=>p.id));assert.equal(new Set(firstPicks).size,10);
now+=40000;engine.tick();assert.equal(state.webDraft.status,'complete');
assert.throws(()=>engine.nextSet({winner:'blue',rofsSide:'blue',category:'side',selection:'blue',opponent:'first'}));assert.equal(state.fearless.games.length,0);
engine.nextSet({winner:'blue',rofsSide:'red',category:'pick',selection:'first',opponent:'red'});
assert.equal(state.fearless.games.length,1);assert.deepEqual(state.fearless.games[0].picks,firstPicks);assert.equal(state.event.game,2);assert.equal(state.blue.name,'A');assert.equal(state.webDraft.firstSide,'blue');
assert.equal(state.blue.color,'#0050d1');assert.equal(state.red.color,'#ff4f6d');assert.equal(state.red.score,1);assert.equal(state.red.logo,'b.png');
engine.undoSet();assert.equal(state.fearless.games.length,0);assert.equal(state.event.game,1);assert.equal(state.blue.name,'B');assert.equal(state.blue.score,0);assert.equal(state.webDraft.status,'complete');
assert.equal(state.blue.color,'#0050d1');assert.equal(state.red.color,'#ff4f6d');
engine.nextSet({winner:'blue',rofsSide:'red',category:'pick',selection:'first',opponent:'red'});
send('blue','ready');send('red','ready');assert.throws(()=>send('blue','hover',{id:firstPicks[0]}));
while(state.webDraft.status==='running'){now+=11000;engine.tick()}
const secondPicks=['blue','red'].flatMap(side=>state.draft[side+'Picks'].map(p=>p.id));assert(secondPicks.every(id=>!firstPicks.includes(id)));
now+=40000;engine.tick();engine.nextSet({winner:'red',rofsSide:'blue',category:'side',selection:'blue',opponent:'first'});assert.equal(state.fearless.games.length,2);assert.equal(state.event.game,3);
console.log('PASS BO5 fearless: RoFS red first, side swap, locked history, random exclusion, next set and score');
