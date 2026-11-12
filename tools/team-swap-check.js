const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
const functions=source.slice(source.indexOf('function normalizeSideColors()'),source.indexOf('let clients ='));
const state={blue:{name:'A',logo:'a',players:['A1'],score:1,color:'#0050d1'},red:{name:'B',logo:'b',players:['B1'],score:2,color:'#ff4f6d'},draft:{bluePicks:[{id:1}],redPicks:[{id:2}]}};
const ctx={state};vm.createContext(ctx);vm.runInContext(functions,ctx);ctx.swapTeamSides();
assert.equal(state.blue.name,'B');assert.equal(state.blue.logo,'b');assert.equal(state.blue.players[0],'B1');assert.equal(state.blue.score,2);assert.equal(state.blue.color,'#0050d1');assert.equal(state.red.name,'A');assert.equal(state.red.score,1);assert.equal(state.red.color,'#ff4f6d');assert.equal(state.draft.bluePicks[0].id,1);
state.webDraft={enabled:true,status:'running'};assert.throws(()=>ctx.swapTeamSides());assert.equal(state.blue.name,'B');state.webDraft={enabled:true,status:'lobby',ready:{blue:true,red:false}};assert.throws(()=>ctx.swapTeamSides());state.webDraft.ready.blue=false;ctx.swapTeamSides();assert.equal(state.blue.name,'A');
console.log('PASS team swap preserves identity and scores, side colors, draft, and active web draft');
