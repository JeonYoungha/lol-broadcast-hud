const fs=require('fs'),path=require('path'),http=require('http'),{spawn}=require('child_process');
const root=path.resolve(__dirname,'..'),statusFile=path.join(root,'data/public-draft.json');
const binary=path.join(root,'runtime/cloudflared.exe');let gateway=null,tunnel=null,url='',stopping=false;
function status(value){fs.writeFileSync(statusFile,JSON.stringify({url,at:Date.now(),...value}))}
function stop(){if(stopping)return;stopping=true;tunnel?.kill();gateway?.close();status({running:false});process.exit()}
async function main(){
 if(!fs.existsSync(binary))throw Error('runtime/cloudflared.exe가 필요합니다. 공식 Cloudflare 배포본을 설치하세요.');
 try{const old=JSON.parse(fs.readFileSync(statusFile));if(old.running&&old.pid&&old.pid!==process.pid){try{process.kill(old.pid,0);throw Error('외부 연결이 이미 실행 중입니다. 먼저 기존 연결을 종료하세요.')}catch(error){if(error.code!=='ESRCH')throw error}}}catch(error){if(error.code!=='ENOENT'&&!(error instanceof SyntaxError))throw error}
 await new Promise((resolve,reject)=>{http.get('http://127.0.0.1:3197/api/state',res=>{res.resume();res.statusCode===200?resolve():reject(Error('HUD 서버를 먼저 실행하세요.'))}).on('error',()=>reject(Error('START_HUD.bat로 HUD 서버를 먼저 실행하세요.')))});
 gateway=require('./public-draft-gateway').createGateway();await new Promise((resolve,reject)=>{gateway.once('error',reject);gateway.listen(3200,'127.0.0.1',resolve)});
 status({running:true,pid:process.pid,ready:false});
 tunnel=spawn(binary,['tunnel','--no-autoupdate','--url','http://127.0.0.1:3200','--protocol','http2'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
 let text='';function output(chunk){text=(text+chunk.toString()).slice(-24000);const match=text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);if(match&&!url){url=match[0];status({running:true,pid:process.pid,ready:true});console.log('외부 밴픽 주소: '+url);console.log('컨트롤 페이지에서 접속 링크 보기를 누르세요. 종료하면 외부 접속이 끊깁니다.')}}
 tunnel.stdout.on('data',output);tunnel.stderr.on('data',output);tunnel.on('error',error=>{console.error(error.message);stop()});tunnel.on('exit',()=>{console.log('외부 연결이 종료되었습니다.');stop()});
 process.on('SIGINT',stop);process.on('SIGTERM',stop);process.on('exit',()=>tunnel?.kill());
  setInterval(()=>{try{const info=JSON.parse(fs.readFileSync(statusFile,'utf8'));if(info.pid===process.pid&&info.stopRequested)stop()}catch(_){}},1000);
 setTimeout(()=>{if(!url){console.error('외부 주소 생성 대기 시간이 초과됐습니다. 네트워크를 확인하세요.');stop()}},60000).unref();
}
main().catch(error=>{console.error(error.message);process.exitCode=1;gateway?.close();try{const info=JSON.parse(fs.readFileSync(statusFile));if(info.pid===process.pid)status({running:false,ready:false,error:error.message})}catch(_){}});
