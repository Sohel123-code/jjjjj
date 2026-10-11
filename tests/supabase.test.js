import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
let db;
const manager='11111111-1111-4111-8111-111111111111', student='22222222-2222-4222-8222-222222222222', other='33333333-3333-4333-8333-333333333333';
const boundary={type:'radius',centre:{latitude:17.73,longitude:83.3},radiusM:500};
let zone, post, group;
async function as(uid,action,payload={}) {
 await db.query("select set_config('test.uid',$1,false)",[uid]);
 await db.exec('set role authenticated');
 try { return (await db.query('select public.polygon_api($1,$2::jsonb) as result',[action,JSON.stringify(payload)])).rows[0].result; }
 finally { await db.exec('reset role'); }
}
const fix=()=>({latitude:17.73,longitude:83.3,accuracy:5,timestamp:Date.now()});
before(async()=>{
 db=new PGlite();
 await db.exec(`
 create role anon; create role authenticated; create schema auth; create schema storage;
 create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
 create function auth.jwt() returns jsonb language sql as $$ select '{"is_anonymous":false,"app_metadata":{"provider":"google"}}'::jsonb $$;
 grant usage on schema auth,storage to authenticated,anon;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
 alter table storage.objects enable row level security;
 grant select,insert,update,delete on storage.objects to authenticated,anon;
 `);
 for(const file of ['202610100001_polygon.sql','202610110001_nearby_chat_and_profile.sql','202610110002_fenced_nearby.sql']) await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
});
after(async()=>{await db?.close();});
test('registration is atomic, token persists and aliases are unique',async()=>{
 zone=await as(manager,'registerZone',{name:'Test campus',type:'College',boundary});
 const snapshot=await as(manager,'snapshot',{zoneId:zone.zoneId,management:true});
 assert.equal(snapshot.inviteToken,zone.token);
 assert.equal((await as(manager,'snapshot',{zoneId:zone.zoneId,management:true})).inviteToken,zone.token);
 await as(student,'joinZone',{token:zone.token});
 await as(other,'joinZone',{token:zone.token});
 const management=await as(manager,'snapshot',{zoneId:zone.zoneId,management:true});
 assert.equal(new Set(management.members.map(x=>x.alias.toLowerCase())).size,3);
 await assert.rejects(as(student,'snapshot',{zoneId:zone.zoneId}),/approval/);
 for(const m of management.members.filter(x=>x.role==='member')) await as(manager,'manageUser',{zoneId:zone.zoneId,target:m.publicId,status:'active'});
 await assert.rejects(as(student,'snapshot',{zoneId:zone.zoneId}),/live location/);
 await as(student,'verifyLocation',{zoneId:zone.zoneId,fix:fix()});
 await as(other,'verifyLocation',{zoneId:zone.zoneId,fix:fix()});
 const studentData=await as(student,'snapshot',{zoneId:zone.zoneId});
 assert.equal(studentData.inviteToken,undefined); assert.equal(studentData.reports,undefined);
 await assert.rejects(as(student,'snapshot',{zoneId:zone.zoneId,management:true}),/management/);
 await assert.rejects(as(student,'rotateToken',{zoneId:zone.zoneId}),/management/);
});
test('only the author or that zone manager can delete; comments cascade',async()=>{
 post=await as(student,'createPost',{zoneId:zone.zoneId,title:'Found bag',text:'At the library',category:'found',hours:24,authorId:'forged',official:true});
 const comment=await as(other,'comment',{zoneId:zone.zoneId,parentId:post.id,text:'Thanks for sharing'});
 const snapshot=await as(student,'snapshot',{zoneId:zone.zoneId});
 const p=snapshot.posts.find(p=>p.id===post.id);
 assert.equal(p.authorId,snapshot.me.publicId); assert.equal(p.official,false);
 await assert.rejects(as(other,'deleteContent',{zoneId:zone.zoneId,target:post.id}),/own content/);
 await assert.rejects(as(other,'resolveItem',{zoneId:zone.zoneId,target:post.id}),/author/);
 await as(student,'resolveItem',{zoneId:zone.zoneId,target:post.id});
 await as(other,'deleteContent',{zoneId:zone.zoneId,target:comment.id});
 assert.equal((await as(student,'snapshot',{zoneId:zone.zoneId})).comments.length,0);
 await as(other,'comment',{zoneId:zone.zoneId,parentId:post.id,text:'Another reply'});
 await as(student,'deleteContent',{zoneId:zone.zoneId,target:post.id});
 const deleted=await as(other,'snapshot',{zoneId:zone.zoneId});
 assert.equal(deleted.posts.length,0); assert.equal(deleted.comments.length,0);
 await assert.rejects(as(other,'comment',{zoneId:zone.zoneId,parentId:post.id,text:'Late reply'}),/no longer/);
});
test('reports identify the author, go only to zone management, and keep evidence',async()=>{
 post=await as(student,'createPost',{zoneId:zone.zoneId,title:'Review me',text:'A reportable post',category:'post'});
 const before=await as(student,'snapshot',{zoneId:zone.zoneId});
 await as(other,'report',{zoneId:zone.zoneId,target:post.id,targetType:'post',reason:'scam'});
 let review=await as(manager,'snapshot',{zoneId:zone.zoneId,management:true});
 assert.equal(review.reports[0].authorId,before.me.publicId);
 assert.equal(review.reports[0].reporterUid,other);
 assert.equal(review.reports[0].evidence.text,'A reportable post');
 const second=await as(other,'registerZone',{name:'Different campus',type:'College',boundary});
 await assert.rejects(as(other,'removeContent',{zoneId:second.zoneId,target:post.id}),/unavailable/);
 await as(manager,'removeContent',{zoneId:zone.zoneId,target:post.id});
 await as(manager,'resolveReport',{zoneId:zone.zoneId,target:review.reports[0].id});
 review=await as(manager,'snapshot',{zoneId:zone.zoneId,management:true});
 assert.equal(review.reports[0].status,'resolved'); assert.ok(review.reports[0].evidence);
});
test('group membership gates messages and private photos; deleted images lose access',async()=>{
 group=await as(student,'createGroup',{zoneId:zone.zoneId,domain:'study',topic:'DSA',title:'Study circle',text:'Discuss graphs'});
 await assert.rejects(as(other,'message',{zoneId:zone.zoneId,groupId:group.id,text:'Sneak in'}),/Join/);
 await assert.rejects(as(other,'snapshot',{zoneId:zone.zoneId,groupId:group.id}),/no longer/);
 const reservation=await as(student,'prepareImage',{zoneId:zone.zoneId,contentAction:'message',groupId:group.id,mime:'image/jpeg'});
 await db.query("select set_config('test.uid',$1,false)",[other]); await db.exec('set role authenticated');
 await assert.rejects(db.query("insert into storage.objects(bucket_id,name,metadata) values('polygon-media',$1,'{}')",[reservation.path]),/row-level security/);
 await db.exec('reset role'); await db.query("select set_config('test.uid',$1,false)",[student]); await db.exec('set role authenticated');
 await db.query("insert into storage.objects(bucket_id,name,metadata) values('polygon-media',$1,$2::jsonb)",[reservation.path,JSON.stringify({size:1234,mimetype:'image/jpeg'})]);
 await db.exec('reset role');
 const message=await as(student,'message',{zoneId:zone.zoneId,groupId:group.id,text:'',imagePath:reservation.path});
 async function canRead(uid){
   await db.query("select set_config('test.uid',$1,false)",[uid]); await db.exec('set role authenticated');
   try{return (await db.query("select * from storage.objects where name=$1",[reservation.path])).rows.length;}
   finally{await db.exec('reset role');}
 }
 assert.equal(await canRead(student),1); assert.equal(await canRead(other),0); assert.equal(await canRead(manager),1);
 await as(other,'joinGroup',{zoneId:zone.zoneId,groupId:group.id});
 await as(other,'joinGroup',{zoneId:zone.zoneId,groupId:group.id});
 const joined=await as(other,'snapshot',{zoneId:zone.zoneId,groupId:group.id});
 assert.equal(joined.groups.find(g=>g.id===group.id).memberCount,2);
 assert.equal(joined.messages[0].imagePath,reservation.path); assert.equal(await canRead(other),1);
 await as(student,'deleteContent',{zoneId:zone.zoneId,target:message.id});
 assert.equal(await canRead(other),0); assert.equal(await canRead(student),0); assert.equal(await canRead(manager),1);
 await as(student,'deleteContent',{zoneId:zone.zoneId,target:group.id});
 await assert.rejects(as(other,'message',{zoneId:zone.zoneId,groupId:group.id,text:'Gone'}),/Join/);
});
test('database uniqueness, direct table denial, fresh fixes and rate limits',async()=>{
 await as(student,'profile',{zoneId:zone.zoneId,alias:'UniqueStudent',avatar:'🐯'});
 await assert.rejects(as(other,'profile',{zoneId:zone.zoneId,alias:'uniquestudent',avatar:'🐼'}),/already taken/);
 await db.exec('set role authenticated');
 await assert.rejects(db.query('select invite_token from polygon_private.zones'),/permission denied/);
 await assert.rejects(db.query("update polygon_private.members set role='admin'"),/permission denied/);
 await db.exec('reset role');
 const stale=await as(student,'verifyLocation',{zoneId:zone.zoneId,fix:{...fix(),timestamp:Date.now()-90000}});
 assert.notEqual(stale.state,'inside');
 await assert.rejects(as(student,'snapshot',{zoneId:zone.zoneId}),/live location/);
 const outside=await as(student,'verifyLocation',{zoneId:zone.zoneId,fix:{...fix(),latitude:18}});
 assert.equal(outside.state,'outside');
 await as(student,'verifyLocation',{zoneId:zone.zoneId,fix:fix()});
 await as(student,'stopLocation',{zoneId:zone.zoneId});
 await assert.rejects(as(student,'snapshot',{zoneId:zone.zoneId}),/live location/);
 await as(student,'verifyLocation',{zoneId:zone.zoneId,fix:fix()});
 for(let i=0;i<3;i++)await as(student,'createPost',{zoneId:zone.zoneId,title:'Test',text:'Rate limited content'});
 await assert.rejects(as(student,'createPost',{zoneId:zone.zoneId,title:'Test',text:'Excess'}),/Too many/);
 await assert.rejects(as(student,'notAnAction',{zoneId:zone.zoneId}),/Unknown/);
 await db.exec('set role anon');
 await assert.rejects(db.query("select public.polygon_api('bootstrap','{}')"),/permission denied/);
 await db.exec('reset role');
});
test('polygon boundaries, official events, domains and token rotation',async()=>{
 const polygon={type:'polygon',centre:boundary.centre,vertices:[[83.295,17.725],[83.305,17.725],[83.305,17.735],[83.295,17.735],[83.295,17.725]]};
 const polygonZone=await as(manager,'registerZone',{name:'Polygon campus',type:'College',boundary:polygon});
 assert.equal((await as(manager,'verifyLocation',{zoneId:polygonZone.zoneId,fix:fix()})).state,'inside');
 await assert.rejects(as(other,'registerZone',{name:'Crossed campus',type:'College',boundary:{...polygon,vertices:[[83.29,17.72],[83.31,17.74],[83.31,17.72],[83.29,17.74],[83.29,17.72]]}}),/cross/);
 const event=await as(manager,'createPost',{zoneId:zone.zoneId,title:'Campus event',text:'Meet us there',category:'event',startsAt:Date.now()+3600000,hours:24});
 await assert.rejects(as(other,'createPost',{zoneId:zone.zoneId,title:'Fake event',text:'Fake official',category:'announcement'}),/management/);
 const question=await as(other,'createPost',{zoneId:zone.zoneId,title:'What time?',text:'Is there a schedule?',category:'question',eventId:event.id});
 assert.ok(question.id);
 await as(manager,'addDomain',{zoneId:zone.zoneId,name:'Creative',topics:'Music, Art'});
 const domains=(await as(manager,'snapshot',{zoneId:zone.zoneId,management:true})).zone.domains;
 await as(manager,'removeDomain',{zoneId:zone.zoneId,target:domains.at(-1).id});
 const rotated=await as(manager,'rotateToken',{zoneId:zone.zoneId});
 assert.notEqual(rotated.token,zone.token);
 assert.equal((await as(manager,'snapshot',{zoneId:zone.zoneId,management:true})).inviteToken,rotated.token);
 await assert.rejects(as(other,'joinZone',{token:zone.token}),/invalid/);
 await as(other,'joinZone',{token:rotated.token});
 await as(manager,'removeContent',{zoneId:zone.zoneId,target:event.id});
 assert.equal((await as(other,'snapshot',{zoneId:zone.zoneId})).posts.some(p=>p.id===question.id),false);
 const short=await as(manager,'createPost',{zoneId:zone.zoneId,title:'One minute',text:'Expires soon',hours:1/60});
 const shortPost=(await as(manager,'snapshot',{zoneId:zone.zoneId})).posts.find(p=>p.id===short.id);
 assert.equal(shortPost.expiresAt-shortPost.createdAt,60000);
 await db.query('update polygon_private.content set expires_at=0 where id=$1',[short.id]);
 assert.equal((await as(other,'snapshot',{zoneId:zone.zoneId})).posts.some(p=>p.id===short.id),false);
});
test('legacy data imports without changing IDs or the original invite token',async()=>{
 const legacyZone='44444444-4444-4444-8444-444444444444',legacyPost='55555555-5555-4555-8555-555555555555',legacyReport='66666666-6666-4666-8666-666666666666';
 await db.exec(`
 create table public.zones(id uuid,name text,type text,boundary jsonb,owner_uid uuid,token_hash text,domains jsonb);
 create table public.members(zone_id uuid,user_id uuid,public_id text,alias text,avatar text,role text,status text);
 create table public.content(id uuid,zone_id uuid,kind text,author_id text,title text,text text,status text,created_at bigint,expires_at bigint,image_url text);
 create table public.reports(id uuid,zone_id uuid,reporter_uid uuid,target_id text,target_type text,author_id text,reason text,status text,created_at bigint);
 grant all on public.zones,public.members,public.content,public.reports to authenticated;
 `);
 await db.query("insert into public.zones values($1,'Legacy college','College',$2,$3,encode(sha256(convert_to('ORIGINAL-PRIVATE-TOKEN','UTF8')),'hex'),'[]')",[legacyZone,JSON.stringify(boundary),manager]);
 await db.query("insert into public.members values($1,$2,'legacy-manager','LegacyManager','🦊','admin','active'),($1,$3,'legacy-student','LegacyStudent','🐼','member','active')",[legacyZone,manager,student]);
 await db.query("insert into public.content values($1,$2,'post','legacy-student','Old post','Keep this','active',$3,$4,'https://example.supabase.co/storage/v1/object/public/post-images/photo.jpg')",[legacyPost,legacyZone,Date.now(),Date.now()+3600000]);
 await db.query("insert into public.reports values($1,$2,$3,$4,'post','legacy-manager','scam','open',$5)",[legacyReport,legacyZone,manager,legacyPost,Date.now()]);
 await db.exec("insert into storage.buckets values('post-images','post-images',true,null,null)");
 await db.exec(await readFile(new URL('../supabase/legacy-import.sql',import.meta.url),'utf8'));
 let snapshot=await as(manager,'snapshot',{zoneId:legacyZone,management:true});
 assert.equal(snapshot.posts[0].id,legacyPost); assert.equal(snapshot.posts[0].imagePath,'photo.jpg');
 assert.equal(snapshot.reports[0].authorId,'legacy-student');assert.equal(snapshot.inviteToken,null);
 await assert.rejects(as(manager,'restoreToken',{zoneId:legacyZone,token:'INCORRECT'}),/original token/);
 await as(manager,'restoreToken',{zoneId:legacyZone,token:'ORIGINAL-PRIVATE-TOKEN'});
 snapshot=await as(manager,'snapshot',{zoneId:legacyZone,management:true});
 assert.equal(snapshot.inviteToken,'ORIGINAL-PRIVATE-TOKEN');
 assert.equal((await db.query("select public from storage.buckets where id='post-images'")).rows[0].public,false);
 await db.exec('set role authenticated');
 await assert.rejects(db.query('select * from public.content'),/permission denied/);
 await db.exec('reset role');
});

async function nearby(uid,action,payload={}) {
 await db.query("select set_config('test.uid',$1,false)",[uid]); await db.exec('set role authenticated');
 try{return (await db.query('select public.polygon_nearby($1,$2::jsonb) as r',[action,JSON.stringify({zoneId:zone.zoneId,...payload})])).rows[0].r;}finally{await db.exec('reset role');}
}
test('Nearby enforces consent, participant-only DMs, profiles and LAN grants',async()=>{
 await db.exec('delete from polygon_private.rates');
 for(const uid of [manager,student,other])await as(uid,'verifyLocation',{zoneId:zone.zoneId,fix:fix()});
 await nearby(student,'presence',{fix:fix(),share:false});
 await nearby(other,'presence',{fix:fix(),share:true});
 let snap=await nearby(student,'snapshot');
 const studentId=(await as(student,'snapshot',{zoneId:zone.zoneId})).me.publicId;
 const otherId=(await as(other,'snapshot',{zoneId:zone.zoneId})).me.publicId;
 assert.equal(snap.people.find(p=>p.id===studentId).latitude,null);
 assert.equal(snap.people.find(p=>p.id===otherId).latitude,17.73);
 const profile=(await as(student,'snapshot',{zoneId:zone.zoneId})).me;
 await as(student,'profile',{zoneId:zone.zoneId,alias:profile.alias,avatar:profile.avatar,gender:'Female',profession:'Student',shareProfile:false});
 assert.equal((await nearby(other,'snapshot')).people.find(p=>p.id===studentId).gender,'');
 await as(student,'profile',{zoneId:zone.zoneId,alias:profile.alias,avatar:profile.avatar,gender:'Female',profession:'Student',shareProfile:true});
 assert.equal((await nearby(other,'snapshot')).people.find(p=>p.id===studentId).profession,'Student');
 const msg=await nearby(student,'send',{peerId:otherId,text:'Private conversation',clientId:crypto.randomUUID()});
 assert.equal((await nearby(other,'snapshot',{peerId:studentId})).messages[0].text,'Private conversation');
 assert.equal((await nearby(manager,'snapshot')).messages.length,0);
 assert.equal((await nearby(other,'snapshot')).messages.length,0);
 await assert.rejects(nearby(other,'delete',{peerId:studentId,target:msg.id}),/own messages/);
 await nearby(other,'report',{peerId:studentId,target:msg.id,reason:'scam'});
 const reports=(await as(manager,'snapshot',{zoneId:zone.zoneId,management:true})).reports;
 assert.equal(reports.find(r=>r.targetId===msg.id).authorId,studentId);
 const network=await nearby(manager,'networkCreate',{name:'Library LAN'});
 await assert.rejects(nearby(student,'snapshot',{networkId:network.id}),/Reconnect/);
 await assert.rejects(nearby(student,'networkAttest',{networkId:network.id,secret:'wrong'}),/verification failed/);
 await nearby(student,'networkAttest',{networkId:network.id,secret:network.secret});
 const clientId=crypto.randomUUID();
 const sent=await nearby(student,'send',{networkId:network.id,text:'Library hello',clientId});
 assert.equal((await nearby(student,'send',{networkId:network.id,text:'Library hello',clientId})).id,sent.id);
 assert.equal((await nearby(student,'snapshot',{networkId:network.id})).messages.length,1);
 assert.equal((await nearby(other,'snapshot')).messages.length,0);
 await as(student,'stopLocation',{zoneId:zone.zoneId});
 assert.equal((await nearby(other,'snapshot')).people.some(p=>p.id===studentId),false);
 await assert.rejects(nearby(student,'snapshot'),/fresh location/);
 await as(manager,'stopLocation',{zoneId:zone.zoneId});
 await assert.rejects(nearby(manager,'snapshot'),/fresh location/);
 await as(manager,'removeContent',{zoneId:zone.zoneId,target:msg.id});
 const foreign=(await db.query('select id from polygon_private.zones z where not exists (select 1 from polygon_private.members m where m.zone_id=z.id and m.user_id=$1) limit 1',[student])).rows[0].id;
 assert.ok(foreign);
 await assert.rejects(nearby(student,'snapshot',{zoneId:foreign}),/approved/);
 await nearby(other,'presence',{fix:{...fix(),latitude:18},share:true});
 await assert.rejects(nearby(other,'send',{text:'Outside',clientId:crypto.randomUUID()}),/fresh location/);
 await db.exec('set role authenticated');
 await assert.rejects(db.query('select public.nearby_chat_history()'),/permission denied/);
 await assert.rejects(db.query('select * from polygon_private.live_people'),/permission denied/);
 await db.exec('reset role');
});
