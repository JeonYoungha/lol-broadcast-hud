const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const page=fs.readFileSync(path.join(__dirname,'../public/draft.html'),'utf8');
function client(){
 let now=0,writes=0,el,tick;
 const attributes={},values={};
 const replace=()=>el={style:{setProperty:(k,v)=>{writes++;values[k]=Number(v);}},setAttribute:(k,v)=>{writes++;attributes[k]=Number(v);}};
 replace();
 const ctx={performance:{now:()=>now},app:{querySelector:()=>el},setInterval(fn){tick=fn;}};
 vm.createContext(ctx);vm.runInContext(page.slice(page.indexOf('let timerDeadline='),page.indexOf('const visiblePicks=')),ctx);
 return {ctx,attributes,values,set:t=>now=t,replace,tick,get writes(){return writes;}};
}
const a=client(),b=client(),web={enabled:true,room:'test',step:1,status:'running',deadline:1030000,turnSeconds:30};
a.set(100);a.ctx.syncTimer(30,'BLUE PICK',web,{serverNow:1000000,received:100,rtt:200});
b.set(500);b.ctx.syncTimer(30,'BLUE PICK',web,{serverNow:1000000,received:500,rtt:1000});
a.set(5100);b.set(5500);a.ctx.drawTimer();b.ctx.drawTimer();assert(Math.abs(a.attributes['aria-valuenow']-b.attributes['aria-valuenow'])<=1);
const previous=a.values['--timer-progress'];a.ctx.syncTimer(26,'BLUE PICK',web,{serverNow:1005000,received:5100,rtt:0});assert(a.values['--timer-progress']<=previous);
a.set(6100);a.ctx.syncTimer(24,'BLUE PICK',web,{serverNow:1007000,received:6100,rtt:200});assert(a.attributes['aria-valuenow']<=23);
web.step=2;web.deadline=1060000;a.set(7000);a.ctx.syncTimer(30,'RED PICK',web,{serverNow:1030000,received:7000,rtt:100});assert.equal(a.attributes['aria-valuenow'],30);assert(a.values['--timer-progress']>.98);
web.status='finished';web.deadline=1100000;a.ctx.syncTimer(40,'SWAP PHASE',web,{serverNow:1060000,received:7000,rtt:0});assert.equal(a.attributes['aria-valuemax'],40);
web.status='paused';a.ctx.syncTimer(0,'DRAFT PAUSED',web,{serverNow:1060000,received:7000,rtt:0});assert.equal(a.attributes['aria-valuenow'],0);
const pausedWrites=a.writes;
for(let i=0;i<1200;i++){a.set(7050+i*50);a.tick();}
assert.equal(a.writes,pausedWrites);
a.replace();a.ctx.drawTimer();assert.equal(a.writes,pausedWrites+3);
assert.equal(a.attributes['aria-valuenow'],0);assert.equal(a.values['--timer-progress'],0);
web.status='finished';web.deadline=1072000;a.ctx.syncTimer(12,'SWAP PHASE',web,{serverNow:1060000,received:67000,rtt:0});
assert.equal(a.attributes['aria-valuenow'],12);
a.set(79000);a.tick();assert.equal(a.attributes['aria-valuenow'],0);assert.equal(a.values['--timer-progress'],0);
const expiredWrites=a.writes;a.set(79050);a.tick();assert.equal(a.writes,expiredWrites);
console.log('PASS shared deadline, monotonic countdown, turns, pause, expiry and replacement without repeated idle writes');
