const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const page=fs.readFileSync(path.join(__dirname,'../public/ingame.html'),'utf8');
const blue={innerHTML:''},red={innerHTML:''},context={app:{querySelector:s=>s.includes('.blue')?blue:red},HUD:{escape:s=>String(s).replace(/</g,'&lt;')}};
vm.createContext(context);vm.runInContext(page.slice(page.indexOf("let mainSignature="),page.indexOf('HUD.init(')),context);
const state={blue:{players:['Alpha','','','','']},red:{players:['Beta','','','','']}};context.updatePlayerLabels(state);assert(blue.innerHTML.includes('Alpha'));assert(red.innerHTML.includes('Beta'));assert.equal((blue.innerHTML.match(/player-label-row/g)||[]).length,5);
[state.blue,state.red]=[state.red,state.blue];context.updatePlayerLabels(state);assert(blue.innerHTML.includes('Beta'));assert(red.innerHTML.includes('Alpha'));state.blue.players[0]='<tag>';context.updatePlayerLabels(state);assert(blue.innerHTML.includes('&lt;tag>'));
console.log('PASS spectator labels follow teams and escape names');
