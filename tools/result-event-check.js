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
console.log('PASS result displays live event settings while preserving saved game stats');
