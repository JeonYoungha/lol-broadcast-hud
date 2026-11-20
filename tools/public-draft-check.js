const http=require('http'),assert=require('assert/strict'),{createGateway}=require('./public-draft-gateway');
async function main(){let last;
 const logo=Buffer.alloc(100000,42),logoUrl='data:image/png;base64,'+logo.toString('base64');
 const origin=http.createServer((req,res)=>{last={host:req.headers.host,authorization:req.headers.authorization,path:req.url};res.setHeader('Content-Type','application/json');res.end(JSON.stringify({serverNow:123456,event:{name:'Test',logo:logoUrl},blue:{name:'Blue',logo:logoUrl},red:{name:'Red'},draft:{timer:30},webDraft:{enabled:true},fearless:{games:[{picks:[1,2]}],active:true,undo:{secret:'PRIVATE'}},connection:{leaguePath:'PRIVATE'},result:{secret:'PRIVATE'},game:{secret:'PRIVATE'}}))});
 await new Promise(r=>origin.listen(0,'127.0.0.1',r));const gateway=createGateway(origin.address().port);await new Promise(r=>gateway.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+gateway.address().port;
 try{const state=await fetch(base+'/api/state').then(r=>r.json());assert.equal(state.serverNow,123456);assert(!state.connection&&!state.result&&!state.game);assert(state.draft&&state.webDraft);assert.deepEqual(state.fearless.games[0].picks,[1,2]);assert(!state.fearless.undo);assert(state.event.logo.startsWith('/api/draft-logo/'));assert.equal(state.blue.logo,state.event.logo);assert(JSON.stringify(state).length<2000);const image=await fetch(base+state.event.logo);assert.equal(image.status,200);assert.match(image.headers.get('cache-control'),/immutable/);assert.deepEqual(Buffer.from(await image.arrayBuffer()),logo);assert.equal((await fetch(base+'/api/draft-logo/'+'0'.repeat(64))).status,404);
 for(const target of ['/control.html','/ingame.html','/result.html','/api/events','/api/web-draft/admin','/api/web-draft/public-status','/api/web-draft/public-start','/api/web-draft/public-stop','/uploads/test.png','/data/state.json','/../control.html'])assert.equal((await fetch(base+target)).status,403);
 assert.equal((await fetch(base+'/api/state',{method:'POST',body:'{}'})).status,403);
 assert.equal((await fetch(base+'/api/web-draft/action',{method:'POST',headers:{Origin:'https://wrong.example'},body:'{}'})).status,403);
 assert.equal((await fetch(base+'/api/web-draft/action',{method:'POST',headers:{Authorization:'Bearer test'},body:'{}'})).status,200);assert.equal(last.host,'public-draft.invalid');assert.equal(last.authorization,'Bearer test');
 assert.equal((await fetch(base+'/api/web-draft/action',{method:'POST',body:'x'.repeat(5000)})).status,413);
 console.log('PASS public gateway: allowlist, private-data removal, origin checks, size limits, team authorization forwarding');
 }finally{gateway.closeAllConnections();gateway.close();origin.closeAllConnections();origin.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
