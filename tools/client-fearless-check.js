const assert=require('assert/strict'),engine=require('./client-fearless');
const s={},first=[1,2,3,4,5,6,7,8,9,10],second=[11,12,13,14,15,16,17,18,19,20];
assert.equal(engine.capture(s,[1,2,3]),false);assert.equal(engine.capture(s,[1,1,3,4,5,6,7,8,9,10]),false);
assert.equal(engine.capture(s,first),true);assert.equal(s.clientFearless.games.length,0);assert.equal(engine.capture(s,first),false);
assert.equal(engine.nextDraft(s),true);assert.deepEqual(s.clientFearless.games[0].picks,first);assert.equal(engine.nextDraft(s),false);
const restored=JSON.parse(JSON.stringify(s));assert.equal(engine.capture(restored,second),true);assert.equal(engine.nextDraft(restored),true);assert.deepEqual(restored.clientFearless.games.map(g=>g.game),[1,2]);
engine.reset(restored);assert.equal(restored.clientFearless.games.length,0);assert.equal(restored.clientFearless.pending,null);
console.log('PASS client fearless records complete games once, persists and resets');
