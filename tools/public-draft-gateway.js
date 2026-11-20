const http=require('http'),crypto=require('crypto');
const GET_PATHS=new Set(['/draft.html','/common.js','/styles.css','/draft-effects.css','/draft-team.css','/draft-team.js','/draft-preview.js','/placeholder.svg','/draft-empty.svg','/api/state','/api/champion-list','/api/champion-icon','/api/champion-splash']);
function createGateway(port=3197){
 const limits=new Map();
 const logoByHash=new Map(),logoByData=new Map();
 function publicLogo(src){
  if(typeof src!=='string'||!src.startsWith('data:'))return src;
  const match=src.match(/^data:image\/(png|jpeg|webp|svg\+xml);base64,([a-z0-9+/=]+)$/i);if(!match)return '';
  let hash=logoByData.get(src);if(!hash){hash=crypto.createHash('sha256').update(src).digest('hex');logoByData.set(src,hash);logoByHash.set(hash,{data:Buffer.from(match[2],'base64'),type:'image/'+match[1].toLowerCase()});while(logoByData.size>12){const oldest=logoByData.keys().next().value;const oldHash=logoByData.get(oldest);logoByData.delete(oldest);logoByHash.delete(oldHash)}}
  return '/api/draft-logo/'+hash;
 }
 const fail=(res,code,text)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:text}))};
 return http.createServer((req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  let url;try{url=new URL(req.url,'http://public-draft.invalid')}catch(_){return fail(res,400,'잘못된 주소입니다.')}
  const logoMatch=url.pathname.match(/^\/api\/draft-logo\/([a-f0-9]{64})$/);
  if(req.method==='GET'&&logoMatch){const logo=logoByHash.get(logoMatch[1]);if(!logo)return fail(res,404,'로고를 찾을 수 없습니다.');res.writeHead(200,{'Content-Type':logo.type,'Cache-Control':'public, max-age=86400, immutable','X-Content-Type-Options':'nosniff'});return res.end(logo.data)}
  if(req.method==='GET'&&url.pathname==='/'){res.writeHead(302,{Location:'/draft.html'});return res.end()}
  if(!(req.method==='GET'&&GET_PATHS.has(url.pathname))&&!(req.method==='POST'&&url.pathname==='/api/web-draft/action'))return fail(res,403,'외부에는 웹 밴픽만 공개됩니다. 진행자 컨트롤은 서버 PC에서 사용하세요.');
  if(req.headers.origin){try{if(new URL(req.headers.origin).host!==req.headers.host)return fail(res,403,'다른 사이트에서 보내는 요청은 허용하지 않습니다.')}catch(_){return fail(res,403,'잘못된 출처입니다.')}}
  const ip=String(req.headers['cf-connecting-ip']||req.socket.remoteAddress).slice(0,80),now=Date.now();let cell=limits.get(ip);if(!cell||now-cell.at>10000){cell={at:now,count:0};if(limits.size>=5000)limits.delete(limits.keys().next().value);limits.set(ip,cell)}if(++cell.count>400)return fail(res,429,'요청이 너무 많습니다. 잠시 후 다시 시도하세요.');
  if(req.method==='POST'&&Number(req.headers['content-length']||0)>4096)return fail(res,413,'요청 크기가 너무 큽니다.');
  const headers={host:'public-draft.invalid','content-type':'application/json'};if(req.headers.authorization)headers.authorization=req.headers.authorization;if(req.method==='POST')headers.origin='http://public-draft.invalid';
  const upstream=http.request({hostname:'127.0.0.1',port,path:url.pathname+url.search,method:req.method,headers},reply=>{
   if(url.pathname==='/api/state'){let data='';reply.on('data',chunk=>data+=chunk);reply.on('end',()=>{try{const state=JSON.parse(data),event=state.event?{...state.event,logo:publicLogo(state.event.logo)}:state.event,blue=state.blue?{...state.blue,logo:publicLogo(state.blue.logo)}:state.blue,red=state.red?{...state.red,logo:publicLogo(state.red.logo)}:state.red;res.writeHead(reply.statusCode,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({serverNow:state.serverNow,event,blue,red,draft:state.draft,webDraft:state.webDraft,clientFearless:state.clientFearless?{games:state.clientFearless.games}:undefined,fearless:state.fearless?{games:state.fearless.games,active:state.fearless.active,complete:state.fearless.complete}:undefined}))}catch(_){fail(res,502,'HUD 상태를 읽지 못했습니다.')}});}
   else{res.writeHead(reply.statusCode,{'Content-Type':reply.headers['content-type']||'application/octet-stream','Cache-Control':reply.headers['cache-control']||'no-store'});reply.pipe(res)}
  });
  upstream.setTimeout(10000,()=>upstream.destroy(Error('timeout')));upstream.on('error',()=>{if(!res.headersSent)fail(res,502,'서버 PC의 HUD 연결을 확인하세요.');else res.destroy()});
  let length=0;req.on('data',chunk=>{length+=chunk.length;if(req.method==='POST'&&length>4096){upstream.destroy();if(!res.headersSent)fail(res,413,'요청 크기가 너무 큽니다.');return}upstream.write(chunk)});req.on('end',()=>upstream.end());req.on('error',()=>upstream.destroy());
 });
}
if(require.main===module)createGateway(Number(process.env.HUD_ORIGIN_PORT||3197)).listen(Number(process.env.HUD_GATEWAY_PORT||3200),'127.0.0.1',()=>console.log('Public draft gateway ready'));
module.exports={createGateway,GET_PATHS};
