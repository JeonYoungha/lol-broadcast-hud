const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{spawn}=require('child_process');
async function main(){
 const source=path.resolve(__dirname,'..'),scratch=fs.mkdtempSync(path.join(require('os').tmpdir(),'hud-web-draft-'));
 for(const dir of ['public','tools','data'])fs.cpSync(path.join(source,dir),path.join(scratch,dir),{recursive:true});
 fs.copyFileSync(path.join(source,'server.js'),path.join(scratch,'server.js'));
 const stateFile=path.join(scratch,'data/state.json'),state=JSON.parse(fs.readFileSync(stateFile));state.connection.autoSync=false;state.game.screenGoldOcr=false;delete state.webDraft;fs.writeFileSync(stateFile,JSON.stringify(state));
 const child=spawn(process.execPath,['server.js'],{cwd:scratch,env:{...process.env,HUD_TEST_PORT:'3198',HUD_HOST:'127.0.0.1'},windowsHide:true,stdio:'ignore'});
 const base='http://127.0.0.1:3198';
 function request(url,body,headers={}){return new Promise((resolve,reject)=>{const data=body?JSON.stringify(body):'';const req=require('http').request(base+url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(body?{'Content-Length':Buffer.byteLength(data)}:{}),...headers}},res=>{let text='';res.on('data',chunk=>text+=chunk);res.on('end',()=>{try{resolve({code:res.statusCode,body:JSON.parse(text)})}catch(error){reject(error)}})});req.on('error',reject);req.end(data)})}
 try{
  let ready=false;for(let i=0;i<100;i++){try{await request('/api/state');ready=true;break}catch(_){await new Promise(r=>setTimeout(r,100))}}assert(ready);
  const created=await request('/api/web-draft/admin',{action:'create',seconds:10});assert.equal(created.code,200);
  const tokens=Object.fromEntries(['blue','red'].map(side=>[side,created.body.links[side].split('#')[1]]));
  assert.equal((await request('/api/web-draft/admin',{action:'pause'},{Host:'remote.test'})).code,403);
  assert.equal((await request('/api/state',{blue:{score:99}},{Host:'remote.test'})).code,403);
  assert.equal((await request('/api/web-draft/action',{action:'ready'})).code,403);
  assert.equal((await request('/api/web-draft/admin',{action:'pause'},{Origin:'https://wrong.test'})).code,403);
  const command=async(side,action,extra={})=>{const s=(await request('/api/state')).body;return request('/api/web-draft/action',{room:s.webDraft.room,step:s.webDraft.step,action,...extra},{Authorization:'Bearer '+tokens[side],Host:'remote.test',Origin:'http://remote.test'})};
  assert.equal((await command('blue','ready')).code,200);assert.equal((await command('red','ready')).code,200);
  assert.equal((await command('red','hover',{id:1})).code,409);
  assert.equal((await command('blue','skip')).code,409);
  const champions=(await request('/api/champion-list?lang=en')).body;
  for(let i=0;i<6;i++){assert.equal((await command(i%2?'red':'blue','hover',{id:champions[i].id})).code,200);assert.equal((await command(i%2?'red':'blue','lock')).code,200)}
  const id=champions[6].id;
  assert.equal((await command('blue','hover',{id})).code,200);let observed=(await request('/api/state')).body;assert.equal(observed.draft.bluePicks[0].id,id);assert.equal(observed.draft.bluePicks[0].locked,false);
  const stream=await fetch(base+'/api/events');const reader=stream.body.getReader();const chunk=await reader.read();assert(Buffer.from(chunk.value).toString().includes('webDraft'));await reader.cancel();
  assert.equal((await command('blue','lock')).code,200);observed=(await request('/api/state')).body;assert.equal(observed.draft.bluePicks[0].locked,true);
  assert.equal((await command('red','hover',{id})).code,409);
  assert.equal((await fetch(base+'/draft.html?team=blue')).status,200);
  const remoteControl=await new Promise((resolve,reject)=>{require('http').get(base+'/control.html',{headers:{Host:'remote.test'}},res=>{res.resume();resolve(res.statusCode)}).on('error',reject)});assert.equal(remoteControl,403);
  await request('/api/web-draft/admin',{action:'create',seconds:10});assert.equal((await command('blue','ready')).code,403);
  console.log('PASS HTTP: isolated room, team authorization, host control isolation, CSRF, order, hover/lock, SSE observer, duplicates, expired links');
 }finally{child.kill()}
}
main().catch(error=>{console.error(error.stack);process.exitCode=1});
