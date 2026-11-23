const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.join(__dirname,'..'),flush=()=>new Promise(setImmediate);
async function main(){
 let clock=0,calls=0,notifications=0;const waits=[],requests=[];
 const c={window:{},location:{hostname:'external.example'},performance:{now:()=>clock},AbortSignal:{timeout:()=>undefined},document:{body:{classList:{add(){},remove(){}}}},console:{warn(){},error(){}},setTimeout:(fn,ms)=>{waits.push({fn,ms});return waits.length},clearTimeout(){},EventSource:class{constructor(){throw Error('External SSE must not start')}},fetch:()=>{calls++;return new Promise(resolve=>requests.push(resolve))}};
 vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(root,'public/common.js'),'utf8'),c);
 await c.window.HUD.init(()=>notifications++);assert.equal(calls,1);c.window.HUD.refresh();c.window.HUD.refresh();assert.equal(calls,1);
 clock=80;requests.shift()({ok:true,json:async()=>({draft:{timer:30}})});await flush();assert.equal(waits.at(-1).ms,0);assert.equal(notifications,1);
 const next=waits.pop();clock=100;next.fn();assert.equal(calls,2);clock=180;requests.shift()({ok:true,json:async()=>({draft:{timer:30}})});await flush();assert.equal(waits.at(-1).ms,170);assert.equal(notifications,1);
 const team=fs.readFileSync(path.join(root,'public/draft-team.js'),'utf8'),sent=[],pending=[];
 const q={pendingHover:null,hoverBusy:false,busy:false,lastTurn:'test:0',available:()=>true,turnKey:w=>w.room+':'+w.step,message(){},send:(action,extra)=>{sent.push(extra.id);return new Promise(resolve=>pending.push(resolve))}};
 vm.createContext(q);vm.runInContext(team.slice(team.indexOf('async function queueHover('),team.indexOf("  panel.querySelector('.champion-grid').addEventListener")),q);
 const turn={room:'test',step:0,hover:1};
 const hovering=q.queueHover(1,turn);q.queueHover(2,turn);q.queueHover(3,turn);
 assert.deepEqual(sent,[1]);pending.shift()();await flush();assert.deepEqual(sent,[1,3]);pending.shift()();await hovering;assert.equal(q.hoverBusy,false);
 let click;
 const lock={state:{webDraft:turn},busy:false,available:()=>true,selected:2,pendingHover:{id:2},champions:[],message(){},render(){},
  el:()=>({addEventListener(_,fn){click=fn;}}),
  send:async(action,extra,w)=>{assert.equal(action,'lock');assert.equal(extra.id,2);assert.equal(w.hover,1);return {locked:{id:2,name:'B',type:'pick'}};}};
 vm.createContext(lock);
 vm.runInContext(team.slice(team.indexOf("  el('teamLock').addEventListener"),team.indexOf("  const app=document.querySelector('#app')")),lock);
 await click();assert.equal(lock.pendingHover,null);
 console.log('PASS draft latency, latest hover queue and lock of the exact clicked champion without waiting for hover');
}
main().catch(error=>{console.error(error);process.exitCode=1});
