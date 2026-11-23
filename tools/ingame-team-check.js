const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const page=fs.readFileSync(path.join(__dirname,'../public/ingame.html'),'utf8');
const script=page.slice(page.indexOf('const logo='),page.indexOf('const metric='));
const ctx={HUD:{escape:value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;')}};vm.createContext(ctx);vm.runInContext(script+';this.teamIdentity=teamIdentity',ctx);
const t={logo:'/team.png',score:2,name:'IG',short:'OLD',tagline:'LPL #4'};
const blue=ctx.teamIdentity(t,'blue',5),red=ctx.teamIdentity(t,'red',5);
assert(ctx.teamIdentity({...t,name:'Team Alpha'},'blue',5).includes('<strong>Team Alpha</strong>'));assert(blue.includes('<strong>IG</strong>'));
assert(blue.indexOf('series-pips')<blue.indexOf('/team.png'));assert(blue.indexOf('/team.png')<blue.indexOf('score-team-copy'));
assert(red.indexOf('score-team-copy')<red.indexOf('/team.png'));assert(red.indexOf('/team.png')<red.indexOf('series-pips'));
assert.equal((blue.match(/class="won"/g)||[]).length,2);assert.equal((blue.match(/<i class=/g)||[]).length,3);assert(!blue.includes('LPL #4'));
assert(!ctx.teamIdentity({...t,tagline:''},'blue',5).includes('<small>'));
// Track replacement of the real main scoreboard during several stat updates.
function element() {
 const children=new Map();
 const result={textContent:'',firstElementChild:null,writes:0,
   classList:{toggle(){}},style:{values:{},setProperty(k,v){this.values[k]=v},removeProperty(k){delete this.values[k]}},
   querySelector(selector){if(!children.has(selector))children.set(selector,element());return children.get(selector)}};
 Object.defineProperty(result,'innerHTML',{set(){result.writes++;result.firstElementChild={}}});
 return result;
}
const app=element();
let render;
const isolated={app,fetch:()=>new Promise(()=>{}),HUD:{escape:String,init:fn=>{render=fn},icon:()=>'',item:()=>''}};
vm.createContext(isolated);
vm.runInContext(page.match(/<script>([\s\S]*?)<\/script>/)[1],isolated);
const sample={event:{bestOf:5},blue:{name:'A'},red:{name:'B'},game:{blueGold:'10.0K',redGold:'9.0K'},draft:{bluePicks:[],redPicks:[]}};
render(sample);
const header=app.querySelector('.match-hud'),main=header.querySelector('.match-main');
const metricGroup=header.querySelector('.score-numbers.blue');
sample.game.blueGold='12.0K';sample.game.blueTowers=2;sample.game.bottomScoreboard={x:-150,y:85};
render(sample);
assert.equal(main.writes,1);
assert.equal(metricGroup.querySelector('.gold-copy b').textContent,'12.0K');
assert.equal(metricGroup.querySelector('.gold-copy em').textContent,'+3.0K');
assert.equal(metricGroup.querySelector('.tower b').textContent,'2');
assert.deepEqual(app.querySelector('.bottom-hud').style.values,{'--bottom-x':'-150px','--bottom-y':'-85px'});
console.log('PASS in-game team layout, stable gold/tower icons, text updates and scoreboard positioning');
