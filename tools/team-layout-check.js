const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../public/draft-team.js'),'utf8'),context={};vm.createContext(context);vm.runInContext(source.slice(0,source.indexOf('window.DraftTeam=')),context);
for(const [width,height] of [[1920,1080],[2344,934],[2048,816],[1366,768],[1280,720],[685,696],[1024,576],[480,800]]){
 const layout=context.teamCanvasLayout(width,height);assert(layout.left>=0&&layout.top>=0);assert(layout.left+1920*layout.scale<=width+0.0001);assert(1080*layout.scale<=height+0.0001);
 // Pick five ends at y=988; bans end at y=1080. Both must fit the real viewport.
 assert(988*layout.scale<=height+0.0001);assert(1080*layout.scale<=height+0.0001);
}
for(const removed of ['teamSwap','swapTools','swapFrom','swapTo','teamSkip'])assert(!source.includes(removed));
assert(source.includes("send('swap'"));console.log('PASS team layout: eight viewport sizes, pick five and bans fit, drag-only swaps, no skip button');
