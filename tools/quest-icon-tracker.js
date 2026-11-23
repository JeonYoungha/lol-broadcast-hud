const ROLES=['top','jungle','mid','bot','support'];
function distance(a,b){if(!a||!b||a.length!==b.length||!a.length)return Infinity;let total=0;for(let i=0;i<a.length;i++)total+=Math.abs(a[i]-b[i]);return total/a.length}
function createTracker(){let cells={blue:new Map(),red:new Map()};
 function reset(){cells={blue:new Map(),red:new Map()}}
 function read(samples,dead={},completed={},roster=null){const changes=[];for(const side of ['blue','red'])for(let i=0;i<5;i++){
  const player=roster?.[side]?.[i];
  if(roster&&(!player?.id||!ROLES.includes(player.role)))continue;
  const key=player?.id??i,role=player?.role??ROLES[i];
  const encoded=samples?.[side]?.[i];if(typeof encoded!=='string'||dead?.[side]?.[i]){const c=cells[side].get(key);if(c)c.seen=0;continue}
  const image=Buffer.from(encoded,'base64');if(image.length!==192)continue;
  let c=cells[side].get(key);if(!c){cells[side].set(key,{baseline:null,candidate:image,seen:1,done:Boolean(completed?.[side]?.[role])});continue}if(completed?.[side]?.[role])c.done=true;if(c.done)continue;
  if(!c.baseline){if(c.candidate&&distance(c.candidate,image)<12)c.seen++;else {c.candidate=image;c.seen=1}if(c.seen>=3){c.baseline=image;c.candidate=null;c.seen=0}continue}
  if(distance(c.baseline,image)<24){c.candidate=null;c.seen=0;continue}
  if(c.candidate&&distance(c.candidate,image)<12)c.seen++;else {c.candidate=image;c.seen=1}
  if(c.seen>=3)changes.push({side,role,id:player?.id,cell:c})
 }if(changes.length>=4)return [];for(const item of changes)item.cell.done=true;return changes.map(({side,role,id})=>id?{side,role,id}:{side,role})}
 function status(){const values=[...cells.blue.values(),...cells.red.values()];return {baselines:values.filter(c=>c.baseline||c.done).length,completed:values.filter(c=>c.done).length}}
 return {read,reset,status};
}
module.exports={createTracker,distance};
