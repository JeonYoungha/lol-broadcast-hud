const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),server=fs.readFileSync(path.join(root,'server.js'),'utf8');
let passed=0;
function check(name,fn){fn();passed++;console.log('PASS '+name)}
function isolate(start,end,context={}){const a=server.indexOf(start),b=server.indexOf(end,a+start.length);assert(a>=0&&b>a);vm.createContext(context);vm.runInContext(server.slice(a,b),context);return context}
check('merge accepts new graphs after reset and preserves other settings',()=>{
 const c=isolate('const merge =','function json');c.target={result:{damageData:null,snapshot:{clock:'30:00'}},blue:{players:['Manual']}};
 vm.runInContext('merge(target,{result:{damageData:{blue:[{damage:12345}],red:[]}}})',c);
 assert.equal(c.target.result.damageData.blue[0].damage,12345);assert.equal(c.target.result.snapshot.clock,'30:00');assert.equal(c.target.blue.players[0],'Manual');
 c.patch=JSON.parse('{"__proto__":{"polluted":true},"result":{"constructor":{"danger":true}}}');vm.runInContext('merge(target,patch)',c);assert.equal(c.target.polluted,undefined);assert.equal(c.target.result.constructor,Object);
});
check('broadcast does not repeat unchanged state',()=>{
 let writes=0;const c=isolate("let lastBroadcast=",'const goldText',{state:{game:{clock:'00:00'}},clients:new Set([{write(){writes++}}])});
 vm.runInContext('broadcast();broadcast();broadcast()',c);assert.equal(writes,1);
 c.state.game.clock='00:01';vm.runInContext('broadcast()',c);assert.equal(writes,2);
});
check('incomplete role quest is not complete',()=>{
 const c=isolate('function roleQuestSignal','const spellKey');
 assert.equal(c.roleQuestSignal({roleQuest:{status:'incomplete'}}),false);
 assert.equal(c.roleQuestSignal({roleQuest:{status:'completed'}}),true);
 assert.equal(c.roleQuestSignal({roleQuestCompleted:false}),false);
 assert.equal(c.roleQuestSignal({}),null);
});
check('gold history samples every five game seconds',()=>{
 const c=isolate('function recordGoldHistory','let goldCells',{state:{game:{clock:'00:00'}}});
 c.recordGoldHistory(1000,900);c.state.game.clock='00:04';c.recordGoldHistory(1100,1000);assert.equal(c.state.game.goldHistory.length,1);
 c.state.game.clock='00:05';c.recordGoldHistory(1200,1000);assert.equal(c.state.game.goldHistory.length,2);
 c.state.game.clock='00:20';c.recordGoldHistory(1500,1300);c.state.game.clock='00:00';c.recordGoldHistory(500,500);assert.equal(c.state.game.goldHistory.length,1);
});
check('CS holds the last OCR value',()=>{
 const c=isolate('function latestScreenCs','function clearGoldOcr',{csCells:{blue:[{value:123,at:0}],red:[]}});
 assert.equal(c.latestScreenCs('blue',0),123);assert.equal(c.latestScreenCs('red',0),null);
});
check('manual player names are never assigned by server sync',()=>assert(!/state\[side\]\.players\s*=/.test(server)));
check('gold SVG handles positive, negative, missing and zero crossing',()=>{
 const source=fs.readFileSync(path.join(root,'public/result.js'),'utf8'),c={HUD:{state:{}}};vm.createContext(c);
 vm.runInContext(source.slice(source.indexOf('function goldGraph('),source.indexOf('function damageGraph(')),c);
 for(const diffs of [[0,1000,7000],[0,-1000,-5000],[0,1000,-2000,500],[0,0,0]]){
  const result=c.goldGraph([],{points:diffs.map((diff,i)=>({diff,seconds:i*60})),duration:180});
  assert(result.includes('<svg'));assert(!/NaN|Infinity/.test(result));
 }
 assert(c.goldGraph([]).includes('no-history'));
});
check('items are mirrored by price and trinket stays separate',()=>{
 const source=fs.readFileSync(path.join(root,'public/ingame.html'),'utf8'),c={HUD:{item:id=>'/item/'+id}};vm.createContext(c);
 vm.runInContext(source.slice(source.indexOf('const trinketIds='),source.indexOf("fetch('/api/item-prices')")),c);
 vm.runInContext('itemPrices={1:100,2:500}',c);
 const items=[{id:2,slot:0},{id:1,slot:1},{id:3340,slot:6}];
 const blue=c.itemSlots(items,'blue'),red=c.itemSlots(items,'red');
 assert(blue.indexOf('/item/1')<blue.indexOf('/item/2'));assert(red.indexOf('/item/2')<red.indexOf('/item/1'));
 assert(blue.indexOf('/item/3340')<blue.indexOf('main-items'));assert(red.indexOf('/item/3340')>red.indexOf('/item/1'));
});
check('draft timer counts down without champion changes',()=>{
 const source=fs.readFileSync(path.join(root,'public/draft.html'),'utf8');let time=0;const values={},attributes={},timer={style:{setProperty:(key,value)=>values[key]=Number(value)},setAttribute:(key,value)=>attributes[key]=Number(value)},c={app:{querySelector:()=>timer},performance:{now:()=>time},setInterval:()=>{}};
 vm.createContext(c);vm.runInContext(source.slice(source.indexOf('let timerDeadline='),source.indexOf('const visiblePicks=')),c);
 c.syncTimer(30,'PICK');assert.equal(values['--timer-progress'],1);
 time=2000;c.syncTimer(30,'PICK');assert.equal(attributes['aria-valuenow'],28);assert.equal(values['--timer-progress'],28/30);
 time=2500;c.syncTimer(25,'BAN');assert.equal(attributes['aria-valuenow'],25);assert.equal(values['--timer-progress'],1);
 time=27500;c.drawTimer();assert.equal(values['--timer-progress'],0);
 time=28000;c.syncTimer(25,'BAN');assert.equal(values['--timer-progress'],0);
 c.syncTimer(30,'BAN');assert.equal(values['--timer-progress'],1);
});
check('legacy five-slot draft displays manual nickname above champion',()=>{
 const source=fs.readFileSync(path.join(root,'public/draft.html'),'utf8'),c={HUD:{escape:value=>String(value??''),splash:()=>'/test.jpg'}};
 vm.createContext(c);vm.runInContext(source.slice(source.indexOf('function side('),source.indexOf('function bans(')),c);
 const names=['Manual TOP','Manual JGL','Manual MID','Manual BOT','Manual SUP'],state={blue:{color:'#123456',players:names},draft:{bluePicks:[]}};
 const html=c.side(state,'blue',new Set());assert.equal((html.match(/class="pick /g)||[]).length,5);for(const name of names)assert(html.includes(name));assert(!html.includes('PLAYER'));assert(!html.includes('<img'));
 state.draft.bluePicks=names.map((name,i)=>({id:i+1,name:'Champion '+i,locked:true}));const picked=c.side(state,'blue',new Set());assert(picked.includes('Champion'));for(const name of names)assert(picked.includes(name));assert(picked.indexOf('Manual TOP')<picked.indexOf('Champion 0'));
});
check('all JavaScript and inline page scripts parse',()=>{
 for(const directory of ['public','tools']){
  for(const file of fs.readdirSync(path.join(root,directory))){if(file.endsWith('.js'))new vm.Script(fs.readFileSync(path.join(root,directory,file),'utf8'),{filename:file});}
 }
 new vm.Script(server,{filename:'server.js'});
 for(const file of fs.readdirSync(path.join(root,'public')).filter(f=>f.endsWith('.html'))){
  const html=fs.readFileSync(path.join(root,'public',file),'utf8');
  for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)){if(match[1].trim())new vm.Script(match[1],{filename:file});}
 }
});
async function reconnect(){
 const c={window:{},location:{hostname:'127.0.0.1'},document:{body:{classList:{add(){},remove(){}}}},fetch:async()=>{throw Error('temporary offline')},console:{error(){},warn(){}},EventSource:class {constructor(){c.stream=this}}};
 vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(root,'public/common.js'),'utf8'),c);
 let calls=0;await c.window.HUD.init(()=>calls++);assert(c.stream);c.stream.onmessage({data:'{"game":{"clock":"00:10"}}'});assert.equal(c.window.HUD.state.game.clock,'00:10');assert.equal(calls,1);passed++;console.log('PASS page reconnects even if initial fetch failed');
}
reconnect().then(()=>console.log('TOTAL '+passed+' checks passed')).catch(e=>{console.error(e);process.exitCode=1});
