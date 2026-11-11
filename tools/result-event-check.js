const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root={innerHTML:'',querySelector(){return null}};
const context={document:{getElementById:()=>root,body:{style:{}}},location:{search:''},URLSearchParams,console,
 fetch:()=>Promise.reject(new Error('offline')),HUD:{escape:x=>String(x??''),icon:id=>'/icon/'+id,init(fn){this.render=fn}},
 ResultCore:{kda:()=> '1/2/3',snapshot:s=>s.result.snapshot}};
vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/result.js'),'utf8'),context);
const state={event:{name:'SFL',round:'FINAL',game:2},blue:{},red:{},result:{snapshot:{event:{name:'OLD',round:'OLD ROUND',game:1},blue:{short:'BLUE'},red:{short:'RED'},game:{clock:'30:00'},draft:{bluePicks:[],redPicks:[],blueBans:[],redBans:[]}}}};
context.HUD.state=state;context.HUD.render(state);
assert(root.innerHTML.includes('SFL'));assert(root.innerHTML.includes('FINAL · GAME 2'));assert(!root.innerHTML.includes('OLD ROUND'));assert(root.innerHTML.includes('30:00'));
state.event={name:'NEW EVENT',round:'FINAL 2',game:3};context.HUD.render(state);
assert(root.innerHTML.includes('NEW EVENT'));assert(root.innerHTML.includes('FINAL 2 · GAME 3'));assert(root.innerHTML.includes('30:00'));
state.result.snapshot.blue={name:'Team A',short:'A',logo:'/old-a.png'};state.result.snapshot.red={name:'Team B',short:'B',logo:'/old-b.png'};
state.blue={name:'Team B',short:'B',logo:'/new-b.png'};state.red={name:'Team A',short:'A',logo:'/new-a.png'};state.event.logo='/event-logo.png';context.HUD.render(state);
assert(root.innerHTML.includes('/event-logo.png'));assert(root.innerHTML.indexOf('/new-a.png')<root.innerHTML.indexOf('/new-b.png'));assert(!root.innerHTML.includes('/old-a.png'));
state.red.logo='/updated-a.png';context.HUD.render(state);assert(root.innerHTML.includes('/updated-a.png'));
state.red.name='Renamed Team A';context.HUD.render(state);assert(root.innerHTML.includes('<strong>Renamed Team A</strong>'));assert(root.innerHTML.includes('<strong>Team B</strong>'));
state.red.logo='data:image/svg+xml;base64,PHN2Zy8+';state.event.logo='data:image/svg+xml;base64,PHN2ZyBldmVudD0iMSIvPg==';context.HUD.render(state);assert(root.innerHTML.includes(state.red.logo));assert(root.innerHTML.includes(state.event.logo));
state.blue={name:'TEAM_X',logo:'/team-x.png'};state.red={name:'TEAM_Y',logo:'/team-y.png'};context.HUD.render(state);assert(root.innerHTML.includes('<strong>TEAM_X</strong>'));assert(root.innerHTML.includes('<strong>TEAM_Y</strong>'));assert(root.innerHTML.includes('/team-x.png'));assert(root.innerHTML.includes('/team-y.png'));
state.result.snapshot.blue.score=0;state.result.snapshot.red.score=1;state.result.snapshot.seriesScorePending=true;state.result.winner='blue';context.HUD.render(state);assert(root.innerHTML.includes('<strong>TEAM_X</strong><b>1</b><em>WIN</em>'));assert(root.innerHTML.includes('<strong>TEAM_Y</strong><b>1</b><em>LOSS</em>'));
state.result.winner='red';context.HUD.render(state);assert(root.innerHTML.includes('<strong>TEAM_X</strong><b>0</b><em>LOSS</em>'));assert(root.innerHTML.includes('<strong>TEAM_Y</strong><b>2</b><em>WIN</em>'));state.result.snapshot.seriesScorePending=false;context.HUD.render(state);assert(root.innerHTML.includes('<strong>TEAM_Y</strong><b>1</b><em>WIN</em>'));
console.log('PASS result displays live event settings while preserving saved game stats');
