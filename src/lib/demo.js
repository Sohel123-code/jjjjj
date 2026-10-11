import { DEFAULT_DOMAINS, contactInfo, visible, expiry, validateBoundary } from '../../functions/core.js';
// Explicit, disposable demonstration. Never used as an authentication error fallback.
export function createDemo() {
 const now=Date.now(), hour=3600000;
 let admin=false,inside=true,zone={id:'demo',name:'The Commons',type:'Tech park',domains:structuredClone(DEFAULT_DOMAINS),boundary:{type:'radius',centre:{latitude:17.73,longitude:83.3},radiusM:500}};
 const members=[{id:'demo-user',publicId:'me',alias:'BlueFox',avatar:'🦊',role:'member',status:'active',createdAt:now}, {id:'manager',publicId:'manager',alias:'Zone Management',avatar:'✦',role:'admin',status:'active',createdAt:now},{id:'new-user',publicId:'new-user',alias:'PixelDev',avatar:'🐨',role:'member',status:'pending',createdAt:now},{id:'owl',publicId:'owl',alias:'NightOwl',avatar:'🦉',role:'member',status:'active',createdAt:now},{id:'panda',publicId:'panda',alias:'CodePanda',avatar:'🐼',role:'member',status:'active',createdAt:now}];
 const post=(id,category,authorId,title,text,extra={})=>({id,kind:'post',category,...members.find(m=>m.publicId===authorId),id,authorId,title,text,status:'active',createdAt:now-600000,expiresAt:now+6*hour,likes:0,...extra});
 let content=[
  post('welcome','announcement','manager','A little closer. A lot more connected.','Welcome to The Commons. A place to find what you lost, meet your next teammate, and make something happen — right here.',{official:true,likes:24,art:'welcome'}),
  post('wallet','lost','owl','A black wallet. A little help?','Lost my black wallet near Block B this afternoon. If you spot it, please leave a comment. I can confirm the details privately at the help desk.',{place:'Block B · courtyard',itemCategory:'Accessories',itemStatus:'lost',likes:8,art:'wallet',expiresAt:now+3*hour}),
  post('found-wallet','found','panda','Found a wallet by the courtyard','A black wallet was handed in at the Block B help desk. Please describe an identifying detail to the desk team.',{place:'Block B · help desk',itemCategory:'Accessories',itemStatus:'found',likes:6}),
  post('event','event','manager','Build something that matters.','An evening of ideas, tiny prototypes, and good company. Bring a laptop and a little curiosity.',{official:true,place:'The Workshop · Block A',startsAt:now+2*hour,registration:'Walk in at the welcome desk',likes:32,art:'event'}),
  post('offer','offer','panda','Your afternoon, freshly brewed.','20% off at the Courtyard Coffee stall during today’s community meetup. Show this post at the counter.',{sponsored:true,place:'Courtyard Coffee',likes:12,art:'coffee'}),
  {id:'graphs',kind:'group',domain:'study',topic:'DSA',title:'DSA — Graph Algorithms',text:'Graphs, BFS, DFS, shortest paths. Let’s work through a few problems together.',authorId:'owl',alias:'NightOwl',avatar:'🦉',memberCount:4,status:'active',createdAt:now,expiresAt:now+4*hour},
  {id:'builders',kind:'group',domain:'projects',topic:'Hackathons',title:'Weekend builders',text:'Finding a small team to turn a useful idea into a working prototype.',authorId:'panda',alias:'CodePanda',avatar:'🐼',memberCount:3,status:'active',createdAt:now,expiresAt:now+8*hour},
  {id:'walk',kind:'group',domain:'hangouts',topic:'Night walks',title:'One lap around The Commons?',text:'A relaxed walk after the workday. Meet at the main courtyard.',authorId:'owl',alias:'NightOwl',avatar:'🦉',memberCount:2,status:'active',createdAt:now,expiresAt:now+3*hour},
  {id:'chat1',kind:'message',groupId:'graphs',authorId:'owl',alias:'NightOwl',avatar:'🦉',text:'Anyone solving graphs today?',status:'active',createdAt:now-120000,expiresAt:now+4*hour},
  {id:'chat2',kind:'message',groupId:'graphs',authorId:'panda',alias:'CodePanda',avatar:'🐼',text:'Yes! Starting with BFS. Want to work through a problem together?',status:'active',createdAt:now-60000,expiresAt:now+4*hour}
 ];
 const joined=new Set(),likes=new Set(),blocks=new Set(),reports=[],moderation=[],audit=[],counts=new Map();
 let violations=0,cooldown=0,inviteToken='DEMO-ZONE-TOKEN';
 const me=()=>admin?members[1]:members[0];
 const find=id=>{const c=content.find(p=>p.id===id&&p.status==='active'&&p.expiresAt>Date.now());if(!c)throw Error('This content has expired or is unavailable.');return c;};
 const author=()=>({authorId:me().publicId,alias:me().alias,avatar:me().avatar,official:admin});
 const emit=()=>window.dispatchEvent(new Event('polygon-demo'));
 function safety(text){const pii=contactInfo(text),bad=/\b(scam|idiot|kill yourself|stupid|fraud|fuck)\b|चूतिया|मादरचोद|బూతు/i.test(text);moderation.unshift({id:crypto.randomUUID(),uid:me().id,verdict:pii||bad?'blocked':'allowed',reason:pii?'private_information':bad?'abuse':'safe',createdAt:Date.now()});if(pii||bad){violations++;if(violations>=3)cooldown=Date.now()+60000;emit();return {blocked:true,reason:pii?'private_information':'abuse',message:pii?'Private information hidden. Remove contact details before sending.':'Blocked by the demo safety filter. Reports in live mode go to zone management.'};}return null;}
 function throttle(action,max=5){const time=Date.now(),a=(counts.get(action)||[]).filter(t=>t>time-60000);if(a.length>=max)throw Error('Too many actions. Please try again later.');a.push(time);counts.set(action,a);}
 return {
  setRole(value){admin=value;emit();},setLocation(value){inside=value==='inside';emit();},
  async call(action,d={}){
   await new Promise(r=>setTimeout(r,180));
   if(action==='bootstrap')return {memberships:[{zoneId:zone.id,name:zone.name,role:me().role,status:me().status}]};
   if(action==='registerZone'){zone={id:'demo',name:d.name,type:d.type,domains:structuredClone(DEFAULT_DOMAINS),boundary:validateBoundary(d.boundary)};admin=true;return {zoneId:'demo',name:d.name,token:inviteToken};}
   if(action==='joinZone'){if(d.token!==inviteToken)throw Error('Use DEMO-ZONE-TOKEN in this demo.');return {zoneId:'demo',name:zone.name};}
   if(action==='verifyLocation')return {state:inside?'inside':'outside',expiresAt:Date.now()+45000};
   if(action==='stopLocation'){inside=false;return {ok:true};}
   if(action==='leaveZone'){inside=false;members[0].status='left';emit();return {ok:true};}
   const management=d.management||['manageUser','removeContent','resolveReport','rotateToken','addDomain','removeDomain'].includes(action);
   if(management&&!admin)throw Error('Only Zone Management can do this.');
   if(!inside&&!management&&!admin)throw Error('Verify your location to enter the zone.');
   if(action==='snapshot'){
    const active=content.filter(p=>visible(p,blocks));return {zone,me:me(),posts:active.filter(p=>p.kind==='post'),comments:active.filter(p=>p.kind==='comment'&&active.some(q=>q.id===p.parentId)),groups:active.filter(p=>p.kind==='group').map(p=>({...p,joined:joined.has(p.id)})),messages:d.groupId&&(joined.has(d.groupId)||management)?active.filter(p=>p.kind==='message'&&p.groupId===d.groupId):[],presence:[],myLikes:[...likes],blocked:[...blocks],...(management?{members,reports,moderation,audit,allContent:content,inviteToken}:{})};
   }
   if(action==='image')return {image:find(d.target).image};
   if(action==='like'){throttle('like',30);const p=find(d.target);if(likes.has(p.id)){likes.delete(p.id);p.likes--;}else{likes.add(p.id);p.likes++;}}
   else if(action==='joinGroup'||action==='leaveGroup'){const p=find(d.groupId);if(action==='joinGroup'&&!joined.has(p.id)){joined.add(p.id);p.memberCount++;}else if(action==='leaveGroup'&&joined.has(p.id)){joined.delete(p.id);p.memberCount--;}}
   else if(action==='presence')return {ok:true};
   else if(action==='profile'){if(!/^[A-Za-z][A-Za-z0-9_]{2,23}$/.test(d.alias))throw Error('Use a 3–24 character pseudonym.');if(members.some(m=>m!==me()&&m.alias.toLowerCase()===d.alias.toLowerCase()))throw Error('That username is already taken. Choose another.');const rejection=safety(d.alias);if(rejection)return rejection;Object.assign(me(),{alias:d.alias,avatar:d.avatar,gender:d.gender,profession:d.profession,shareProfile:d.shareProfile===true});content.forEach(p=>{if(p.authorId===me().publicId){p.alias=d.alias;p.avatar=d.avatar;}});}
   else if(action==='block'){if(d.unblock)blocks.delete(d.target);else blocks.add(d.target);}
   else if(action==='report'){throttle('report',10);reports.unshift({id:crypto.randomUUID(),targetId:d.target,targetType:d.targetType,reason:d.reason,reporterUid:me().id,authorId:d.targetType==='user'?d.target:find(d.target).authorId,evidence:d.targetType==='user'?null:structuredClone(find(d.target)),status:'open',createdAt:Date.now()});}
   else if(action==='manageUser'){const target=members.find(m=>m.publicId===d.target);if(!target||target.role==='admin')throw Error('Cannot change this member.');target.status=d.status;}
   else if(action==='removeContent'||action==='deleteContent'){const p=find(d.target);if(!admin&&p.authorId!==me().publicId)throw Error('You can only delete your own content.');content.forEach(c=>{if(c.id===p.id||c.parentId===p.id||c.groupId===p.id)c.status=d.disable?'disabled':'removed';});}
   else if(action==='resolveReport'){reports.find(r=>r.id===d.target).status='resolved';}
   else if(action==='rotateToken'){inviteToken='DEMO-'+crypto.randomUUID().slice(0,12).toUpperCase();emit();return {token:inviteToken};}
   else if(action==='addDomain'){const rejection=safety(d.name+' '+d.topics);if(rejection)return rejection;zone.domains.push({id:crypto.randomUUID(),name:d.name,icon:'✦',topics:d.topics.split(',').map(t=>t.trim())});}
   else if(action==='removeDomain')zone.domains=zone.domains.filter(x=>x.id!==d.target);
   else if(action==='resolveItem'){const p=find(d.target);if(!admin&&p.authorId!==me().publicId)throw Error('Only the author can resolve this item.');p.itemStatus='resolved';}
   else if(action==='findMatches')return {matches:[],matchStatus:'demo'};
   else if(['createPost','createGroup','comment','message'].includes(action)){
    if(cooldown>Date.now())throw Error('Posting is temporarily paused after repeated safety violations.');
    throttle(action,action==='message'?20:5);if(['event','announcement'].includes(d.category)&&!admin)throw Error('Only Zone Management can publish official content.');
    const rejection=safety([d.text,d.title,d.place,d.additionalInfo,d.registration].filter(Boolean).join(' '));if(rejection)return rejection;
    let expiresAt=expiry(d.hours||24);
    if(action==='message'&&!joined.has(d.groupId))throw Error('Join this group first.');
    if(d.parentId)expiresAt=find(d.parentId).expiresAt;if(d.groupId)expiresAt=find(d.groupId).expiresAt;
    if(d.eventId)expiresAt=Math.min(expiresAt,find(d.eventId).expiresAt);
    if(d.category==='event'&&(!Number.isFinite(d.startsAt)||d.startsAt<Date.now()||d.startsAt>=expiresAt))throw Error('Event must start in the future and before expiry.');
    const item={...d,id:crypto.randomUUID(),kind:action==='createGroup'?'group':action==='comment'?'comment':action==='message'?'message':'post',...author(),createdAt:Date.now(),expiresAt,status:'active',likes:0,memberCount:1,itemStatus:d.category,sponsored:d.category==='offer'};
    content.unshift(item);if(action==='createGroup')joined.add(item.id);emit();return {id:item.id,matches:[],matchStatus:'demo'};
   }else throw Error('This demo action is unavailable.');
   if(management)audit.unshift({id:crypto.randomUUID(),uid:me().id,action,target:d.target||zone.id,createdAt:Date.now()});emit();return {ok:true};
  }
 };
}
