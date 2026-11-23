const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{spawn}=require('child_process');
const ResultCore=require('../public/result-core');
async function freePort(){
 const probe=require('http').createServer();
 await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));
 const {port}=probe.address();
 await new Promise(resolve=>probe.close(resolve));
 return port;
}
async function main(){
 const source=path.resolve(__dirname,'..'),scratch=fs.mkdtempSync(path.join(require('os').tmpdir(),'hud-web-draft-'));
 const port=await freePort(),gatewayPort=await freePort();
 for(const dir of ['public','tools'])fs.cpSync(path.join(source,dir),path.join(scratch,dir),{recursive:true,filter:p=>!p.startsWith(path.join(source,'public','uploads'))});
 fs.mkdirSync(path.join(scratch,'data','ddragon'),{recursive:true});for(const name of ['champions.json','hud-static.json','item-prices.json']){const file=path.join(source,'data','ddragon',name);if(fs.existsSync(file))fs.copyFileSync(file,path.join(scratch,'data','ddragon',name))}
 const server=fs.readFileSync(path.join(source,'server.js'),'utf8');
 assert(server.includes('\nstartGoldOcr();')&&server.includes('listenPort:3202'));
 fs.writeFileSync(path.join(scratch,'server.js'),server
  .replace('\nstartGoldOcr();','\n// Screen capture is disabled in the isolated HTTP test.')
  .replace('listenPort:3202','listenPort:'+gatewayPort));
 const stateFile=path.join(scratch,'data/state.json');
 const sourceState=['data/state.example.json','data/state.json'].map(file=>path.join(source,file)).find(file=>fs.existsSync(file));
 const state=JSON.parse(fs.readFileSync(sourceState));
 state.connection.autoSync=false;state.connection.leaguePath='';state.game.screenGoldOcr=false;state.game.autoQuestIcons=false;state.game.goldHistory=[];
 for(const side of ['blue','red']){state[side].name=side;state[side].short=side;state[side].logo='';state[side].players=Array(5).fill('')}
 state.event.name='Test';state.event.logo='';
 for(const key of ['webDraft','fearless','clientFearless','result','liveMatch'])delete state[key];
 fs.writeFileSync(stateFile,JSON.stringify(state));
 const base='http://127.0.0.1:'+port;
 const start=()=>spawn(process.execPath,['server.js'],{cwd:scratch,env:{...process.env,HUD_TEST_PORT:String(port),HUD_HOST:'127.0.0.1'},windowsHide:true,stdio:'ignore'});
 let child=start();
 async function stop(){if(child.exitCode!==null||child.signalCode)return;await new Promise(resolve=>{child.once('exit',resolve);child.kill()})}
 function request(url,body,headers={}){return new Promise((resolve,reject)=>{const data=body?JSON.stringify(body):'';const req=require('http').request(base+url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(body?{'Content-Length':Buffer.byteLength(data)}:{}),...headers}},res=>{let text='';res.on('data',chunk=>text+=chunk);res.on('end',()=>{try{resolve({code:res.statusCode,body:JSON.parse(text)})}catch(error){reject(error)}})});req.on('error',reject);req.end(data)})}
 async function waitUntilReady(){
  let ready=false;for(let i=0;i<100;i++){try{await request('/api/state');ready=true;break}catch(_){await new Promise(r=>setTimeout(r,100))}}assert(ready);
 }
 try{
  await waitUntilReady();
  const beforeSwap=(await request('/api/state')).body;assert.equal((await request('/api/teams/swap',{})).code,200);const afterSwap=(await request('/api/state')).body;assert.equal(afterSwap.blue.name,beforeSwap.red.name);assert.equal(afterSwap.red.name,beforeSwap.blue.name);assert.equal(afterSwap.blue.color,'#0050d1');assert.equal(afterSwap.red.color,'#ff4f6d');assert.equal((await request('/api/teams/swap',{})).code,200);
  assert.equal((await request('/api/state',{game:{manualBarons:true,blueBarons:2,manualHeralds:true,redHeralds:1}})).code,200);const manual=(await request('/api/state')).body;assert.equal(manual.game.blueBarons,2);assert.equal(manual.game.redHeralds,1);
  const created=await request('/api/web-draft/admin',{action:'create',seconds:10});assert.equal(created.code,200);
  const tokens=Object.fromEntries(['blue','red'].map(side=>[side,created.body.links[side].split('#')[1]]));
  assert.equal((await request('/api/web-draft/admin',{action:'pause'},{Host:'remote.test'})).code,403);
  assert.equal((await request('/api/state',{blue:{score:99}},{Host:'remote.test'})).code,403);
  assert.equal((await request('/api/web-draft/action',{action:'ready'})).code,403);
  assert.equal((await request('/api/web-draft/admin',{action:'pause'},{Origin:'https://wrong.test'})).code,403);
  const command=async(side,action,extra={})=>{const s=(await request('/api/state')).body;return request('/api/web-draft/action',{room:s.webDraft.room,step:s.webDraft.step,action,...extra},{Authorization:'Bearer '+tokens[side],Host:'remote.test',Origin:'http://remote.test'})};
  assert.equal((await command('blue','ready')).code,200);assert.equal((await command('red','ready')).code,200);
  assert.equal((await request('/api/teams/swap',{})).code,409);
  assert.equal((await command('red','hover',{id:1})).code,409);
  assert.equal((await command('blue','skip')).code,409);
  const champions=(await request('/api/champion-list?lang=en')).body;
  for(let i=0;i<6;i++){assert.equal((await command(i%2?'red':'blue','hover',{id:champions[i].id})).code,200);assert.equal((await command(i%2?'red':'blue','lock',{id:champions[i].id})).code,200)}
  const id=champions[6].id,chosen=champions[7].id;
  assert.equal((await command('blue','hover',{id})).code,200);let observed=(await request('/api/state')).body;assert.equal(observed.draft.bluePicks[0].id,id);assert.equal(observed.draft.bluePicks[0].locked,false);
  const stream=await fetch(base+'/api/events');const reader=stream.body.getReader();const chunk=await reader.read();assert(Buffer.from(chunk.value).toString().includes('webDraft'));await reader.cancel();
  assert.equal((await command('blue','lock')).code,409);
  const locked=await command('blue','lock',{id:chosen});
  assert.equal(locked.code,200);assert.equal(locked.body.locked.id,chosen);
  observed=(await request('/api/state')).body;
  assert.equal(observed.draft.bluePicks[0].locked,true);assert.equal(observed.draft.bluePicks[0].id,chosen);
  assert.equal((await command('red','hover',{id:chosen})).code,409);
  assert.equal((await fetch(base+'/draft.html?team=blue')).status,200);
  const remoteControl=await new Promise((resolve,reject)=>{require('http').get(base+'/control.html',{headers:{Host:'remote.test'}},res=>{res.resume();resolve(res.statusCode)}).on('error',reject)});assert.equal(remoteControl,403);
  await request('/api/web-draft/admin',{action:'create',seconds:10});assert.equal((await command('blue','ready')).code,403);
  const seriesOptions={seconds:20,rofsSide:'blue',category:'side',selection:'blue',opponent:'second'};
  const series=await request('/api/web-draft/admin',{action:'series-create',...seriesOptions});
  assert.equal(series.code,200);
  // Start from a finished first draft, then use the real next-set endpoint.
  await stop();
  const finished=JSON.parse(fs.readFileSync(stateFile));
  finished.webDraft.status='complete';
  for(const [index,side] of ['blue','red'].entries())finished.draft[side+'Picks']=champions
    .slice(index*5,index*5+5).map(c=>({id:c.id,name:c.name,locked:true}));
  fs.writeFileSync(stateFile,JSON.stringify(finished));child=start();await waitUntilReady();
  const first=(await request('/api/state')).body,snapshot=ResultCore.snapshot(first);
  const saved=await request('/api/state',{result:{snapshot,winner:'blue',goldImage:'/uploads/game-one.png'},resultGuard:ResultCore.target(first)});
  assert.equal(saved.code,200);
  const next=await request('/api/web-draft/admin',{action:'next-set',room:series.body.room,
    winner:'blue',rofsSide:'red',category:'side',selection:'red',opponent:'first'});
  assert.equal(next.code,200);
  const late=await request('/api/state',{result:{goldImage:'/uploads/delayed.png'},resultGuard:ResultCore.target(saved.body.state)});
  assert.equal(late.code,409);
  let restored;
  for(let i=0;i<2;i++){
    assert.equal((await fetch(base+'/control.html')).status,200);
    restored=(await request('/api/state')).body;
    assert.equal(restored.event.game,2);assert.equal(restored.blue.score,1);
    assert.equal(restored.fearless.games.length,1);assert.equal(restored.webDraft.room,next.body.room);
    assert.equal(restored.result.snapshot.event.game,1);assert.equal(restored.result.goldImage,'/uploads/game-one.png');
    assert.deepEqual((await request('/api/web-draft/links')).body.links,next.body.links);
    assert.equal((await request('/api/web-draft/links',undefined,{Host:'remote.test'})).code,403);
    if(i===0){await stop();child=start();await waitUntilReady();}
  }
  const accidentalReset=await request('/api/web-draft/admin',{action:'series-create',...seriesOptions});
  assert.equal(accidentalReset.code,400);
  assert.equal((await request('/api/state')).body.fearless.games.length,1);

  // Simulate a tunnel process that outlives the server without opening a real tunnel.
  await stop();
  const tunnelUrl='https://qa-no-tunnel.invalid';
  fs.writeFileSync(path.join(scratch,'data/public-hud.json'),JSON.stringify({running:true,ready:true,pid:process.pid,url:tunnelUrl}));
  child=start();await waitUntilReady();
  const status=await request('/api/public-hud/status');
  assert.equal(status.body.ready,true);assert.equal(status.body.url,tunnelUrl);
  const gateway='http://127.0.0.1:'+gatewayPort;
  const relayed=await (await fetch(gateway+'/api/state')).json();
  assert.equal(relayed.event.game,2);assert.equal(relayed.connection,undefined);
  assert.equal((await fetch(gateway+'/control.html')).status,403);

  const second=(await request('/api/state')).body;
  const secondSaved=await request('/api/state',{result:{snapshot:ResultCore.snapshot(second),winner:'red'},resultGuard:ResultCore.target(second)});
  assert.equal(secondSaved.code,200);
  assert.equal(secondSaved.body.state.result.snapshot.event.game,2);
  assert.equal(secondSaved.body.state.result.goldImage,undefined);
  console.log('PASS HTTP: exact locks, restored room links, isolated set results and read-only gateway recovery');
 }finally{
  await stop();
  const target=path.resolve(scratch);
  if(path.dirname(target)===path.resolve(require('os').tmpdir())&&path.basename(target).startsWith('hud-web-draft-')) {
    fs.rmSync(target,{recursive:true,force:true});
  }
 }
}
main().catch(error=>{console.error(error.stack);process.exitCode=1});
