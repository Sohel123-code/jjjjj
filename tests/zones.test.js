import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBoundary, checkLocation, canRead, visible, contactInfo, safeMatches, expiry } from '../functions/core.js';
const now=Date.now(),circle={type:'radius',centre:{latitude:17.73,longitude:83.3},radiusM:500};
const fix=(extra={})=>({...circle.centre,accuracy:5,timestamp:now,...extra});
test('server radius keeps uncertainty, stale and outside readings locked',()=>{
 assert.equal(checkLocation(fix(),circle,now),'inside');
 assert.equal(checkLocation(fix({accuracy:200}),circle,now),'inaccurate');
 assert.equal(checkLocation(fix({latitude:18}),circle,now),'outside');
 assert.equal(checkLocation(fix({timestamp:now-31000}),circle,now),'unavailable');
 assert.equal(checkLocation(fix({timestamp:now+6000}),circle,now),'unavailable');
 assert.equal(checkLocation(fix({latitude:NaN}),circle,now),'unavailable');
});
test('server polygon rejects crossing, open, degenerate and excessive boundaries',()=>{
 const b={type:'polygon',centre:{latitude:0,longitude:0},vertices:[[-.01,-.01],[.01,-.01],[.01,.01],[-.01,.01],[-.01,-.01]]};
 assert.equal(validateBoundary(b).type,'polygon');assert.equal(checkLocation({latitude:0,longitude:0,accuracy:3,timestamp:now},b,now),'inside');
 assert.equal(checkLocation({latitude:.01,longitude:0,accuracy:3,timestamp:now},b,now),'inaccurate');
 for(const vertices of [[[-.01,-.01],[.01,.01],[.01,-.01],[-.01,.01],[-.01,-.01]],[[0,0],[1,1],[0,1],[0,0]],[[0,0],[.01,.01],[.02,.02],[0,0]],b.vertices.slice(0,-1)])assert.throws(()=>validateBoundary({...b,vertices}));
 assert.throws(()=>validateBoundary({...circle,radiusM:49}));
});
test('membership approval alone never grants the feed; admin review is scoped',()=>{
 const m={status:'active',role:'member'},s={expiresAt:now+1000};
 assert.equal(canRead(m,s,now),true);assert.equal(canRead(m,null,now),false);
 assert.equal(canRead({...m,status:'pending'},s,now),false);assert.equal(canRead({...m,status:'blocked'},s,now),false);
 assert.equal(canRead(m,{expiresAt:now},now),false);assert.equal(canRead(m,s,now,true),false);
 assert.equal(canRead({...m,role:'admin'},null,now,true),true);
});
test('expiry and blocks are read boundaries, independent of eventual deletion',()=>{
 const p={status:'active',expiresAt:now+1,authorId:'user'};
 assert.equal(visible(p,new Set(),now),true);assert.equal(visible(p,new Set(['user']),now),false);
 assert.equal(visible(p,new Set(),now+1),false);assert.equal(visible({...p,status:'removed'},new Set(),now),false);
 assert.throws(()=>expiry(0));assert.throws(()=>expiry(169));assert.equal(expiry(1/60,now),now+60000);
});
test('contact protection catches email, separated phones, zero-width and Indian numerals',()=>{
 for(const text of ['9876543210','+91 98765 43210','example@gmail.com','example [at] gmail [dot] com','९८७६५४३२१०','98765\u200b43210'])assert.equal(contactInfo(text),true,text);
 assert.equal(contactInfo('BFS at Block B, 5 PM. Bring 2 laptops.'),false);
});
test('AI matches must reference existing candidates with valid confidence',()=>{
 const c=[{id:'existing'}],result=safeMatches({matches:[{id:'invented',confidence:.99,reason:'Looks similar'},{id:'existing',confidence:9,reason:'Invalid'},{id:'existing',confidence:.8,reason:'Same item and landmark'}]},c);
 assert.deepEqual(result,[{id:'existing',confidence:.8,reason:'Same item and landmark'}]);assert.deepEqual(safeMatches({matches:[]},c),[]);
});
