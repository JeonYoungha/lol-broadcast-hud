const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { spawn } = require('child_process');
const crypto = require('crypto');
const { createEngine } = require('./tools/web-draft-engine');
const { createPublicControl } = require('./tools/public-draft-control');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const publicConnection=createPublicControl(ROOT);
const STATE_FILE = path.join(ROOT, 'data', 'state.json');
if(!fs.existsSync(STATE_FILE))fs.copyFileSync(path.join(ROOT,'data','state.example.json'),STATE_FILE);
const DDRAGON_ROOT = path.join(ROOT, 'data', 'ddragon');
const PORT = Number(process.env.HUD_TEST_PORT || process.env.PORT || 3197);
let state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
let clients = new Set();
let lcu = null;
let championMap = new Map();
let championAlias = new Map();
let championLookup = new Map();
let spellIconMap = new Map();
let runeIconMap = new Map();
let itemPriceMap = new Map();
let ddragonVersion = '';
let ddragonReady = null;
const ACCESS_FILE=path.join(ROOT,'data','web-draft-access.json');
let webAccess={};
try{webAccess=JSON.parse(fs.readFileSync(ACCESS_FILE,'utf8'))}catch(_){}
const webDraft=createEngine(state,{championName:id=>championMap.get(id),championIds:()=>[...championMap.keys()],roomId:()=>crypto.randomUUID()});
const localRequest=req=>['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)&&/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(req.headers.host||'');
function sameOrigin(req){if(!req.headers.origin)return true;try{return new URL(req.headers.origin).host===req.headers.host}catch(_){return false}}
function teamFor(req){const token=String(req.headers.authorization||'').replace(/^Bearer /,'');if(!/^[a-f0-9]{48}$/.test(token))return;return ['blue','red'].find(side=>typeof webAccess[side]==='string'&&token.length===webAccess[side].length&&crypto.timingSafeEqual(Buffer.from(token),Buffer.from(webAccess[side])))}
fs.mkdirSync(DDRAGON_ROOT, { recursive:true });

const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.json':'application/json; charset=utf-8' };
const save = () => {
  const temporary=STATE_FILE+'.tmp';
  fs.writeFileSync(temporary,JSON.stringify(state,null,2));
  fs.renameSync(temporary,STATE_FILE);
};
let lastBroadcast='';
const broadcast = () => {
  const msg = `data: ${JSON.stringify(state)}\n\n`;
  if(msg===lastBroadcast)return;
  lastBroadcast=msg;
  for (const res of clients) if(!res.destroyed&&!res.writableEnded)res.write(msg);
};
const goldText = value => `${(Math.max(0,Number(value)||0)/1000).toFixed(1)}K`;
function recordGoldHistory(blue,red) {
  const parts=String(state.game.clock||'').split(':').map(Number);
  const seconds=parts.length===2?parts[0]*60+parts[1]:NaN;
  if (!Number.isFinite(seconds)||seconds<0||!Number.isFinite(blue)||!Number.isFinite(red)) return;
  const history=state.game.goldHistory||(state.game.goldHistory=[]),last=history.at(-1);
  if (last&&seconds<last.seconds-5) history.length=0;
  else if (last&&seconds-last.seconds<5) return;
  history.push({seconds,blue,red});
  if (history.length>2400) history.splice(0,history.length-2400);
}
let goldCells={blue:Array(5).fill(null),red:Array(5).fill(null)};
let csCells={blue:Array(5).fill(null),red:Array(5).fill(null)};
let apiCsCells={blue:Array(5).fill(null),red:Array(5).fill(null)};
let screenGrubCounts={blue:null,red:null};
let pendingGrubCounts={blue:null,red:null};
let lastLiveSeconds=null;
function latestScreenCs(side,index) {
  const cell=csCells[side]?.[index];
  return cell?cell.value:null;
}
function clearGoldOcr() {
  goldCells={blue:Array(5).fill(null),red:Array(5).fill(null)};
  csCells={blue:Array(5).fill(null),red:Array(5).fill(null)};
  screenGrubCounts={blue:null,red:null};
  pendingGrubCounts={blue:null,red:null};
  if (!state.game.screenGoldOcr) return;
  state.game.blueGold='—';
  state.game.redGold='—';
  state.game.laneGoldDiffs=[0,0,0,0,0];
  state.game.goldOcrStatus='X 점수판 인식 대기 중';
}
clearGoldOcr();
function applyGoldOcr(data) {
  if (!state.game.screenGoldOcr) return;
  const now=Date.now();
  const expected=side=>Math.max(1,Math.min(5,(state.draft[side+'Picks']||[]).length||5));
  for (const side of ['blue','red']) {
    const grubs=data?.[side+'Grubs'];
    if (!state.game.manualGrubs&&Number.isInteger(grubs)&&grubs>=0&&grubs<=6) {
      const pending=pendingGrubCounts[side];
      pendingGrubCounts[side]={value:grubs,seen:pending?.value===grubs?pending.seen+1:1};
      if (pendingGrubCounts[side].seen>=2) {
        screenGrubCounts[side]=grubs;
        state.game[side+'Grubs']=grubs;
      }
    }
    const latest=Array.isArray(data?.[side])?data[side]:[];
    for (let i=0;i<5;i++) if (Number.isFinite(latest[i])&&latest[i]>=0&&latest[i]<100000) goldCells[side][i]={value:latest[i],at:now};
    const latestCs=Array.isArray(data?.[side+'Cs'])?data[side+'Cs']:[];
    const zoomCs=Array.isArray(data?.[side+'CsZoom'])?data[side+'CsZoom']:[];
    for (let i=0;i<5;i++) {
      const apiCs=apiCsCells[side][i];
      const valid=value=>Number.isInteger(value)&&value>=0&&value<=2000&&(!Number.isFinite(apiCs)||Math.abs(value-apiCs)<=15);
      const value=[zoomCs[i],latestCs[i]].find(valid);
      if (value===undefined) continue;
      csCells[side][i]={value,at:now};
      if (state.draft[side+'Picks']?.[i]) state.draft[side+'Picks'][i].cs=value;
    }
  }
  const blue=goldCells.blue.map(cell=>cell&&now-cell.at<4000?cell.value:null);
  const red=goldCells.red.map(cell=>cell&&now-cell.at<4000?cell.value:null);
  const blueValues=blue.filter(Number.isFinite),redValues=red.filter(Number.isFinite);
  if (blueValues.length<expected('blue')||redValues.length<expected('red')) {
    state.game.goldOcrStatus=data?.reason==='aspect'?`화면 인식 대기 · ${data.width}×${data.height} (16:9 필요)`:blueValues.length||redValues.length?`X 점수판 인식 중 · 블루 ${blueValues.length}/${expected('blue')} · 레드 ${redValues.length}/${expected('red')}`:'X 점수판 인식 대기 중';
    return broadcast();
  }
  state.game.blueGold=goldText(blueValues.reduce((a,b)=>a+b,0));
  state.game.redGold=goldText(redValues.reduce((a,b)=>a+b,0));
  state.game.laneGoldDiffs=Array.from({length:5},(_,i)=>Number.isFinite(blue[i])&&Number.isFinite(red[i])?blue[i]-red[i]:0);
  state.game.goldOcrStatus=`화면 골드 자동 인식 · 블루 ${blueValues.length}명 · 레드 ${redValues.length}명`;
  recordGoldHistory(blueValues.reduce((a,b)=>a+b,0),redValues.reduce((a,b)=>a+b,0));
  broadcast();
}
function startGoldOcr() {
  if (process.platform!=='win32') return;
  const helper=path.join(ROOT,'tools','gold-ocr.ps1');
  if (!fs.existsSync(helper)) return;
  const child=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',helper,'-ParentPid',String(process.pid)],{windowsHide:true,stdio:['ignore','pipe','ignore']});
  child.stdout.setEncoding('utf8');
  let pending='';
  child.stdout.on('data',chunk=>{pending+=chunk;const lines=pending.split(/\r?\n/);pending=lines.pop()||'';for(const line of lines){try{applyGoldOcr(JSON.parse(line))}catch(_){}}});
}
const merge = (target, patch) => {
  for (const [key, value] of Object.entries(patch || {})) {
    if (['__proto__','prototype','constructor'].includes(key)) continue;
    if (value && typeof value === 'object' && !Array.isArray(value) && target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) merge(target[key], value);
    else target[key] = value;
  }
};
function json(res, code, body) { res.writeHead(code, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); res.end(JSON.stringify(body)); }
function readBody(req) { return new Promise((resolve, reject) => { let b=''; req.on('data', d => { b += d; if (b.length > 8_000_000) reject(new Error('too large')); }); req.on('end', () => { try { resolve(JSON.parse(b || '{}')); } catch(e) { reject(e); } }); }); }

function fetchBuffer(url, redirects=3) {
  return new Promise((resolve,reject) => {
    const request=https.get(url,res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects) { res.resume();return resolve(fetchBuffer(new URL(res.headers.location,url).toString(),redirects-1)); }
      if (res.statusCode < 200 || res.statusCode >= 300) { res.resume(); return reject(Object.assign(new Error(`HTTP ${res.statusCode}`),{status:res.statusCode})); }
      const chunks=[]; res.on('data',d=>chunks.push(d)); res.on('end',()=>resolve({body:Buffer.concat(chunks),type:res.headers['content-type']||'application/octet-stream'}));
    }).on('error',reject);
    request.setTimeout(8000,()=>request.destroy(new Error('이미지 서버 응답 시간 초과')));
  });
}
async function initDataDragon() {
  if (ddragonReady) return ddragonReady;
  ddragonReady=(async()=>{
    const metadataFile=path.join(DDRAGON_ROOT,'champions.json');
    let metadata=null;
    try {
      const versions=JSON.parse((await fetchBuffer('https://ddragon.leagueoflegends.com/api/versions.json')).body.toString('utf8'));
      ddragonVersion=versions[0];
      metadata=JSON.parse((await fetchBuffer(`https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/data/en_US/champion.json`)).body.toString('utf8'));
      fs.writeFileSync(metadataFile,JSON.stringify({version:ddragonVersion,data:metadata.data},null,2));
    } catch(e) {
      if (!fs.existsSync(metadataFile)) throw e;
      const cached=JSON.parse(fs.readFileSync(metadataFile,'utf8')); ddragonVersion=cached.version; metadata={data:cached.data};
    }
    championMap=new Map(); championAlias=new Map(); championLookup=new Map();
    for (const champ of Object.values(metadata.data||{})) { const id=Number(champ.key); championMap.set(id,champ.name); championAlias.set(id,champ.id); championLookup.set(champ.id.toLowerCase(),id); championLookup.set(champ.name.toLowerCase(),id); }
    const hudMetadataFile=path.join(DDRAGON_ROOT,'hud-static.json');
    let hudMetadata=null;
    try {
      const [spells,runes]=await Promise.all([
        fetchBuffer(`https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/data/en_US/summoner.json`),
        fetchBuffer(`https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/data/en_US/runesReforged.json`)
      ]);
      hudMetadata={version:ddragonVersion,spells:JSON.parse(spells.body.toString('utf8')).data,runes:JSON.parse(runes.body.toString('utf8'))};
      fs.writeFileSync(hudMetadataFile,JSON.stringify(hudMetadata));
    } catch(e) {
      if (fs.existsSync(hudMetadataFile)) hudMetadata=JSON.parse(fs.readFileSync(hudMetadataFile,'utf8'));
    }
    spellIconMap=new Map(); runeIconMap=new Map();
    for (const spell of Object.values(hudMetadata?.spells||{})) spellIconMap.set(String(spell.id),spell.image?.full||`${spell.id}.png`);
    for (const style of hudMetadata?.runes||[]) for (const slot of style.slots||[]) for (const rune of slot.runes||[]) runeIconMap.set(Number(rune.id),rune.icon);
    const itemPricesFile=path.join(DDRAGON_ROOT,'item-prices.json');
    let itemPrices=null;
    if (fs.existsSync(itemPricesFile)) {
      try { itemPrices=JSON.parse(fs.readFileSync(itemPricesFile,'utf8')); } catch(_) {}
    }
    try {
      if (itemPrices?.version!==ddragonVersion) {
        const response=await fetchBuffer(`https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/data/en_US/item.json`);
        const data=JSON.parse(response.body.toString('utf8')).data||{};
        itemPrices={version:ddragonVersion,prices:Object.fromEntries(Object.entries(data).map(([id,item])=>[id,Number(item.gold?.total)||0]))};
        fs.writeFileSync(itemPricesFile,JSON.stringify(itemPrices));
      }
    } catch(e) {}
    itemPriceMap=new Map(Object.entries(itemPrices?.prices||{}).map(([id,price])=>[Number(id),price]));
    return true;
  })().catch(e=>{ddragonReady=null;throw e});
  return ddragonReady;
}
async function ddragonAsset(type,id,skinId=0) {
  await initDataDragon();
  if (type==='item') {
    const itemId=Number(id); if (!itemId) throw new Error('unknown item');
    const dir=path.join(DDRAGON_ROOT,ddragonVersion,'item'); fs.mkdirSync(dir,{recursive:true});
    const file=path.join(dir,`${itemId}.png`);
    if (fs.existsSync(file)) return {body:fs.readFileSync(file),type:'image/png'};
    const asset=await fetchBuffer(`https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/item/${itemId}.png`); fs.writeFileSync(file,asset.body); return asset;
  }
  const alias=championAlias.get(Number(id)); if (!alias) throw new Error('unknown champion');
  const skinNum=skinId ? Number(skinId)%1000 : 0;
  const ext=type==='icon'?'png':'jpg';
  const name=type==='icon'?`${alias}.${ext}`:`${alias}_${skinNum}.${ext}`;
  const dir=path.join(DDRAGON_ROOT,ddragonVersion,type); fs.mkdirSync(dir,{recursive:true});
  const file=path.join(dir,name);
  if (fs.existsSync(file)) return {body:fs.readFileSync(file),type:type==='icon'?'image/png':'image/jpeg'};
  const url=type==='icon'?`https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/champion/${alias}.png`:`https://ddragon.leagueoflegends.com/cdn/img/champion/${type==='portrait'?'loading':'splash'}/${alias}_${skinNum}.jpg`;
  try { const asset=await fetchBuffer(url); fs.writeFileSync(file,asset.body); return asset; }
  catch(e) {
    if (type==='splash' && skinNum!==0) return ddragonAsset('splash',id,0);
    throw e;
  }
}
async function ddragonHudAsset(type,key) {
  await initDataDragon();
  const safe=String(key||'').replace(/[^a-zA-Z0-9_-]/g,'');
  const remote=type==='spell'?`https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/spell/${spellIconMap.get(safe)||`${safe}.png`}`:`https://ddragon.leagueoflegends.com/cdn/img/${runeIconMap.get(Number(key))||''}`;
  if (!safe||remote.endsWith('/')) throw new Error('unknown hud asset');
  const dir=path.join(DDRAGON_ROOT,ddragonVersion,type); fs.mkdirSync(dir,{recursive:true});
  const file=path.join(dir,`${safe}.png`);
  if (fs.existsSync(file)) return {body:fs.readFileSync(file),type:'image/png'};
  const asset=await fetchBuffer(remote); fs.writeFileSync(file,asset.body); return asset;
}
async function warmBaseSplashes() {
  await initDataDragon();
  const ids=[...championMap.keys()];
  let next=0,ready=0;
  const workers=Array.from({length:8},async()=>{
    while(next<ids.length){
      const id=ids[next++];
      try { await ddragonAsset('splash',id,0); ready++; } catch (_) {}
    }
  });
  await Promise.all(workers);
  return ready;
}

function loadCredentials() {
  const configured = state.connection.leaguePath || '';
  const candidates = [configured, 'C:\\Riot Games\\League of Legends', 'D:\\Riot Games\\League of Legends'];
  for (const dir of [...new Set(candidates.filter(Boolean))]) {
    const file = path.join(dir, 'lockfile');
    if (!fs.existsSync(file)) continue;
    const [name,pid,port,password,protocol] = fs.readFileSync(file,'utf8').trim().split(':');
    if (port && password) return { name,pid,port:Number(port),password,protocol:protocol || 'https' };
  }
  return null;
}
function lcuRequest(route, binary=false) {
  return new Promise((resolve, reject) => {
    if (!lcu) return reject(new Error('클라이언트 인증정보 없음'));
    const req = https.request({ hostname:'127.0.0.1', port:lcu.port, path:route, method:'GET', rejectUnauthorized:false, headers:{ Authorization:'Basic '+Buffer.from('riot:'+lcu.password).toString('base64') } }, res => {
      const chunks=[]; res.on('data',d=>chunks.push(d)); res.on('end',()=>{
        const body=Buffer.concat(chunks);
        if (res.statusCode < 200 || res.statusCode >= 300) return reject(Object.assign(new Error('LCU '+res.statusCode),{status:res.statusCode}));
        if (binary) return resolve({body,type:res.headers['content-type']||'image/png'});
        try { resolve(JSON.parse(body.toString('utf8'))); } catch(e) { reject(e); }
      });
    }); req.on('error',reject); req.setTimeout(2000,()=>req.destroy(new Error('롤 클라이언트 응답 시간 초과')));req.end();
  });
}
function liveRequest(route='/liveclientdata/allgamedata') {
  return new Promise((resolve,reject) => {
    const req=https.request({hostname:'127.0.0.1',port:2999,path:route,method:'GET',rejectUnauthorized:false},res=>{const chunks=[];res.on('data',d=>chunks.push(d));res.on('end',()=>{if(res.statusCode<200||res.statusCode>=300)return reject(new Error('Live API '+res.statusCode));try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))}catch(e){reject(e)}})});req.on('error',reject);req.setTimeout(2000,()=>req.destroy(new Error('인게임 API 응답 시간 초과')));req.end();
  });
}
function roleQuestSignal(player) {
  const q=player.roleQuest||player.rolequest||player.quest||player.positionQuest;
  for (const value of [player.roleQuestCompleted,player.questCompleted,q?.completed,q?.complete,q?.isComplete,q?.isCompleted]) if (typeof value==='boolean') return value;
  const status=String(q?.status||q?.state||'').toLowerCase();
  if (/progress|active|incomplete/.test(status)) return false;
  if (/complete|finished|rewarded/.test(status)) return true;
  const itemText=JSON.stringify(player.items||[]).toLowerCase();
  if (/rolequest[^}]{0,80}(complete|reward)/.test(itemText)) return true;
  return null;
}
const spellKey=spell=>{
  const key=String(spell?.rawDisplayName||'').match(/SummonerSpell_([^_]+)_DisplayName/i)?.[1]||'';
  return key.startsWith('SummonerFlashPerksHextechFlashtraption')?'SummonerFlash':key;
};
async function syncLiveGame() {
  try {
    const live=await liveRequest();
    state.draft.activeBanSlots={blue:-1,red:-1};
    const seconds=Math.max(0,Math.floor(live.gameData?.gameTime||0));
    if (lastLiveSeconds!==null&&seconds<lastLiveSeconds-10) { clearGoldOcr(); state.game.goldHistory=[]; }
    lastLiveSeconds=seconds;
    state.game.clock=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
    const teams={blue:(live.allPlayers||[]).filter(p=>p.team==='ORDER'),red:(live.allPlayers||[]).filter(p=>p.team==='CHAOS')};
    for (const side of ['blue','red']) {
      if (!teams[side].length) continue;
      teams[side].slice(0,5).forEach((p,i)=>{apiCsCells[side][i]=Number(p.scores?.creepScore||0)});
      // Broadcast player names are manual settings; never overwrite them with account nicknames.
      state.draft[side+'Picks']=teams[side].map((p,index)=>({
        id:Number(p.championId||0)||championLookup.get(String(p.rawChampionName||'').replace(/^game_character_displayname_/i,'').replace(/^character_/i,'').replace(/_name$/i,'').toLowerCase())||championLookup.get(String(p.championName||'').toLowerCase())||0,
        skinId:Number(p.skinID||p.skinId||0), name:p.championName||'CHAMPION', level:Number(p.level||0),
        kda:{kills:Number(p.scores?.kills||0),deaths:Number(p.scores?.deaths||0),assists:Number(p.scores?.assists||0)},
        cs:latestScreenCs(side,index)??0, items:(p.items||[]).map((item,slot)=>({id:Number(item.itemID||item.itemId||0),slot:item.slot!==undefined&&Number.isInteger(Number(item.slot))?Number(item.slot):slot,count:Number(item.count||1),name:item.displayName||''})),
        spells:Object.values(p.summonerSpells||{}).slice(0,2).map(spell=>({key:spellKey(spell),name:spell.displayName||''})),
        keystone:{id:Number(p.runes?.keystone?.id||0),name:p.runes?.keystone?.displayName||''},
        isDead:Boolean(p.isDead),respawnTimer:Math.max(0,Math.ceil(Number(p.respawnTimer)||0)),ultLearned:Number(p.level||0)>=6
      })).slice(0,5);
      state.game[side+'Kills']=teams[side].reduce((n,p)=>n+Number(p.scores?.kills||0),0);
      const roleMap={TOP:'top',JUNGLE:'jungle',MIDDLE:'mid',BOTTOM:'bot',UTILITY:'support',SUPPORT:'support'};
      const fallback=['top','jungle','mid','bot','support'];
      const roleState={...(state.game[side+'RoleQuests']||{})};
      teams[side].slice(0,5).forEach((p,i)=>{
        const role=roleMap[String(p.position||'').toUpperCase()]||fallback[i];
        const signal=roleQuestSignal(p);
        if (!(role in roleState)) roleState[role]=false;
        if (signal!==null) roleState[role]=signal;
      });
      state.game[side+'RoleQuests']=roleState;
    }
    const playerSide=new Map();
    for (const side of ['blue','red']) for (const p of teams[side]) {
      for (const value of [p.summonerName,p.riotId,p.riotIdGameName]) {
        const key=String(value||'').trim().toLowerCase();
        if (key) { playerSide.set(key,side); playerSide.set(key.split('#')[0],side); }
      }
    }
    const events=live.events?.Events||[];
    const counts={blueTowers:0,redTowers:0,blueDragons:0,redDragons:0,blueBarons:0,redBarons:0,blueGrubs:0,redGrubs:0,blueHeralds:0,redHeralds:0};
    const allDragonTypes=[],epicKills={blue:0,red:0};
    let firstBloodSide=null,firstTowerSide=null,epicFeatSide=null;
    let lastDragon=null,lastBaron=null;
    const eventSide=e=>{
      const teamHint=String(e.KillerTeam??e.Team??e.KillerTeamID??e.DragonKilledBy??'').toUpperCase();
      if (teamHint==='ORDER'||teamHint==='BLUE'||teamHint==='100'||teamHint==='1') return 'blue';
      if (teamHint==='CHAOS'||teamHint==='RED'||teamHint==='200'||teamHint==='2') return 'red';
      for (const value of [e.KillerName,...(e.Assisters||[])]) {
        const key=String(value||'').trim().toLowerCase();
        if (playerSide.has(key)) return playerSide.get(key);
        if (playerSide.has(key.split('#')[0])) return playerSide.get(key.split('#')[0]);
        if (/minion_t100/i.test(key)) return 'blue';
        if (/minion_t200/i.test(key)) return 'red';
      }
      if (e.EventName==='TurretKilled') {
        if (/turret_torder/i.test(String(e.TurretKilled||''))) return 'red';
        if (/turret_tchaos/i.test(String(e.TurretKilled||''))) return 'blue';
      }
      return null;
    };
    for (const e of events) {
      const eventTime=Number(e.EventTime);
      if (Number.isFinite(eventTime)&&eventTime>seconds+1) continue;
      if (Number.isFinite(eventTime)&&eventTime<=seconds+1) {
        if (e.EventName==='DragonKill') {
          allDragonTypes.push(String(e.DragonType||'Dragon'));
          if (!lastDragon||eventTime>Number(lastDragon.EventTime||0)) lastDragon=e;
        }
        if (e.EventName==='BaronKill'&&(!lastBaron||eventTime>Number(lastBaron.EventTime||0))) lastBaron=e;
      }
      const side=eventSide(e); if (!side) continue;
      if ((e.EventName==='ChampionKill'||e.EventName==='FirstBlood'||e.EventName==='FirstBloodKill')&&!firstBloodSide) firstBloodSide=side;
      if (e.EventName==='TurretKilled') { counts[side+'Towers']++; if (!firstTowerSide) firstTowerSide=side; }
      if (e.EventName==='DragonKill') counts[side+'Dragons']++;
      if (e.EventName==='BaronKill') counts[side+'Barons']++;
      if (e.EventName==='HordeKill') counts[side+'Grubs']++;
      if (e.EventName==='HeraldKill') counts[side+'Heralds']++;
      if (['DragonKill','BaronKill','HordeKill','HeraldKill'].includes(e.EventName)) {
        epicKills[side]++;
        if (!epicFeatSide&&epicKills[side]>=3) epicFeatSide=side;
      }
    }
    const manualGrubs=Boolean(state.game.manualGrubs);
    delete counts.blueDragons; delete counts.redDragons;
    if (manualGrubs) { delete counts.blueGrubs; delete counts.redGrubs; }
    else for (const side of ['blue','red']) {
      if (Number.isInteger(screenGrubCounts[side])) counts[side+'Grubs']=screenGrubCounts[side];
    }
    Object.assign(state.game,counts);
    if (!state.game.manualNextDragon) {
      state.game.nextDragonType=(state.game.blueDragons>=4||state.game.redDragons>=4)?'Elder':(allDragonTypes[2]||'');
    }
    const respawnLeft=(lastKillAt,firstSpawn,delay)=>{
      if (!Number.isFinite(lastKillAt)||lastKillAt>seconds+1) return seconds<firstSpawn?firstSpawn-seconds:0;
      return Math.max(0,Math.ceil(lastKillAt+delay-seconds));
    };
    const dragonDelay=/elder/i.test(String(lastDragon?.DragonType||''))?360:300;
    const storedTime=value=>value===null||value===undefined?NaN:Number(value);
    const recentKill=(...times)=>times.filter(t=>Number.isFinite(t)&&t<=seconds+1).reduce((a,b)=>Math.max(a,b),-Infinity);
    state.game.dragonRespawn=respawnLeft(recentKill(storedTime(lastDragon?.EventTime),storedTime(state.game.manualDragonKillAt)),300,dragonDelay);
    state.game.baronRespawn=respawnLeft(recentKill(storedTime(lastBaron?.EventTime),storedTime(state.game.manualBaronKillAt)),1200,360);
    state.connection.status='인게임·리플레이 데이터 자동 연결됨';
    return true;
  } catch(e) {
    return false;
  }
}
let leagueSyncBusy=false;
async function syncLeague() {
  if(state.webDraft?.enabled)return;
  if (!state.connection.autoSync||leagueSyncBusy) return;
  leagueSyncBusy=true;
  try {
    lcu = loadCredentials();
    if (!lcu) throw new Error('롤 클라이언트를 찾지 못했습니다');
    const phase = await lcuRequest('/lol-gameflow/v1/gameflow-phase');
    state.connection.phase = phase;
    if (!championMap.size) {
      try { await initDataDragon(); } catch (_) {}
    }
    if (!championMap.size) {
      const champs = await lcuRequest('/lol-game-data/assets/v1/champion-summary.json');
      championMap = new Map(champs.map(c => [Number(c.id), c.name]));
    }
    let session = null;
    try { session = await lcuRequest('/lol-champ-select/v1/session'); } catch (_) {}
    if (session) {
      let currentChampion = 0;
      try { currentChampion = Number(await lcuRequest('/lol-champ-select/v1/current-champion')) || 0; } catch (_) {}
      applyChampSelect(session,currentChampion);
      state.connection.status = `롤 밴픽 자동 연결됨 · ${phase}`;
    } else {
      const liveConnected=await syncLiveGame();
      if (!liveConnected) state.connection.status = `롤 연결됨 · ${phase} · 인게임/리플레이 대기 중`;
    }
  } catch (e) {
    state.connection.status = e.status === 404 ? '관전자 밴픽 데이터 없음 · 수동 조작 가능' : e.message;
  } finally {
    leagueSyncBusy=false;
  }
  broadcast();
}
function applyChampSelect(session,currentChampion=0) {
  if(state.webDraft?.enabled)return;
  const mine = new Set((session.myTeam || []).map(x => x.cellId));
  const theirs = new Set((session.theirTeam || []).map(x => x.cellId));
  const picks = { blue:[], red:[] }, bans = { blue:[], red:[] };
  const activeBanSlots={blue:-1,red:-1},banActionSlots={blue:0,red:0};
  const livePicks = new Map();
  const lockedPickCells = new Set();
  for (const group of session.actions || []) for (const a of group) {
    const side = mine.has(a.actorCellId) ? 'blue' : theirs.has(a.actorCellId) ? 'red' : null;
    if (!side) continue;
    if (a.type === 'pick' && a.championId && (!a.completed || a.isInProgress)) livePicks.set(a.actorCellId, Number(a.championId));
    if (a.type === 'pick' && a.completed && a.championId) lockedPickCells.add(a.actorCellId);
    if (a.type === 'ban') {
      const slot=banActionSlots[side]++;
      if (a.completed) bans[side][slot]=Number(a.championId)||0;
      if (!a.completed && a.isInProgress && slot<5) activeBanSlots[side]=slot;
    }
  }
  if (currentChampion && Number.isInteger(session.localPlayerCellId)) livePicks.set(session.localPlayerCellId,currentChampion);
  const toPicks = (team,side) => (team || []).map((p,i) => {
    const lockedId = Number(p.championId || 0);
    const hoverId = Number(livePicks.get(p.cellId) || p.championPickIntent || 0);
    const id = hoverId || lockedId;
    return {
      id,
      skinId:0,
      name:championMap.get(id) || state[side].players[i] || 'PICK',
      locked:lockedPickCells.has(p.cellId)
    };
  });
  picks.blue = toPicks(session.myTeam,'blue'); picks.red = toPicks(session.theirTeam,'red');
  state.draft.bluePicks = picks.blue;
  state.draft.redPicks = picks.red;
  state.draft.blueBans = [...bans.blue,0,0,0,0,0].slice(0,5);
  state.draft.redBans = [...bans.red,0,0,0,0,0].slice(0,5);
  state.draft.activeBanSlots=activeBanSlots;
  state.draft.phase = session.timer?.phase || 'CHAMP SELECT';
  const timeLeftMs=Number(session.timer?.adjustedTimeLeftInPhase ?? session.timer?.phaseTimeRemaining ?? 0);
  state.draft.timer = Math.max(0,Math.ceil(timeLeftMs/1000));
}

async function analyzeResultGraph(imagePath) {
  await initDataDragon();
  const ids=[...championMap.keys()];let next=0;
  await Promise.all(Array.from({length:8},async()=>{while(next<ids.length){try{await ddragonAsset('icon',ids[next++]);}catch(_){}}}));
  return new Promise((resolve,reject)=>{
    const child=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(ROOT,'tools','result-graph.ps1'),'-ImagePath',imagePath,'-MetadataRoot',DDRAGON_ROOT],{windowsHide:true});
    let out='',err='';const timer=setTimeout(()=>{child.kill();reject(Error('이미지 분석 시간이 초과됐습니다.'));},45000);
    child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
    child.stdout.on('data',s=>out+=s);child.stderr.on('data',s=>err+=s);
    child.on('error',e=>{clearTimeout(timer);reject(e)});
    child.on('close',code=>{clearTimeout(timer);try{
      if(code!==0)throw Error('딜량 그래프를 읽지 못했습니다. 숫자가 보이는 이미지를 사용해주세요.');
      const data=JSON.parse(out.trim().split(/\r?\n/).at(-1));
      if(!['blue','red'].every(side=>data[side]?.length===5))throw Error('양 팀 5명씩 인식되지 않았습니다.');
      data.missingCount=[...data.blue,...data.red].filter(p=>p.damage===null||!Number.isFinite(p.damage)).length;
      data.warning=data.missingCount?data.missingCount+'명의 딜량을 읽지 못했습니다. 아래 딜량 보정에서 입력해주세요.':data.estimated?'일부 딜량은 막대 길이로 추정했습니다. 숫자를 확인해주세요.':'';
      resolve(data);
    }catch(e){reject(e)}});
  });
}
function analyzeGoldGraph(imagePath,options={}) {
  return new Promise((resolve,reject)=>{
    const duration=Number(options.durationSeconds)||0;if(!Number.isInteger(duration)||duration<0||duration>21600)return reject(Error('그래프 끝 시간을 6시간 이내로 입력해주세요.'));
    const child=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(ROOT,'tools','result-gold-graph.ps1'),'-ImagePath',imagePath,'-DurationSeconds',String(duration)],{windowsHide:true});
    let output='';const timer=setTimeout(()=>{child.kill();reject(Error('골드 그래프 분석 시간이 초과됐습니다.'))},30000);
    child.stdout.setEncoding('utf8');child.stdout.on('data',text=>output+=text);child.stderr.resume();
    child.on('error',e=>{clearTimeout(timer);reject(e)});
    child.on('close',code=>{clearTimeout(timer);try{
      if(!output.trim())throw Error('골드 분석 도구를 실행하지 못했습니다. Windows OCR 사용 여부를 확인해주세요.');
      const data=JSON.parse(output.trim().split(/\r?\n/).at(-1));
      if(code!==0||data.error){const message=String(data.error||'');if(/zero-gold/.test(message))throw Error('골드 0선을 찾지 못했습니다. 기준선과 그래프 좌우 끝까지 포함해 선택해주세요.');if(/grid spacing/.test(message))throw Error('골드 가로 눈금을 찾지 못했습니다. 왼쪽 골드 숫자와 가로 눈금선을 포함해주세요.');if(/time labels|time scale/.test(message))throw Error('시간 숫자를 읽지 못했습니다. 아래 시간 눈금을 2개 이상 포함하거나, 그래프 끝 시간을 직접 입력한 뒤 다시 인식해주세요.');if(/curve/.test(message))throw Error('골드 그래프 선을 찾지 못했습니다. 파란색·빨간색 선 전체를 선명하게 캡처해주세요.');throw Error('골드 그래프를 읽지 못했습니다. 그래프 전체와 축이 보이도록 다시 선택해주세요.');}
      if(data.points?.length<30)throw Error('그래프 선을 충분히 찾지 못했습니다.');
      resolve(data);
    }catch(e){reject(e)}});
  });
}
const server = http.createServer(async (req,res) => {
  const u = new URL(req.url, `http://${req.headers.host}`);
  if(u.pathname==='/api/web-draft/public-status'&&req.method==='GET'){
    if(!localRequest(req))return json(res,403,{error:'로컬 진행자 전용입니다.'});
    return json(res,200,publicConnection.get());
  }
  if(req.method==='POST'&&!sameOrigin(req))return json(res,403,{error:'다른 사이트에서 보내는 요청은 허용하지 않습니다.'});
  if(req.method==='POST'&&!localRequest(req)&&u.pathname!=='/api/web-draft/action')return json(res,403,{error:'진행자 조작은 서버 PC에서만 가능합니다.'});
  if(u.pathname==='/control.html'&&!localRequest(req)){res.writeHead(403);return res.end('Host control is local only');}
  if(u.pathname==='/api/web-draft/public-stop'&&req.method==='POST'){
    return json(res,200,publicConnection.end());
  }
  if(u.pathname==='/api/web-draft/public-start'&&req.method==='POST'){
    try{return json(res,200,publicConnection.begin())}catch(error){return json(res,400,{error:error.message})}
  }
  if(u.pathname==='/api/web-draft/admin'&&req.method==='POST'){
    try{const body=await readBody(req);if(['create','series-create','next-set','undo-set'].includes(body.action)){
      await initDataDragon();
      if(body.action==='create'){if(state.fearless?.active&&!state.fearless.complete)throw Error('시리즈 진행 중입니다. 다음 세트 버튼을 사용하세요.');delete state.fearless;webDraft.create(body.seconds)}
      else if(body.action==='series-create')webDraft.startSeries(body);
      else if(body.action==='next-set')webDraft.nextSet(body);
      else webDraft.undoSet();
      if(body.action!=='next-set'||!state.fearless?.complete){webAccess={blue:crypto.randomBytes(24).toString('hex'),red:crypto.randomBytes(24).toString('hex')};fs.writeFileSync(ACCESS_FILE,JSON.stringify(webAccess));}
    }else if(body.action!=='links')webDraft.admin(body.action);
    save();broadcast();return json(res,200,{ok:true,links:Object.fromEntries(['blue','red'].map(side=>[side,`/draft.html?team=${side}#${webAccess[side]||''}`])),room:state.webDraft?.room});
    }catch(e){return json(res,400,{error:e.message})}
  }
  if(u.pathname==='/api/web-draft/action'&&req.method==='POST'){
    try{const side=teamFor(req);if(!side)return json(res,403,{error:'팀 접속 링크가 잘못됐거나 만료됐습니다.'});webDraft.command(side,await readBody(req));save();broadcast();return json(res,200,{ok:true});}catch(e){return json(res,409,{error:e.message})}
  }
  if (u.pathname === '/api/state' && req.method === 'GET') return json(res,200,state);
  if (u.pathname === '/api/state' && req.method === 'POST') {
    try { const patch=await readBody(req);if(state.webDraft?.enabled&&patch.draft)return json(res,409,{error:'웹 밴픽 진행 중에는 밴픽 수동 조작을 사용할 수 없습니다.'});delete patch.webDraft;merge(state,patch); save(); broadcast(); return json(res,200,{ok:true,state}); }
    catch(e) { return json(res,400,{ok:false,error:e.message}); }
  }
  if (u.pathname === '/api/events') {
    res.writeHead(200, {'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});
    res.write(`data: ${JSON.stringify(state)}\n\n`); clients.add(res); req.on('close',()=>clients.delete(res)); return;
  }
  if (u.pathname === '/api/result-image' && req.method === 'POST') {
    try {
      const body=await readBody(req),match=String(body.dataUrl||'').match(/^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/);
      if (!match) return json(res,400,{ok:false,error:'JPG 이미지 형식이 올바르지 않습니다.'});
      const image=Buffer.from(match[2],'base64');
      const valid=match[1]==='png'?image.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):image[0]===255&&image[1]===216&&image[2]===255;
      if (image.length<8||image.length>5_000_000||!valid) return json(res,400,{ok:false,error:'이미지 파일을 확인해주세요. 최대 5MB입니다.'});
      const directory=path.join(PUBLIC,'uploads');fs.mkdirSync(directory,{recursive:true});
      const filename=`result-damage-${Date.now()}-${Math.random().toString(16).slice(2,8)}.${match[1]==='png'?'png':'jpg'}`;
      fs.writeFileSync(path.join(directory,filename),image);
      if(body.graphType==='gold'){
        const data=await analyzeGoldGraph(path.join(directory,filename),{durationSeconds:body.durationSeconds});
        if(body.preview!==true){state.result=state.result||{};state.result.goldData=data;state.result.goldImage='/uploads/'+filename;save();broadcast()}
        return json(res,200,{ok:true,url:'/uploads/'+filename,data});
      }
      if(body.preview===true){
        try{const data=await analyzeResultGraph(path.join(directory,filename));return json(res,200,{ok:true,url:'/uploads/'+filename,data,analysisError:data.warning||''})}
        catch(e){return json(res,400,{ok:false,error:e.message})}
      }
      state.result=state.result||{};state.result.damageImage='/uploads/'+filename;
      state.result.damageData=null;state.result.damageAnalysisError='';
      try{state.result.damageData=await analyzeResultGraph(path.join(directory,filename));state.result.damageAnalysisError=state.result.damageData.warning||''}catch(e){state.result.damageAnalysisError=e.message}
      save();broadcast();return json(res,200,{ok:true,url:state.result.damageImage,analysisError:state.result.damageAnalysisError,data:state.result.damageData});
    } catch(e) { return json(res,400,{ok:false,error:e.message}); }
  }
  if(u.pathname==='/api/result-analyze'&&req.method==='POST'){
    try{
      const imageUrl=state.result?.damageImage||'';
      if(!/^\/uploads\/result-damage-[a-zA-Z0-9-]+\.(jpg|png)$/.test(imageUrl))throw Error('저장된 딜량 이미지가 없습니다.');
      const data=await analyzeResultGraph(path.join(PUBLIC,imageUrl.slice(1)));
      state.result.damageData=data;state.result.damageAnalysisError=data.warning||'';save();broadcast();
      return json(res,200,{ok:true,data,analysisError:data.warning||''});
    }catch(e){return json(res,400,{ok:false,error:e.message})}
  }
  if(u.pathname==='/api/champion-list'){
    try{
      await initDataDragon();
      if(u.searchParams.get('lang')==='en')return json(res,200,[...championMap].map(([id,name])=>({id,name})));
      const file=path.join(DDRAGON_ROOT,'champions-ko.json');let metadata=null;
      if(fs.existsSync(file)){try{metadata=JSON.parse(fs.readFileSync(file,'utf8'))}catch(_){}}
      if(metadata?.version!==ddragonVersion){
        try{const remote=JSON.parse((await fetchBuffer(`https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/data/ko_KR/champion.json`)).body.toString('utf8'));metadata={version:ddragonVersion,data:remote.data};fs.writeFileSync(file,JSON.stringify(metadata))}
        catch(e){if(!metadata)throw Error('한글 챔피언 목록을 불러오지 못했습니다. 인터넷 연결을 확인해주세요.')}
      }
      return json(res,200,Object.values(metadata.data).map(c=>({id:Number(c.key),name:c.name})).sort((a,b)=>a.name.localeCompare(b.name,'ko')));
    }catch(e){return json(res,503,{error:e.message})}
  }
  if (u.pathname === '/api/champion-icon') {
    const id=Number(u.searchParams.get('id'));
    try { if (!id) throw new Error('no id'); const img=await ddragonAsset('icon',id); res.writeHead(200,{'Content-Type':img.type,'Cache-Control':'public, max-age=604800'}); return res.end(img.body); }
    catch(e) { try { const img=await lcuRequest(`/lol-game-data/assets/v1/champion-icons/${id}.png`,true); res.writeHead(200,{'Content-Type':img.type}); return res.end(img.body); } catch(_) { res.writeHead(302,{Location:'/placeholder.svg'}); return res.end(); } }
  }
  if (u.pathname === '/api/champion-splash') {
    const id=Number(u.searchParams.get('id')), skinId=Number(u.searchParams.get('skin')||0);
    try { if (!id) throw new Error('no id'); const img=await ddragonAsset('splash',id,skinId); res.writeHead(200,{'Content-Type':img.type,'Cache-Control':'public, max-age=604800'}); return res.end(img.body); }
    catch(e) { try { const img=await lcuRequest(`/lol-game-data/assets/v1/champion-splashes/${id}/${id}000.jpg`,true); res.writeHead(200,{'Content-Type':img.type}); return res.end(img.body); } catch(_) { res.writeHead(302,{Location:'/draft-empty.svg'}); return res.end(); } }
  }
  if (u.pathname === '/api/champion-portrait') {
    const id=Number(u.searchParams.get('id'));
    try { const img=await ddragonAsset('portrait',id); res.writeHead(200,{'Content-Type':img.type,'Cache-Control':'public, max-age=604800'}); return res.end(img.body); }
    catch(e) { res.writeHead(302,{Location:`/api/champion-icon?id=${id}`}); return res.end(); }
  }
  if (u.pathname === '/api/item-icon') {
    const id=Number(u.searchParams.get('id'));
    try { const img=await ddragonAsset('item',id); res.writeHead(200,{'Content-Type':img.type,'Cache-Control':'public, max-age=604800'}); return res.end(img.body); }
    catch(e) { res.writeHead(302,{Location:'/placeholder.svg'}); return res.end(); }
  }
  if (u.pathname === '/api/item-prices') {
    try { await initDataDragon(); return json(res,200,Object.fromEntries(itemPriceMap)); }
    catch(e) { return json(res,200,{}); }
  }
  if (u.pathname === '/api/spell-icon' || u.pathname === '/api/rune-icon') {
    const type=u.pathname.includes('spell')?'spell':'rune',key=u.searchParams.get(type==='spell'?'key':'id');
    try { const img=await ddragonHudAsset(type,key); res.writeHead(200,{'Content-Type':img.type,'Cache-Control':'public, max-age=604800'}); return res.end(img.body); }
    catch(e) { res.writeHead(302,{Location:'/placeholder.svg'}); return res.end(); }
  }
  let file = u.pathname === '/' ? '/control.html' : u.pathname;
  file = path.normalize(file).replace(/^(\.\.[/\\])+/, '');
  const full = path.join(PUBLIC,file);
  if (!full.startsWith(PUBLIC) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200,{'Content-Type':types[path.extname(full)]||'application/octet-stream','Cache-Control':'no-store'}); fs.createReadStream(full).pipe(res);
});
server.listen(PORT,process.env.HUD_HOST||'127.0.0.1',()=>console.log(`LOL Broadcast HUD: http://127.0.0.1:${PORT}`));
setInterval(()=>{if(!state.webDraft?.enabled)return;const before=JSON.stringify(state.draft);webDraft.tick();if(before!==JSON.stringify(state.draft)){save();broadcast()}},250);
startGoldOcr();
initDataDragon().then(async()=>{console.log(`Data Dragon ${ddragonVersion}: ${championMap.size} champions cached`);const ready=await warmBaseSplashes();console.log(`Base splash cache ready: ${ready}/${championMap.size}`)}).catch(e=>console.log(`Data Dragon waiting: ${e.message}`));
setInterval(syncLeague,500);
