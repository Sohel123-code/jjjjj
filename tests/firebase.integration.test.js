import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const enabled=!!process.env.FIRESTORE_EMULATOR_HOST;
test('Firebase callable workflow and security rules', {skip:!enabled,timeout:120000}, async t=>{
 process.env.GCLOUD_PROJECT='demo-polygon-tests';process.env.FIREBASE_CONFIG=JSON.stringify({projectId:'demo-polygon-tests',storageBucket:'demo-polygon-tests.appspot.com'});process.env.GROQ_API_KEY='local-test-placeholder';
 const {zoneApi}=await import('../functions/index.js');
 const {getFirestore,Timestamp}=await import('../functions/node_modules/firebase-admin/lib/firestore/index.js');
 const db=getFirestore();
 const {initializeTestEnvironment,assertFails,assertSucceeds}=await import('@firebase/rules-unit-testing');
 const {doc,getDoc,setDoc}=await import('firebase/firestore');
 const env=await initializeTestEnvironment({projectId:'demo-polygon-tests',firestore:{host:'127.0.0.1',port:8080,rules:await readFile('firestore.rules','utf8')}});
 await env.clearFirestore();
 const originalFetch=globalThis.fetch;let verdict={safe:true,pii:false,reason:'safe'};
 globalThis.fetch=(url,options)=>String(url).startsWith('https://api.groq.com/')?Promise.resolve({ok:verdict!==null,json:async()=>({choices:[{message:{content:JSON.stringify(verdict)}}]})}):originalFetch(url,options);
 const call=(uid,action,data={})=>zoneApi.run({auth:uid?{uid,token:{}}:null,data:{action,...data}});
 const denied=async promise=>assert.rejects(promise,e=>['permission-denied','unauthenticated'].includes(e.code));
 let z,token,me,admin,post,group;
 try {
 await t.test('requires authentication and creates unique hashed private zone tokens',async()=>{
  await denied(call(null,'bootstrap'));
  const first=await call('owner','registerZone',{name:'Test Commons',type:'Tech park',boundary:{type:'radius',centre:{latitude:0,longitude:0},radiusM:500}});z=first.zoneId;token=first.token;
  const second=await call('other-owner','registerZone',{name:'Other zone',type:'Event venue',boundary:{type:'radius',centre:{latitude:0,longitude:0},radiusM:300}});
  assert.notEqual(first.token,second.token);assert.match(token,/^PZ-[A-F0-9]{32}$/);assert.equal((await db.doc('zones/'+z).get()).data().token,undefined);
  await denied(call('other-owner','snapshot',{zoneId:z,management:true}));
 });
 await t.test('token redemption is pending and cannot read or establish a location grant',async()=>{
  await call('member','joinZone',{token});await denied(call('member','snapshot',{zoneId:z}));await denied(call('member','verifyLocation',{zoneId:z,fix:{latitude:0,longitude:0,accuracy:5,timestamp:Date.now()}}));
  admin=await call('owner','snapshot',{zoneId:z,management:true});me=admin.members.find(m=>m.id==='member');await denied(call('member','manageUser',{zoneId:z,target:me.publicId,status:'active'}));
  await call('owner','manageUser',{zoneId:z,target:me.publicId,status:'active'});await denied(call('member','snapshot',{zoneId:z}));
 });
 await t.test('location checks lock on outside and inaccurate; persist eligibility only',async()=>{
  const verify=fix=>call('member','verifyLocation',{zoneId:z,fix:{accuracy:5,timestamp:Date.now(),...fix}});
  assert.equal((await verify({latitude:1,longitude:0})).state,'outside');await denied(call('member','snapshot',{zoneId:z}));
  assert.equal((await verify({latitude:0,longitude:0,accuracy:200})).state,'inaccurate');
  assert.equal((await verify({latitude:0,longitude:0})).state,'inside');
  const session=(await db.doc(`zones/${z}/sessions/member`).get()).data();assert.deepEqual(Object.keys(session).sort(),['checkedAt','expiresAt','state']);
  const snapshot=await call('member','snapshot',{zoneId:z});assert.equal(snapshot.members,undefined);assert.equal(snapshot.zone.boundary,undefined);assert.equal(snapshot.me.id,undefined);
 });
 await t.test('members cannot forge official announcements or events',async()=>{
  for(const category of ['event','announcement'])await denied(call('member','createPost',{zoneId:z,title:'Forged',text:'Pretend official',category,hours:24}));
  await call('owner','verifyLocation',{zoneId:z,fix:{latitude:0,longitude:0,accuracy:5,timestamp:Date.now()}});
  const event=await call('owner','createPost',{zoneId:z,title:'Community event',text:'Join us at the courtyard.',category:'event',place:'Courtyard',startsAt:Date.now()+3600000,hours:24});assert.ok(event.id);
 });
 await t.test('safe content appears only after moderation; API ignores forged author identity',async()=>{
  post=await call('member','createPost',{zoneId:z,title:'Lost wallet',text:'Black wallet near Block B.',category:'lost',itemCategory:'Accessories',place:'Block B',hours:24,authorId:'forged'});
  const stored=(await db.doc(`zones/${z}/content/${post.id}`).get()).data();assert.equal(stored.authorId,me.publicId);assert.equal(stored.status,'active');
  const comment=await call('owner','comment',{zoneId:z,parentId:post.id,text:'Please check the help desk.'});assert.ok(comment.id);
  await call('member','like',{zoneId:z,target:post.id});assert.equal((await db.doc(`zones/${z}/content/${post.id}`).get()).data().likes,1);
  await call('member','like',{zoneId:z,target:post.id});assert.equal((await db.doc(`zones/${z}/content/${post.id}`).get()).data().likes,0);
 });
 await t.test('PII, multilingual unsafe verdicts and outages fail closed without publishing',async()=>{
  const before=(await db.collection(`zones/${z}/content`).get()).size;
  assert.equal((await call('member','comment',{zoneId:z,parentId:post.id,text:'Call 9876543210'})).blocked,true);
  verdict={safe:false,pii:false,reason:'abuse'};assert.equal((await call('member','comment',{zoneId:z,parentId:post.id,text:'A Hindi abuse test fixture'})).blocked,true);
  verdict=null;const outage=await call('member','comment',{zoneId:z,parentId:post.id,text:'Hello from the courtyard'});assert.equal(outage.reason,'service_unavailable');
  verdict={safe:true,pii:false,reason:'safe'};assert.equal((await db.collection(`zones/${z}/content`).get()).size,before);
  const events=(await call('owner','snapshot',{zoneId:z,management:true})).moderation;assert.ok(events.some(e=>e.reason==='private_information'));assert.ok(events.every(e=>e.text===undefined));
 });
 await t.test('group messages require group membership and retain pseudonymous identity',async()=>{
  group=await call('member','createGroup',{zoneId:z,title:'DSA algorithms',text:'Let us study BFS.',domain:'study',topic:'DSA',hours:6});
  await denied(call('owner','message',{zoneId:z,groupId:group.id,text:'Not joined'}));
  await call('owner','joinGroup',{zoneId:z,groupId:group.id});
  await call('owner','message',{zoneId:z,groupId:group.id,text:'Ready to work on graphs!'});
  const snapshot=await call('member','snapshot',{zoneId:z,groupId:group.id});assert.equal(snapshot.messages.length,1);assert.equal(snapshot.messages[0].uid,undefined);assert.equal(snapshot.messages[0].email,undefined);
 });
 await t.test('blocking hides both directions and denies new direct interactions',async()=>{
  const ownerId=(await db.doc(`zones/${z}/members/owner`).get()).data().publicId;
  await call('member','block',{zoneId:z,target:ownerId});
  const snapshot=await call('member','snapshot',{zoneId:z,groupId:group.id});assert.equal(snapshot.messages.length,0);assert.ok(snapshot.posts.every(p=>p.authorId!==ownerId));
  await denied(call('owner','comment',{zoneId:z,parentId:post.id,text:'Blocked interaction'}));
  await call('member','block',{zoneId:z,target:ownerId,unblock:true});
 });
 await t.test('reports are management-only and removal locks parent content and chat',async()=>{
  await call('member','report',{zoneId:z,target:post.id,targetType:'post',reason:'Spam'});
  assert.equal((await call('member','snapshot',{zoneId:z})).reports,undefined);
  const admin=await call('owner','snapshot',{zoneId:z,management:true});const report=admin.reports.find(r=>r.targetId===post.id);assert.ok(report);
  await call('owner','removeContent',{zoneId:z,target:group.id});await assert.rejects(call('member','snapshot',{zoneId:z,groupId:group.id}),e=>e.code==='not-found');
  await call('owner','removeContent',{zoneId:z,target:post.id});await assert.rejects(call('member','like',{zoneId:z,target:post.id}),e=>e.code==='not-found');
  await call('owner','resolveReport',{zoneId:z,target:report.id});assert.equal((await db.doc(`zones/${z}/reports/${report.id}`).get()).data().status,'resolved');
 });
 await t.test('expired records and grants are inaccessible before cleanup',async()=>{
  await db.doc(`zones/${z}/content/expired`).set({kind:'post',category:'post',status:'active',authorId:me.publicId,expiresAt:Date.now()-1,createdAt:Date.now(),text:'Old'});
  assert.ok(!(await call('member','snapshot',{zoneId:z})).posts.some(p=>p.id==='expired'));
  await db.doc(`zones/${z}/sessions/member`).update({expiresAt:Timestamp.fromMillis(Date.now()-1)});await denied(call('member','snapshot',{zoneId:z}));
 });
 await t.test('Firestore rules deny direct writes, content reads, reports and cross-zone signals',async()=>{
  const client=env.authenticatedContext('member').firestore();
  await assertFails(setDoc(doc(client,`zones/${z}/members/member`),{status:'active',role:'admin'}));
  await assertFails(getDoc(doc(client,`zones/${z}/content/${post.id}`)));await assertFails(getDoc(doc(client,`zones/${z}/signals/live`)));
  await db.doc(`zones/${z}/sessions/member`).update({expiresAt:Timestamp.fromMillis(Date.now()+45000)});
  await assertSucceeds(getDoc(doc(client,`zones/${z}/signals/live`)));
  const outsider=env.authenticatedContext('outsider').firestore();await assertFails(getDoc(doc(outsider,`zones/${z}/signals/live`)));
  await assertFails(setDoc(doc(client,'tokens/guessed'),{zoneId:z}));
 });
 await t.test('token rotation revokes old token and spam limits are atomic',async()=>{
  const rotated=await call('owner','rotateToken',{zoneId:z});assert.notEqual(rotated.token,token);await assert.rejects(call('new-member','joinZone',{token}),e=>e.code==='not-found');
  const requests=await Promise.allSettled(Array.from({length:9},()=>call('spammer','joinZone',{token:'invalid'})));
  assert.ok(requests.some(r=>r.status==='rejected'&&r.reason.code==='resource-exhausted'));
 });
 await t.test('leave revokes membership and all zone reads',async()=>{
  await call('member','leaveZone',{zoneId:z});await denied(call('member','snapshot',{zoneId:z}));assert.equal((await db.doc(`zones/${z}/members/member`).get()).data().status,'left');
 });
 } finally {globalThis.fetch=originalFetch;await env.cleanup();await db.terminate();}
});
