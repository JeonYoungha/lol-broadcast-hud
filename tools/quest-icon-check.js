const assert=require('assert/strict'),{createTracker}=require('./quest-icon-tracker');
const frame=n=>Buffer.alloc(192,n).toString('base64'),tracker=createTracker();
const sample=n=>({blue:[frame(n)],red:[]});
assert.deepEqual(tracker.read(sample(30)),[]);assert.deepEqual(tracker.read(sample(31)),[]);assert.deepEqual(tracker.read(sample(30)),[]);assert.equal(tracker.status().baselines,1);assert.deepEqual(tracker.read(sample(100)),[]);assert.deepEqual(tracker.read(sample(30)),[]);
tracker.read(sample(100));tracker.read(sample(101));assert.deepEqual(tracker.read(sample(100)),[{side:'blue',role:'top'}]);assert.deepEqual(tracker.read(sample(200)),[]);
tracker.reset();tracker.read(sample(30));tracker.read(sample(30));tracker.read(sample(30));tracker.read(sample(100),{blue:[true]});tracker.read(sample(100));tracker.read(sample(100));assert.deepEqual(tracker.read(sample(100)),[{side:'blue',role:'top'}]);
tracker.reset();tracker.read(sample(30),{},{blue:{top:true}});tracker.read(sample(100));tracker.read(sample(100));assert.deepEqual(tracker.read(sample(100)),[]);
console.log('PASS quest icon baseline, stable change, death gating and once-only');
