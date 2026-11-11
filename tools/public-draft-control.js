const fs=require('fs'),path=require('path'),{spawn}=require('child_process');
function createPublicControl(root,{launch=spawn,alive=pid=>{try{process.kill(pid,0);return true}catch(_){return false}},executable=process.execPath}={}){
 const file=path.join(root,'data/public-draft.json');
 const read=()=>{try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch(_){return {}}};
 function get(){const info=read(),running=!!(info.running&&Number.isInteger(info.pid)&&info.pid>0&&alive(info.pid));return {running,ready:running&&!!info.ready&&!info.stopRequested,stopping:running&&!!info.stopRequested,url:running&&info.ready&&!info.stopRequested?info.url||'':'',error:info.error||'',cloudflaredInstalled:fs.existsSync(path.join(root,'runtime/cloudflared.exe'))}}
 function begin(){const current=get();if(current.stopping)throw Error('외부 연결 종료 중입니다. 잠시 후 다시 시작하세요.');if(current.running)return {ok:true,alreadyRunning:true,...current};
  if(!fs.existsSync(path.join(root,'runtime/cloudflared.exe')))throw Error('공식 Cloudflare 연결 도구가 없습니다. runtime/cloudflared.exe를 확인하세요.');
  const child=launch(executable,['tools/start-public-draft.js'],{cwd:root,windowsHide:true,detached:true,stdio:'ignore'});
  fs.writeFileSync(file,JSON.stringify({running:true,ready:false,url:'',pid:child.pid,at:Date.now()}));
  const failed=message=>{const info=read();if(info.pid===child.pid&&info.running)fs.writeFileSync(file,JSON.stringify({...info,running:false,ready:false,url:'',error:message}))};
  child.on('error',error=>failed(error.message));child.on('exit',()=>failed('외부 연결이 종료되었습니다. 네트워크 상태를 확인하고 다시 시작하세요.'));
  child.unref?.();
  return {ok:true,running:true,ready:false,url:''};
 }
 function end(){const info=read();if(get().running)fs.writeFileSync(file,JSON.stringify({...info,stopRequested:true}));return {ok:true}}
 return {get,begin,end};
}
module.exports={createPublicControl};
